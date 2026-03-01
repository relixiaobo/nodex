/**
 * SyncManager — coordinates push/pull sync cycles.
 *
 * Lifecycle:
 *   - start() on sign-in (called from workspace-store)
 *   - stop() on sign-out or workspace switch
 *   - syncOnce() runs push then pull
 *   - Interval (30s) + visibilitychange + local-update triggers
 *
 * Cursor persistence:
 *   - lastSeq stored in IndexedDB `sync_cursors` store (same DB as snapshots)
 *   - Updated after pull successfully imports updates + persists snapshot
 */
import {
  dequeuePendingUpdates,
  removePendingUpdates,
  getPendingCount,
} from './pending-queue.js';
import {
  pushUpdate,
  pullUpdates,
  uint8ToBase64,
  base64ToUint8,
  sha256Hex,
  AuthError,
} from './sync-protocol.js';
import { importUpdates, getVersionVector, saveNow } from '../loro-doc.js';
import { openDB, CURSOR_STORE } from '../loro-persistence.js';

const SYNC_INTERVAL_MS = 30_000;
const MAX_PUSH_PER_CYCLE = 20;

export type SyncStatus = 'local-only' | 'synced' | 'syncing' | 'pending' | 'error' | 'offline';

export interface SyncState {
  status: SyncStatus;
  lastSyncedAt: number | null;
  pendingCount: number;
  error: string | null;
}

type StateListener = (state: SyncState) => void;

export class SyncManager {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isSyncing = false;
  private nudgePending = false;
  private workspaceId: string | null = null;
  private accessToken: string | null = null;
  private deviceId: string | null = null;
  private lastSeq = 0;
  private listeners = new Set<StateListener>();
  private visibilityHandler: (() => void) | null = null;
  private sessionToken = 0;

  private state: SyncState = {
    status: 'local-only',
    lastSyncedAt: null,
    pendingCount: 0,
    error: null,
  };

  /** Set a listener for state changes (used by sync-store). */
  onStateChange(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private updateState(partial: Partial<SyncState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private isSessionCurrent(token: number): boolean {
    return token === this.sessionToken;
  }

  getState(): SyncState {
    return this.state;
  }

  /** Current workspace ID (used by loro-doc to enqueue updates under correct key). */
  getWorkspaceId(): string | null {
    return this.workspaceId;
  }

  /** Start sync loop. Call on sign-in or workspace switch. */
  async start(workspaceId: string, accessToken: string, deviceId: string): Promise<void> {
    this.stop();
    const sessionToken = ++this.sessionToken;
    this.workspaceId = workspaceId;
    this.accessToken = accessToken;
    this.deviceId = deviceId;

    // Restore cursor from IndexedDB
    this.lastSeq = await loadCursor(workspaceId);
    if (!this.isSessionCurrent(sessionToken) || this.workspaceId !== workspaceId) return;

    const pending = await getPendingCount(workspaceId);
    if (!this.isSessionCurrent(sessionToken) || this.workspaceId !== workspaceId) return;

    this.updateState({
      status: pending > 0 ? 'pending' : 'synced',
      pendingCount: pending,
      error: null,
      lastSyncedAt: null,
    });

    // Immediate first sync
    void this.syncOnce();

    // Periodic sync
    this.intervalId = setInterval(() => void this.syncOnce(), SYNC_INTERVAL_MS);

    // Sync on tab focus
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') void this.syncOnce();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  /**
   * Wait for the first sync cycle to complete (or timeout).
   * Used during bootstrap when no local snapshot exists — the app waits for
   * server data to be pulled before rendering the UI.
   */
  waitForFirstSync(timeoutMs = 15_000): Promise<void> {
    return new Promise((resolve) => {
      const { status } = this.state;
      // Already completed a sync or not started — resolve immediately
      if (status === 'synced' && this.state.lastSyncedAt !== null) {
        resolve();
        return;
      }
      if (status === 'local-only') {
        resolve(); // No sync configured, don't block
        return;
      }

      const timer = setTimeout(() => {
        unsub();
        console.warn('[sync] waitForFirstSync timed out after', timeoutMs, 'ms');
        resolve(); // Don't block forever
      }, timeoutMs);

      const unsub = this.onStateChange((s) => {
        if (s.status === 'synced' || s.status === 'error') {
          clearTimeout(timer);
          unsub();
          resolve();
        }
      });
    });
  }

  /** Stop sync loop. Call on sign-out or workspace switch. */
  stop(): void {
    this.sessionToken += 1;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.visibilityHandler && typeof window !== 'undefined') {
      window.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    this.workspaceId = null;
    this.accessToken = null;
    this.deviceId = null;
    this.lastSeq = 0;
    this.isSyncing = false;
    this.nudgePending = false;
    this.updateState({ status: 'local-only', error: null, pendingCount: 0, lastSyncedAt: null });
  }

  /** Trigger a sync cycle (debounced — skips if already syncing). */
  async syncOnce(): Promise<void> {
    if (this.isSyncing || !this.workspaceId || !this.accessToken || !this.deviceId) return;
    if (!navigator.onLine) {
      this.updateState({ status: 'offline' });
      return;
    }

    const sessionToken = this.sessionToken;
    const workspaceId = this.workspaceId;
    const accessToken = this.accessToken;
    const deviceId = this.deviceId;

    this.isSyncing = true;
    this.nudgePending = false;
    this.updateState({ status: 'syncing' });

    try {
      await this.push(workspaceId, accessToken, deviceId, sessionToken);
      if (!this.isSessionCurrent(sessionToken)) return;

      await this.pull(workspaceId, accessToken, deviceId, sessionToken);
      if (!this.isSessionCurrent(sessionToken)) return;

      const pending = await getPendingCount(workspaceId);
      if (!this.isSessionCurrent(sessionToken)) return;

      this.updateState({
        status: pending > 0 ? 'pending' : 'synced',
        lastSyncedAt: Date.now(),
        pendingCount: pending,
        error: null,
      });
    } catch (err: unknown) {
      if (!this.isSessionCurrent(sessionToken)) return;
      if (err instanceof AuthError) {
        this.updateState({ status: 'error', error: 'Session expired — please sign in again' });
        this.stop();
      } else {
        const msg = err instanceof Error ? err.message : 'Unknown sync error';
        console.error('[sync] error:', msg);
        this.updateState({ status: 'error', error: msg });
      }
    } finally {
      if (!this.isSessionCurrent(sessionToken)) return;
      this.isSyncing = false;
      // If nudge arrived while syncing, run another cycle immediately
      if (this.nudgePending) {
        this.nudgePending = false;
        void this.syncOnce();
      }
    }
  }

  /** Trigger sync immediately (called when local updates are enqueued). */
  nudge(): void {
    if (this.isSyncing) {
      this.nudgePending = true;
      return;
    }
    void this.syncOnce();
  }

  // -------------------------------------------------------------------------
  // Push: pending queue → server
  // -------------------------------------------------------------------------

  private async push(
    workspaceId: string,
    accessToken: string,
    deviceId: string,
    sessionToken: number,
  ): Promise<void> {
    const updates = await dequeuePendingUpdates(workspaceId, MAX_PUSH_PER_CYCLE);
    if (updates.length === 0 || !this.isSessionCurrent(sessionToken)) return;

    const vv = getVersionVector();
    const clientVV = uint8ToBase64(vv.encode());

    for (const update of updates) {
      if (!this.isSessionCurrent(sessionToken)) return;

      const b64 = uint8ToBase64(update.data);
      const hash = await sha256Hex(update.data);
      if (!this.isSessionCurrent(sessionToken)) return;

      await pushUpdate(accessToken, {
        workspaceId,
        deviceId,
        updates: b64,
        updateHash: hash,
        clientVV,
      });
      if (!this.isSessionCurrent(sessionToken)) return;

      // Remove from queue after successful push
      await removePendingUpdates([update.id]);
    }
  }

  // -------------------------------------------------------------------------
  // Pull: server → doc.import()
  // -------------------------------------------------------------------------

  private async pull(
    workspaceId: string,
    accessToken: string,
    deviceId: string,
    sessionToken: number,
  ): Promise<void> {
    let hasMore = true;
    let cursor = this.lastSeq;

    while (hasMore) {
      if (!this.isSessionCurrent(sessionToken)) return;

      const response = await pullUpdates(accessToken, {
        workspaceId,
        deviceId,
        lastSeq: cursor,
      });
      if (!this.isSessionCurrent(sessionToken)) return;

      // Import snapshot if provided
      if (response.type === 'snapshot' && response.snapshot) {
        const snapshotBytes = base64ToUint8(response.snapshot);
        importUpdates(snapshotBytes);
      }

      // Import incremental updates
      for (const entry of response.updates) {
        const bytes = base64ToUint8(entry.data);
        importUpdates(bytes);
      }

      // Advance cursor (must use server's nextCursorSeq, not our own calculation)
      cursor = response.nextCursorSeq;
      hasMore = response.hasMore;
    }

    if (!this.isSessionCurrent(sessionToken)) return;

    // Persist: save snapshot + cursor atomically
    if (cursor > this.lastSeq) {
      this.lastSeq = cursor;
      await saveNow();
      if (!this.isSessionCurrent(sessionToken)) return;
      await saveCursor(workspaceId, cursor);
    }
  }
}

// ---------------------------------------------------------------------------
// Cursor persistence (IndexedDB)
// ---------------------------------------------------------------------------

async function loadCursor(workspaceId: string): Promise<number> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(CURSOR_STORE, 'readonly');
      const store = tx.objectStore(CURSOR_STORE);
      const req = store.get(workspaceId);
      req.onsuccess = () => {
        const val = req.result as { lastSeq: number } | undefined;
        resolve(val?.lastSeq ?? 0);
      };
      req.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

async function saveCursor(workspaceId: string, lastSeq: number): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CURSOR_STORE, 'readwrite');
      const store = tx.objectStore(CURSOR_STORE);
      const req = store.put({ lastSeq, savedAt: Date.now() }, workspaceId);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject((e.target as IDBTransaction).error);
      tx.onabort = (e) => reject((e.target as IDBTransaction).error);
      req.onerror = (e) => reject((e.target as IDBRequest).error);
    });
  } catch (e) {
    console.warn('[sync] Failed to save cursor:', e);
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const syncManager = new SyncManager();

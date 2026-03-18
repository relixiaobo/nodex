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
import { importUpdatesBatch, getVersionVector, saveNow, saveNowRecovery, isWasmPoisoned } from '../loro-doc.js';
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

class ChatSyncAuthError extends Error {
  constructor() { super('Chat sync auth expired'); }
}

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

    // Restore cursors from IndexedDB
    this.lastSeq = await loadCursor(workspaceId);
    this.chatLastPullAt = await loadChatPullCursor(workspaceId);
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
    this.chatLastPullAt = 0;
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
      if (!this.isSessionCurrent(sessionToken)) { console.warn('[sync] session changed after push'); return; }

      const caughtUp = await this.pull(workspaceId, accessToken, deviceId, sessionToken);
      if (!this.isSessionCurrent(sessionToken)) { console.warn('[sync] session changed after pull'); return; }

      // If WASM was poisoned during pull, stop sync permanently.
      // pull() already tried to save what was imported and advanced the cursor.
      if (isWasmPoisoned()) {
        this.updateState({ status: 'error', error: 'Data engine error — please reload' });
        this.stop();
        return;
      }

      // Chat session sync (independent of Loro CRDT sync)
      await this.syncChatSessions(workspaceId, accessToken, sessionToken);
      if (!this.isSessionCurrent(sessionToken)) return;

      const pending = await getPendingCount(workspaceId);
      if (!this.isSessionCurrent(sessionToken)) return;

      const fullySynced = pending === 0 && caughtUp;
      this.updateState({
        status: fullySynced ? 'synced' : 'pending',
        lastSyncedAt: Date.now(),
        pendingCount: pending,
        error: null,
      });

      // If pull didn't fully catch up, schedule another cycle immediately
      if (!caughtUp) {
        this.nudgePending = true;
      }
    } catch (err: unknown) {
      console.error('[sync] syncOnce error:', err);
      if (!this.isSessionCurrent(sessionToken)) return;
      if (err instanceof AuthError) {
        this.updateState({ status: 'error', error: 'Session expired — please sign in again' });
        this.stop();
      } else if (err instanceof WebAssembly.RuntimeError) {
        // WASM engine is poisoned — stop sync permanently (only page reload can recover)
        this.updateState({ status: 'error', error: 'Data engine error — please reload' });
        this.stop();
      } else {
        const msg = err instanceof Error ? err.message : 'Unknown sync error';
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

  /** Returns true if fully caught up (no more pages to pull). */
  private async pull(
    workspaceId: string,
    accessToken: string,
    deviceId: string,
    sessionToken: number,
  ): Promise<boolean> {
    let hasMore = true;
    let cursor = this.lastSeq;
    const MAX_PULL_PAGES = 50; // Safety limit: 50 pages × 200 updates = 10,000 max
    let pages = 0;

    while (hasMore && pages < MAX_PULL_PAGES) {
      pages++;
      if (!this.isSessionCurrent(sessionToken)) return false;

      const response = await pullUpdates(accessToken, {
        workspaceId,
        deviceId,
        lastSeq: cursor,
      });
      if (!this.isSessionCurrent(sessionToken)) return false;

      // Batch-import all updates for this response (rebuild mappings + notify once)
      const bytesToImport: Uint8Array[] = [];

      if (response.type === 'snapshot' && response.snapshot) {
        const snapshotBytes = base64ToUint8(response.snapshot);
        bytesToImport.push(snapshotBytes);
      }

      for (const entry of response.updates) {
        bytesToImport.push(base64ToUint8(entry.data));
      }

      if (bytesToImport.length > 0) {
        console.log(
          `[sync] pull page ${pages}: importing ${bytesToImport.length} chunks`,
          `(type=${response.type}, updates=${response.updates.length}, cursor=${cursor})`,
        );
        const result = importUpdatesBatch(bytesToImport);

        if (result.skipped > 0) {
          console.warn(`[sync] Skipped ${result.skipped} corrupt chunks (imported ${result.imported})`);
        }

        if (result.poisoned) {
          // WASM is poisoned — try to save what was imported before the failure.
          // saveNowRecovery bypasses the _wasmPoisoned guard since the data from
          // successfully imported chunks may still be exportable.
          if (result.imported > 0) {
            try { await saveNowRecovery(); } catch (e) {
              console.warn('[sync] Recovery save failed (WASM too damaged):', e);
            }
          }
          // Advance cursor past this entire batch to avoid re-importing the
          // same corrupt data on next sync. The user loses data in the skipped
          // chunks but the app remains functional after reload.
          cursor = response.nextCursorSeq;
          hasMore = false; // Exit pull loop
          break;
        }
      }

      // Advance cursor (must use server's nextCursorSeq, not our own calculation)
      cursor = response.nextCursorSeq;
      hasMore = response.hasMore;
    }

    if (!this.isSessionCurrent(sessionToken)) return false;

    // Persist: save snapshot + cursor atomically.
    // In the poisoned recovery path, saveNowRecovery() was already called above,
    // but we still need to persist the cursor to skip past corrupt chunks on reload.
    if (cursor > this.lastSeq) {
      this.lastSeq = cursor;
      if (!isWasmPoisoned()) {
        await saveNow();
        if (!this.isSessionCurrent(sessionToken)) return false;
      }
      await saveCursor(workspaceId, cursor);
    }

    return !hasMore;
  }

  // ── Chat session sync ────────────────────────────────────────────

  private chatLastPullAt = 0; // Restored from IndexedDB in start(), persisted in pullChatSessions()

  private async syncChatSessions(
    workspaceId: string,
    accessToken: string,
    sessionToken: number,
  ): Promise<void> {
    try {
      if (!this.isSessionCurrent(sessionToken)) return;
      await this.pushChatSessions(workspaceId, accessToken, sessionToken);
      if (!this.isSessionCurrent(sessionToken)) return;
      await this.pullChatSessions(workspaceId, accessToken, sessionToken);
    } catch (err) {
      if (err instanceof ChatSyncAuthError) {
        console.error('[sync] chat auth expired, skipping until next session');
        return;
      }
      console.warn('[sync] chat sync error:', err);
    }
  }

  private async pushChatSessions(
    workspaceId: string,
    accessToken: string,
    sessionToken: number,
  ): Promise<void> {
    const { getDirtyChatSessions, markSessionSynced } = await import('../ai-persistence.js');
    const dirty = await getDirtyChatSessions();
    if (dirty.length === 0) return;
    console.log(`[sync] chat: pushing ${dirty.length} dirty session(s)`);

    const baseUrl = this.getApiUrl();

    for (const session of dirty) {
      if (!this.isSessionCurrent(sessionToken)) return;

      try {
        const res = await fetch(`${baseUrl}/api/chat/sessions/${session.id}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            session,
            baseRevision: session.revision,
            workspaceId,
          }),
        });

        if (!this.isSessionCurrent(sessionToken)) return;
        if (res.status === 401) throw new ChatSyncAuthError();

        if (res.ok) {
          const { revision } = await res.json() as { revision: number };
          console.log(`[sync] chat: pushed ${session.id} → revision ${revision}`);
          await markSessionSynced(session.id, revision);
          await this.updateInMemorySessionSync(session.id, revision);
        } else if (res.status === 409) {
          const { remoteSession, remoteRevision } = await res.json() as {
            remoteSession: unknown;
            remoteRevision: number;
          };
          if (remoteSession) {
            const { importRemoteSession } = await import('../ai-persistence.js');
            const result = await importRemoteSession(remoteSession as any, remoteRevision);
            console.warn(`[sync] chat push conflict for ${session.id}: ${result}`);
            await this.updateInMemorySessionSync(session.id, remoteRevision);
          }
        }
      } catch (err) {
        if (err instanceof ChatSyncAuthError) throw err;
      }
    }
  }

  private async pullChatSessions(
    workspaceId: string,
    accessToken: string,
    sessionToken: number,
  ): Promise<void> {
    const baseUrl = this.getApiUrl();

    const res = await fetch(
      `${baseUrl}/api/chat/sessions?workspaceId=${encodeURIComponent(workspaceId)}&since=${this.chatLastPullAt}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!this.isSessionCurrent(sessionToken)) return;
    if (res.status === 401) throw new ChatSyncAuthError();
    if (!res.ok) return;

    const { sessions, metas, hasMore } = await res.json() as {
      sessions: unknown[];
      metas: Array<{ id: string; revision: number; updatedAt: number }>;
      hasMore?: boolean;
    };

    if (sessions.length === 0) return;

    const { importRemoteSession } = await import('../ai-persistence.js');

    // Check which sessions have an active streaming agent — skip those
    let streamingSessionIds: Set<string>;
    try {
      const { agentRegistry } = await import('../ai-service.js');
      streamingSessionIds = new Set<string>();
      for (const [sid, agent] of agentRegistry) {
        if (agent.state.isStreaming) streamingSessionIds.add(sid);
      }
    } catch {
      streamingSessionIds = new Set();
    }

    // P1-5: Track cursor advancement carefully — don't skip past streaming sessions
    let maxImportedAt = this.chatLastPullAt;
    let skippedAny = false;

    for (let i = 0; i < sessions.length; i++) {
      if (!this.isSessionCurrent(sessionToken)) return;

      const session = sessions[i];
      const meta = metas[i];
      if (!session || !meta) continue;

      // Skip sessions with active streaming to avoid overwriting in-flight data
      if (streamingSessionIds.has(meta.id)) {
        console.log(`[sync] chat: skipping pull for ${meta.id} (streaming)`);
        skippedAny = true;
        continue; // Don't advance cursor past this
      }

      const result = await importRemoteSession(session as any, meta.revision);
      if (result !== 'skipped') {
        await this.updateInMemorySessionSync(meta.id, meta.revision);
      }
      if (result === 'conflict') {
        console.warn(`[sync] chat pull conflict for ${meta.id}: remote wins (LWW)`);
      }

      if (meta.updatedAt > maxImportedAt) {
        maxImportedAt = meta.updatedAt;
      }
    }

    // P1-5: Only advance cursor if no sessions were skipped.
    // Skipped sessions need to be re-pulled next cycle.
    if (!skippedAny && maxImportedAt > this.chatLastPullAt) {
      this.chatLastPullAt = maxImportedAt;
      await saveChatPullCursor(workspaceId, maxImportedAt);
    }

    // If server indicated more pages, schedule another sync cycle
    if (hasMore) {
      this.nudgePending = true;
    }
  }

  private async updateInMemorySessionSync(sessionId: string, revision: number): Promise<void> {
    try {
      const { agentRegistry, getCurrentSession } = await import('../ai-service.js');
      const agent = agentRegistry.get(sessionId);
      if (!agent) return;
      const session = getCurrentSession(agent);
      if (session && session.id === sessionId) {
        session.syncedAt = Date.now();
        session.revision = revision;
      }
    } catch {
      // ai-service not loaded yet — safe to skip
    }
  }

  private getApiUrl(): string {
    return import.meta.env.VITE_SYNC_API_URL ?? 'http://localhost:8787';
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
    await new Promise<void>((resolve, reject) => {
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
// Chat pull cursor persistence (reuses same IndexedDB as Loro cursors)
// ---------------------------------------------------------------------------

const CHAT_CURSOR_PREFIX = 'chat:';

async function loadChatPullCursor(workspaceId: string): Promise<number> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(CURSOR_STORE, 'readonly');
      const store = tx.objectStore(CURSOR_STORE);
      const req = store.get(`${CHAT_CURSOR_PREFIX}${workspaceId}`);
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

async function saveChatPullCursor(workspaceId: string, lastPullAt: number): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CURSOR_STORE, 'readwrite');
      const store = tx.objectStore(CURSOR_STORE);
      const req = store.put({ lastSeq: lastPullAt, savedAt: Date.now() }, `${CHAT_CURSOR_PREFIX}${workspaceId}`);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject((e.target as IDBTransaction).error);
      tx.onabort = (e) => reject((e.target as IDBTransaction).error);
      req.onerror = (e) => reject((e.target as IDBRequest).error);
    });
  } catch (e) {
    console.warn('[sync] Failed to save chat pull cursor:', e);
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const syncManager = new SyncManager();

/**
 * SyncManager integration tests.
 *
 * Mocks: pending-queue, sync-protocol, loro-doc, loro-persistence.
 * Tests the full push/pull lifecycle, state transitions, error handling.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

// ============================================================
// Mocks — declared before SyncManager import
// ============================================================

const mockDequeuePendingUpdates = vi.fn<[], Promise<Array<{ id: string; data: Uint8Array; workspaceId: string; createdAt: number }>>>();
const mockRemovePendingUpdates = vi.fn<[string[]], Promise<void>>();
const mockGetPendingCount = vi.fn<[string], Promise<number>>();

vi.mock('../../src/lib/sync/pending-queue.js', () => ({
  dequeuePendingUpdates: (...args: unknown[]) => mockDequeuePendingUpdates(...args as []),
  removePendingUpdates: (...args: unknown[]) => mockRemovePendingUpdates(...(args as [string[]])),
  getPendingCount: (...args: unknown[]) => mockGetPendingCount(...(args as [string])),
}));

const mockPushUpdate = vi.fn();
const mockPullUpdates = vi.fn();
const mockSha256Hex = vi.fn();

vi.mock('../../src/lib/sync/sync-protocol.js', () => ({
  pushUpdate: (...args: unknown[]) => mockPushUpdate(...args),
  pullUpdates: (...args: unknown[]) => mockPullUpdates(...args),
  uint8ToBase64: (bytes: Uint8Array) => {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  },
  base64ToUint8: (b64: string) => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  },
  sha256Hex: (...args: unknown[]) => mockSha256Hex(...args),
  AuthError: class AuthError extends Error {
    constructor(msg: string) { super(msg); this.name = 'AuthError'; }
  },
  SyncError: class SyncError extends Error {
    constructor(msg: string) { super(msg); this.name = 'SyncError'; }
  },
}));

const mockImportUpdates = vi.fn();
const mockGetVersionVector = vi.fn();
const mockSaveNow = vi.fn();

vi.mock('../../src/lib/loro-doc.js', () => ({
  importUpdates: (...args: unknown[]) => mockImportUpdates(...args),
  getVersionVector: () => mockGetVersionVector(),
  saveNow: () => mockSaveNow(),
}));

// Fake cursor store for IndexedDB cursor persistence
const cursorStore = new Map<string, unknown>();

function makeFakeDB() {
  return {
    transaction: (_storeName: string, _mode?: string) => {
      const store = {
        get: (key: string) => {
          const req = {
            onsuccess: null as ((e: Event) => void) | null,
            onerror: null as ((e: Event) => void) | null,
            result: undefined as unknown,
          };
          queueMicrotask(() => {
            req.result = cursorStore.get(key);
            req.onsuccess?.({ target: req } as unknown as Event);
          });
          return req;
        },
        put: (value: unknown, key: string) => {
          const req = {
            onsuccess: null as ((e: Event) => void) | null,
            onerror: null as ((e: Event) => void) | null,
          };
          queueMicrotask(() => {
            cursorStore.set(key, value);
            req.onsuccess?.({ target: req } as unknown as Event);
          });
          return req;
        },
      };
      return { objectStore: (_name: string) => store };
    },
  };
}

const mockOpenDB = vi.fn(() => Promise.resolve(makeFakeDB()));

vi.mock('../../src/lib/loro-persistence.js', () => ({
  openDB: (...args: unknown[]) => mockOpenDB(...args as []),
  CURSOR_STORE: 'sync_cursors',
}));

// ============================================================
// Import SyncManager (after mocks)
// ============================================================

import { SyncManager } from '../../src/lib/sync/sync-manager.js';

// Re-import AuthError from mock to use instanceof checks
const { AuthError } = await import('../../src/lib/sync/sync-protocol.js');

// ============================================================
// Helpers
// ============================================================

function createManager(): SyncManager {
  return new SyncManager();
}

/** Wait for async microtasks (start() fires void syncOnce internally). */
async function flushAsync(): Promise<void> {
  await new Promise((r) => setTimeout(r, 20));
}

// ============================================================
// Tests
// ============================================================

describe('SyncManager', () => {
  let mgr: SyncManager;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    cursorStore.clear();

    // Apply all mock implementations
    mockOpenDB.mockImplementation(() => Promise.resolve(makeFakeDB()));
    mockGetVersionVector.mockReturnValue({ encode: () => new Uint8Array([1, 2]) });
    mockSaveNow.mockResolvedValue(undefined);
    mockSha256Hex.mockResolvedValue('fakehash0123456789abcdef');
    mockImportUpdates.mockReset();

    // Defaults: empty queue, no pending, empty pull response
    mockDequeuePendingUpdates.mockResolvedValue([]);
    mockRemovePendingUpdates.mockResolvedValue(undefined);
    mockGetPendingCount.mockResolvedValue(0);
    mockPushUpdate.mockResolvedValue({ seq: 1, deduped: false, serverVV: null });
    mockPullUpdates.mockResolvedValue({
      type: 'incremental',
      updates: [],
      latestSeq: 0,
      nextCursorSeq: 0,
      hasMore: false,
    });

    // navigator.onLine default
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });

    mgr = createManager();
  });

  afterEach(() => {
    mgr.stop();
    vi.useRealTimers();
  });

  // ------------------------------------------------------------------
  // Lifecycle & state transitions
  // ------------------------------------------------------------------

  describe('lifecycle', () => {
    it('initial state is local-only', () => {
      expect(mgr.getState()).toMatchObject({
        status: 'local-only',
        lastSyncedAt: null,
        pendingCount: 0,
        error: null,
      });
    });

    it('start() transitions to synced when no pending updates', async () => {
      const states: string[] = [];
      mgr.onStateChange((s) => states.push(s.status));

      await mgr.start('ws_1', 'tok_1', 'dev_1');
      await flushAsync();

      // Should have gone through: pending/synced (from start), syncing (from syncOnce), synced
      expect(mgr.getState().status).toBe('synced');
      expect(states).toContain('syncing');
      expect(states).toContain('synced');
    });

    it('start() transitions to pending when queue is non-empty', async () => {
      mockGetPendingCount.mockResolvedValue(3);

      // Make syncOnce also see 3 pending after push/pull
      const states: string[] = [];
      mgr.onStateChange((s) => states.push(s.status));

      await mgr.start('ws_1', 'tok_1', 'dev_1');
      // After start, before syncOnce resolves, initial status should be 'pending'
      expect(states).toContain('pending');
    });

    it('stop() resets to local-only and clears credentials', async () => {
      await mgr.start('ws_1', 'tok_1', 'dev_1');
      await flushAsync();

      mgr.stop();

      expect(mgr.getState()).toMatchObject({
        status: 'local-only',
        pendingCount: 0,
        error: null,
      });
    });

    it('stop() clears interval timer', async () => {
      await mgr.start('ws_1', 'tok_1', 'dev_1');
      await flushAsync();

      vi.clearAllMocks();
      mgr.stop();

      // Advance 60s — no more syncOnce calls
      await vi.advanceTimersByTimeAsync(60_000);
      expect(mockPullUpdates).not.toHaveBeenCalled();
    });

    it('start() stops previous session before starting new one', async () => {
      await mgr.start('ws_1', 'tok_1', 'dev_1');
      await flushAsync();

      vi.clearAllMocks();

      await mgr.start('ws_2', 'tok_2', 'dev_2');
      await flushAsync();

      // pull should use ws_2
      expect(mockPullUpdates).toHaveBeenCalledWith('tok_2', expect.objectContaining({
        workspaceId: 'ws_2',
        deviceId: 'dev_2',
      }));
    });
  });

  // ------------------------------------------------------------------
  // Push flow
  // ------------------------------------------------------------------

  describe('push', () => {
    it('pushes pending updates and removes from queue on success', async () => {
      const fakeData = new Uint8Array([10, 20, 30]);
      mockDequeuePendingUpdates.mockResolvedValue([
        { id: 'u1', data: fakeData, workspaceId: 'ws_1', createdAt: 1000 },
      ]);

      await mgr.start('ws_1', 'tok_1', 'dev_1');
      await flushAsync();

      expect(mockPushUpdate).toHaveBeenCalledWith('tok_1', expect.objectContaining({
        workspaceId: 'ws_1',
        deviceId: 'dev_1',
        updateHash: 'fakehash0123456789abcdef',
      }));
      expect(mockRemovePendingUpdates).toHaveBeenCalledWith(['u1']);
    });

    it('pushes multiple updates sequentially', async () => {
      mockDequeuePendingUpdates.mockResolvedValue([
        { id: 'u1', data: new Uint8Array([1]), workspaceId: 'ws_1', createdAt: 1000 },
        { id: 'u2', data: new Uint8Array([2]), workspaceId: 'ws_1', createdAt: 1001 },
      ]);

      await mgr.start('ws_1', 'tok_1', 'dev_1');
      await flushAsync();

      expect(mockPushUpdate).toHaveBeenCalledTimes(2);
      expect(mockRemovePendingUpdates).toHaveBeenCalledWith(['u1']);
      expect(mockRemovePendingUpdates).toHaveBeenCalledWith(['u2']);
    });

    it('skips push when queue is empty', async () => {
      mockDequeuePendingUpdates.mockResolvedValue([]);

      await mgr.start('ws_1', 'tok_1', 'dev_1');
      await flushAsync();

      expect(mockPushUpdate).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------
  // Pull flow
  // ------------------------------------------------------------------

  describe('pull', () => {
    it('imports incremental updates from server', async () => {
      const b64Data = btoa(String.fromCharCode(40, 50, 60));
      mockPullUpdates.mockResolvedValue({
        type: 'incremental',
        updates: [
          { seq: 1, data: b64Data, deviceId: 'other_dev' },
        ],
        latestSeq: 1,
        nextCursorSeq: 1,
        hasMore: false,
      });

      await mgr.start('ws_1', 'tok_1', 'dev_1');
      await flushAsync();

      expect(mockImportUpdates).toHaveBeenCalledWith(new Uint8Array([40, 50, 60]));
      expect(mockSaveNow).toHaveBeenCalled();
    });

    it('imports snapshot + incremental updates in snapshot response', async () => {
      const snapshotB64 = btoa(String.fromCharCode(100, 101));
      const updateB64 = btoa(String.fromCharCode(200, 201));
      mockPullUpdates.mockResolvedValue({
        type: 'snapshot',
        snapshot: snapshotB64,
        snapshotSeq: 5,
        updates: [
          { seq: 6, data: updateB64, deviceId: 'other_dev' },
        ],
        latestSeq: 6,
        nextCursorSeq: 6,
        hasMore: false,
      });

      await mgr.start('ws_1', 'tok_1', 'dev_1');
      await flushAsync();

      // Snapshot imported first, then incremental
      expect(mockImportUpdates).toHaveBeenCalledTimes(2);
      expect(mockImportUpdates).toHaveBeenCalledWith(new Uint8Array([100, 101]));
      expect(mockImportUpdates).toHaveBeenCalledWith(new Uint8Array([200, 201]));
    });

    it('handles paginated pull (hasMore = true)', async () => {
      const page1B64 = btoa(String.fromCharCode(1));
      const page2B64 = btoa(String.fromCharCode(2));

      mockPullUpdates
        .mockResolvedValueOnce({
          type: 'incremental',
          updates: [{ seq: 1, data: page1B64, deviceId: 'o' }],
          latestSeq: 2,
          nextCursorSeq: 1,
          hasMore: true,
        })
        .mockResolvedValueOnce({
          type: 'incremental',
          updates: [{ seq: 2, data: page2B64, deviceId: 'o' }],
          latestSeq: 2,
          nextCursorSeq: 2,
          hasMore: false,
        });

      await mgr.start('ws_1', 'tok_1', 'dev_1');
      await flushAsync();

      expect(mockPullUpdates).toHaveBeenCalledTimes(2);
      expect(mockImportUpdates).toHaveBeenCalledTimes(2);
      // Second pull should use nextCursorSeq=1 from first response
      expect(mockPullUpdates).toHaveBeenNthCalledWith(2, 'tok_1', expect.objectContaining({
        lastSeq: 1,
      }));
    });

    it('does not save when no new updates from server', async () => {
      mockPullUpdates.mockResolvedValue({
        type: 'incremental',
        updates: [],
        latestSeq: 0,
        nextCursorSeq: 0,
        hasMore: false,
      });

      await mgr.start('ws_1', 'tok_1', 'dev_1');
      await flushAsync();

      expect(mockSaveNow).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------
  // Cursor persistence
  // ------------------------------------------------------------------

  describe('cursor persistence', () => {
    it('saves cursor to IndexedDB after successful pull with new data', async () => {
      const b64 = btoa(String.fromCharCode(1));
      mockPullUpdates.mockResolvedValue({
        type: 'incremental',
        updates: [{ seq: 5, data: b64, deviceId: 'o' }],
        latestSeq: 5,
        nextCursorSeq: 5,
        hasMore: false,
      });

      await mgr.start('ws_1', 'tok_1', 'dev_1');
      await flushAsync();

      // Cursor should be saved in the fake store
      expect(cursorStore.has('ws_1')).toBe(true);
      const saved = cursorStore.get('ws_1') as { lastSeq: number };
      expect(saved.lastSeq).toBe(5);
    });

    it('restores cursor from IndexedDB on start', async () => {
      // Pre-seed cursor
      cursorStore.set('ws_1', { lastSeq: 10, savedAt: Date.now() });

      await mgr.start('ws_1', 'tok_1', 'dev_1');
      await flushAsync();

      // Pull should be called with lastSeq=10 (restored)
      expect(mockPullUpdates).toHaveBeenCalledWith('tok_1', expect.objectContaining({
        lastSeq: 10,
      }));
    });
  });

  // ------------------------------------------------------------------
  // Offline handling
  // ------------------------------------------------------------------

  describe('offline handling', () => {
    it('syncOnce sets status to offline when navigator.onLine is false', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

      await mgr.start('ws_1', 'tok_1', 'dev_1');
      await flushAsync();

      expect(mgr.getState().status).toBe('offline');
      // Should not have called push or pull
      expect(mockPushUpdate).not.toHaveBeenCalled();
      expect(mockPullUpdates).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------
  // Error handling
  // ------------------------------------------------------------------

  describe('error handling', () => {
    it('AuthError from push → status error then stop resets to local-only', async () => {
      mockDequeuePendingUpdates.mockResolvedValue([
        { id: 'u1', data: new Uint8Array([1]), workspaceId: 'ws_1', createdAt: 1 },
      ]);
      mockPushUpdate.mockRejectedValue(new AuthError('Session expired'));

      const states: Array<{ status: string; error: string | null }> = [];
      mgr.onStateChange((s) => states.push({ status: s.status, error: s.error }));

      await mgr.start('ws_1', 'tok_1', 'dev_1');
      await flushAsync();

      // stop() is called after setting error, which resets to local-only
      expect(mgr.getState().status).toBe('local-only');
      // The 'error' state was emitted before stop()
      const errorState = states.find((s) => s.status === 'error');
      expect(errorState).toBeTruthy();
      expect(errorState!.error).toContain('Session expired');
    });

    it('AuthError from pull → status error + stop', async () => {
      mockPullUpdates.mockRejectedValue(new AuthError('Session expired'));

      await mgr.start('ws_1', 'tok_1', 'dev_1');
      await flushAsync();

      // stop() resets to local-only
      expect(mgr.getState().status).toBe('local-only');
    });

    it('generic Error from push → status error, does NOT stop', async () => {
      mockDequeuePendingUpdates.mockResolvedValue([
        { id: 'u1', data: new Uint8Array([1]), workspaceId: 'ws_1', createdAt: 1 },
      ]);
      mockPushUpdate.mockRejectedValue(new Error('Network failure'));

      // Suppress expected console.error
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await mgr.start('ws_1', 'tok_1', 'dev_1');
      await flushAsync();

      expect(mgr.getState().status).toBe('error');
      expect(mgr.getState().error).toBe('Network failure');

      consoleSpy.mockRestore();
    });

    it('generic Error from pull → status error with message', async () => {
      mockPullUpdates.mockRejectedValue(new Error('Server 500'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await mgr.start('ws_1', 'tok_1', 'dev_1');
      await flushAsync();

      expect(mgr.getState().status).toBe('error');
      expect(mgr.getState().error).toBe('Server 500');

      consoleSpy.mockRestore();
    });
  });

  // ------------------------------------------------------------------
  // Periodic sync & nudge
  // ------------------------------------------------------------------

  describe('periodic sync & nudge', () => {
    it('runs syncOnce on 30s interval', async () => {
      await mgr.start('ws_1', 'tok_1', 'dev_1');
      await flushAsync();

      vi.clearAllMocks();

      // Advance 30s
      await vi.advanceTimersByTimeAsync(30_000);
      await flushAsync();

      expect(mockPullUpdates).toHaveBeenCalledTimes(1);
    });

    it('nudge() triggers immediate syncOnce', async () => {
      await mgr.start('ws_1', 'tok_1', 'dev_1');
      await flushAsync();

      vi.clearAllMocks();

      mgr.nudge();
      await flushAsync();

      expect(mockPullUpdates).toHaveBeenCalledTimes(1);
    });

    it('concurrent syncOnce calls are deduplicated (isSyncing guard)', async () => {
      // Make pull slow
      mockPullUpdates.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({
          type: 'incremental',
          updates: [],
          latestSeq: 0,
          nextCursorSeq: 0,
          hasMore: false,
        }), 100)),
      );

      await mgr.start('ws_1', 'tok_1', 'dev_1');
      // Don't flush — syncOnce is still in-flight

      // Nudge while syncing — should be skipped
      mgr.nudge();
      mgr.nudge();

      await vi.advanceTimersByTimeAsync(200);
      await flushAsync();

      // Only 1 pull call (from the initial syncOnce in start)
      expect(mockPullUpdates).toHaveBeenCalledTimes(1);
    });
  });

  // ------------------------------------------------------------------
  // State listener
  // ------------------------------------------------------------------

  describe('onStateChange listener', () => {
    it('fires on every state transition', async () => {
      const transitions: string[] = [];
      mgr.onStateChange((s) => transitions.push(s.status));

      await mgr.start('ws_1', 'tok_1', 'dev_1');
      await flushAsync();

      // At minimum: synced/pending (from start) → syncing → synced
      expect(transitions.length).toBeGreaterThanOrEqual(2);
      expect(transitions[transitions.length - 1]).toBe('synced');
    });

    it('reports pendingCount from getPendingCount', async () => {
      mockGetPendingCount.mockResolvedValue(5);

      const states: Array<{ status: string; pendingCount: number }> = [];
      mgr.onStateChange((s) => states.push({ status: s.status, pendingCount: s.pendingCount }));

      await mgr.start('ws_1', 'tok_1', 'dev_1');
      await flushAsync();

      // Initial state from start() should have pendingCount=5
      const pendingState = states.find((s) => s.pendingCount === 5);
      expect(pendingState).toBeTruthy();
    });
  });

  // ------------------------------------------------------------------
  // syncOnce without start (no credentials)
  // ------------------------------------------------------------------

  describe('guard conditions', () => {
    it('syncOnce is a no-op without start', async () => {
      await mgr.syncOnce();
      await flushAsync();

      expect(mockPullUpdates).not.toHaveBeenCalled();
      expect(mockPushUpdate).not.toHaveBeenCalled();
    });
  });
});

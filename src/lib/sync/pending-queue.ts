/**
 * Pending update queue — IndexedDB-backed offline-safe buffer.
 *
 * Local CRDT mutations are captured via `subscribeLocalUpdates()` and
 * enqueued here. SyncManager dequeues and pushes to server.
 *
 * Storage: reuses the `nodex` IndexedDB instance (v2) with the
 * `pending_updates` object store (keyPath: 'id', index: 'by_workspace').
 */
import { nanoid } from 'nanoid';
import { openDB, PENDING_STORE } from '../loro-persistence.js';

export interface PendingUpdate {
  id: string;           // nanoid — dedup + deletion key
  workspaceId: string;
  data: Uint8Array;     // subscribeLocalUpdates bytes
  createdAt: number;    // Date.now()
}

/** Enqueue a local update for sync. */
export async function enqueuePendingUpdate(
  workspaceId: string,
  data: Uint8Array,
): Promise<void> {
  const record: PendingUpdate = {
    id: nanoid(),
    workspaceId,
    data,
    createdAt: Date.now(),
  };
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, 'readwrite');
    const store = tx.objectStore(PENDING_STORE);
    const req = store.put(record);
    // Resolve only after the transaction commits, otherwise an immediate
    // dequeue/count in the next microtask can race and miss this update.
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject((e.target as IDBTransaction).error);
    tx.onabort = (e) => reject((e.target as IDBTransaction).error);
    req.onerror = (e) => reject((e.target as IDBRequest).error);
  });
}

/** Dequeue pending updates for a workspace (oldest first). */
export async function dequeuePendingUpdates(
  workspaceId: string,
  limit = 50,
): Promise<PendingUpdate[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, 'readonly');
    const store = tx.objectStore(PENDING_STORE);
    const index = store.index('by_workspace');
    const req = index.openCursor(IDBKeyRange.only(workspaceId));
    const results: PendingUpdate[] = [];

    req.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        results.push(cursor.value as PendingUpdate);
        cursor.continue();
      }
    };
    req.onerror = (e) => reject((e.target as IDBRequest).error);
    tx.onerror = (e) => reject((e.target as IDBTransaction).error);
    tx.oncomplete = () => {
      // `by_workspace` groups records but does not guarantee createdAt order
      // (same workspace key falls back to primary key `id`). Preserve FIFO here.
      results.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
      resolve(results.slice(0, limit));
    };
  });
}

/** Remove successfully pushed updates by ID. */
export async function removePendingUpdates(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, 'readwrite');
    const store = tx.objectStore(PENDING_STORE);
    for (const id of ids) {
      store.delete(id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject((e.target as IDBTransaction).error);
  });
}

/** Get count of pending updates for a workspace. */
export async function getPendingCount(workspaceId: string): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, 'readonly');
    const store = tx.objectStore(PENDING_STORE);
    const index = store.index('by_workspace');
    const req = index.count(IDBKeyRange.only(workspaceId));
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject((e.target as IDBRequest).error);
  });
}

/** Clear all pending updates for a workspace (e.g., on sign-out). */
export async function clearPendingUpdates(workspaceId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, 'readwrite');
    const store = tx.objectStore(PENDING_STORE);
    const index = store.index('by_workspace');
    const req = index.openCursor(IDBKeyRange.only(workspaceId));

    req.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject((e.target as IDBTransaction).error);
  });
}

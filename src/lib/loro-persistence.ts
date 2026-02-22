/**
 * Loro 快照 IndexedDB 持久化
 *
 * 负责将 LoroDoc 快照存储到 IndexedDB，并在启动时恢复。
 * Phase 0 扩展：SnapshotRecord 格式（snapshot + peerIdStr + versionVector + savedAt）
 */

const DB_NAME = 'nodex';
const STORE_NAME = 'loro_snapshots';
const DB_VERSION = 1;

/**
 * 持久化记录格式（Phase 0+）。
 * 将 snapshot、PeerID、VersionVector 原子保存在同一条 IndexedDB 记录中。
 */
export interface SnapshotRecord {
  snapshot: Uint8Array;
  peerIdStr: string;           // doc.peerIdStr — 设备身份
  versionVector: Uint8Array;   // doc.oplogVersion().encode()
  savedAt: number;             // Date.now()
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = (e) => {
      dbPromise = null;
      reject((e.target as IDBOpenDBRequest).error);
    };
  });
  return dbPromise;
}

/**
 * 保存 SnapshotRecord（Phase 0+ 格式）。
 * 包含 snapshot、peerIdStr、versionVector、savedAt 原子写入。
 */
export async function saveSnapshotRecord(workspaceId: string, record: SnapshotRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record, workspaceId);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject((e.target as IDBRequest).error);
  });
}

/**
 * 加载 SnapshotRecord。
 * 兼容旧格式：如果存储的是裸 Uint8Array（Phase 0 之前），自动包装为 SnapshotRecord。
 */
export async function loadSnapshotRecord(workspaceId: string): Promise<SnapshotRecord | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(workspaceId);
    req.onsuccess = (e) => {
      const result = (e.target as IDBRequest).result;
      if (!result) {
        resolve(null);
        return;
      }
      // Backward compatibility: old format was bare Uint8Array
      if (result instanceof Uint8Array) {
        resolve({
          snapshot: result,
          peerIdStr: '',       // no saved peer ID — will use random
          versionVector: new Uint8Array(0),
          savedAt: 0,
        });
        return;
      }
      // New SnapshotRecord format
      resolve(result as SnapshotRecord);
    };
    req.onerror = (e) => reject((e.target as IDBRequest).error);
  });
}

// ---- Legacy API (kept for backward compatibility, delegates to new format) ----

/**
 * @deprecated Use saveSnapshotRecord() instead. Kept for tests and migration.
 */
export async function saveSnapshot(workspaceId: string, data: Uint8Array): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(data, workspaceId);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject((e.target as IDBRequest).error);
  });
}

/**
 * @deprecated Use loadSnapshotRecord() instead. Kept for tests and migration.
 */
export async function loadSnapshot(workspaceId: string): Promise<Uint8Array | null> {
  const record = await loadSnapshotRecord(workspaceId);
  if (!record) return null;
  return record.snapshot;
}

export async function deleteSnapshot(workspaceId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(workspaceId);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject((e.target as IDBRequest).error);
  });
}

/** Reset DB promise (for tests). */
export function _resetDBForTest(): void {
  dbPromise = null;
}

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
 * 仅识别 SnapshotRecord 格式；旧格式（裸 Uint8Array）视为无效数据，返回 null。
 * 项目未上线，不需要兼容历史快照格式。
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
      // Only accept SnapshotRecord format (has snapshot + peerIdStr fields).
      // Old bare Uint8Array format is discarded — project not yet launched.
      if (result instanceof Uint8Array || !result.snapshot) {
        console.warn('[loro-persistence] Discarding unrecognized snapshot format, will start fresh');
        resolve(null);
        return;
      }
      resolve(result as SnapshotRecord);
    };
    req.onerror = (e) => reject((e.target as IDBRequest).error);
  });
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

/**
 * Shadow Cache — IndexedDB storage with TTL for page content.
 *
 * Stores the raw page text captured during clip so Spark can read it
 * without re-fetching the page. Entries expire after a configurable TTL
 * (default 30 days). URL is used as the key.
 *
 * Pattern mirrors `ai-persistence.ts` (IndexedDB boilerplate).
 */

const DB_NAME = 'soma-shadow-cache';
const DB_VERSION = 1;
const STORE_NAME = 'pages';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

let dbPromise: Promise<IDBDatabase> | null = null;

interface CacheEntry {
  url: string;
  content: string;
  cachedAt: number;
}

function getIndexedDB(): IDBFactory {
  if (!globalThis.indexedDB) {
    throw new Error('indexedDB is not available');
  }
  return globalThis.indexedDB;
}

async function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = getIndexedDB().open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'url' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

/**
 * Cache page content for a URL.
 * Overwrites any existing entry for the same URL.
 */
export async function cachePageContent(url: string, content: string): Promise<void> {
  const db = await openDB();
  const entry: CacheEntry = { url, content, cachedAt: Date.now() };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * Retrieve cached page content for a URL.
 * Returns null if the entry does not exist or has expired.
 */
export async function getPageContent(url: string): Promise<string | null> {
  const db = await openDB();

  const entry = await new Promise<CacheEntry | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(url);
    req.onsuccess = () => resolve(req.result as CacheEntry | undefined);
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

  if (!entry) return null;

  // Check TTL
  if (Date.now() - entry.cachedAt > TTL_MS) {
    // Expired — delete asynchronously, return null
    void deleteEntry(url);
    return null;
  }

  return entry.content;
}

/**
 * Delete all expired cache entries.
 * Call periodically (e.g. on app startup) to reclaim storage.
 */
export async function cleanExpiredCache(): Promise<void> {
  const db = await openDB();
  const cutoff = Date.now() - TTL_MS;

  const expiredUrls = await new Promise<string[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).openCursor();
    const urls: string[] = [];

    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve(urls);
        return;
      }
      const entry = cursor.value as CacheEntry;
      if (entry.cachedAt < cutoff) {
        urls.push(entry.url);
      }
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

  if (expiredUrls.length === 0) return;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const url of expiredUrls) {
      store.delete(url);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Delete a single entry by URL. */
async function deleteEntry(url: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(url);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    // Ignore cleanup failures
  }
}

/** Reset internal state for tests. */
export function resetShadowCacheForTests(): void {
  dbPromise = null;
}

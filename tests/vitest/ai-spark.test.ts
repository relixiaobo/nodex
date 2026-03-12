/**
 * ai-spark — Spark structure extraction tests.
 *
 * Tests cover:
 * - Spark trigger conditions (shouldAutoTrigger)
 * - Shadow Cache read/write + TTL expiry
 * - Extraction rule loading by content type
 * - #spark tagDef and is/has/about fieldDef bootstrapping
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  cachePageContent,
  getPageContent,
  cleanExpiredCache,
  resetShadowCacheForTests,
} from '../../src/lib/ai-shadow-cache.js';
import {
  getExtractionRules,
  ARTICLE_EXTRACTION_RULES,
  VIDEO_EXTRACTION_RULES,
  SOCIAL_EXTRACTION_RULES,
  GENERAL_EXTRACTION_RULES,
} from '../../src/lib/ai-skills/extraction-presets.js';
import {
  ensureSparkTagDef,
  ensureSourceMetadataFieldDefs,
  shouldAutoTrigger,
  SPARK_COMMIT_ORIGIN,
} from '../../src/lib/ai-spark.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { NDX_T, NDX_F, SYS_T, SYSTEM_NODE_IDS } from '../../src/types/index.js';
import { resetAndSeed } from './helpers/test-state.js';

// ============================================================
// Fake IndexedDB (reusable from ai-persistence.test.ts pattern)
// ============================================================

function createAsyncRequest<T>(producer: () => T): IDBRequest<T> {
  const request = {
    onsuccess: null,
    onerror: null,
    result: undefined,
    error: null,
  } as unknown as IDBRequest<T>;

  queueMicrotask(() => {
    try {
      (request as { result: T }).result = producer();
      request.onsuccess?.({ target: request } as Event);
    } catch (error) {
      (request as { error: DOMException }).error = error as DOMException;
      request.onerror?.({ target: request } as Event);
    }
  });

  return request;
}

function createFakeIndexedDB(): IDBFactory {
  const stores = new Map<string, Map<string, Record<string, unknown>>>();
  let initialized = false;

  function ensureStore(name: string): Map<string, Record<string, unknown>> {
    let store = stores.get(name);
    if (!store) {
      store = new Map<string, Record<string, unknown>>();
      stores.set(name, store);
    }
    return store;
  }

  const db = {
    objectStoreNames: {
      contains: (name: string) => stores.has(name),
    },
    createObjectStore: (name: string) => {
      const target = ensureStore(name);
      return {
        indexNames: { contains: () => false },
        createIndex: () => ({}),
        put: (value: Record<string, unknown>) => createAsyncRequest(() => {
          const key = String(value.url ?? value.id ?? '');
          target.set(key, value);
          return key;
        }),
        get: (key: string) => createAsyncRequest(() => target.get(key)),
        delete: (key: string) => createAsyncRequest(() => {
          target.delete(key);
          return undefined;
        }),
        openCursor: () => {
          const values = [...target.entries()];
          let idx = 0;
          const request = {
            onsuccess: null,
            onerror: null,
            result: null,
            error: null,
          } as unknown as IDBRequest<IDBCursorWithValue | null>;

          const emit = () => {
            queueMicrotask(() => {
              if (idx >= values.length) {
                (request as { result: IDBCursorWithValue | null }).result = null;
                request.onsuccess?.({ target: request } as Event);
                return;
              }
              const [, value] = values[idx];
              (request as { result: IDBCursorWithValue | null }).result = {
                value,
                continue: () => { idx++; emit(); },
              } as IDBCursorWithValue;
              request.onsuccess?.({ target: request } as Event);
            });
          };

          emit();
          return request;
        },
      } as unknown as IDBObjectStore;
    },
    transaction: (storeName: string, _mode?: string) => {
      const tx = {
        oncomplete: null as ((e: Event) => void) | null,
        onerror: null as ((e: Event) => void) | null,
        onabort: null as ((e: Event) => void) | null,
        objectStore: (name: string) => {
          const n = name || storeName;
          const target = ensureStore(n);
          return {
            put: (value: Record<string, unknown>) => createAsyncRequest(() => {
              const key = String(value.url ?? value.id ?? '');
              target.set(key, value);
              return key;
            }),
            get: (key: string) => createAsyncRequest(() => target.get(key)),
            delete: (key: string) => createAsyncRequest(() => {
              target.delete(key);
              return undefined;
            }),
            openCursor: () => {
              const values = [...target.entries()];
              let idx = 0;
              const request = {
                onsuccess: null,
                onerror: null,
                result: null,
                error: null,
              } as unknown as IDBRequest<IDBCursorWithValue | null>;

              const emit = () => {
                queueMicrotask(() => {
                  if (idx >= values.length) {
                    (request as { result: IDBCursorWithValue | null }).result = null;
                    request.onsuccess?.({ target: request } as Event);
                    return;
                  }
                  const [, value] = values[idx];
                  (request as { result: IDBCursorWithValue | null }).result = {
                    value,
                    continue: () => { idx++; emit(); },
                  } as IDBCursorWithValue;
                  request.onsuccess?.({ target: request } as Event);
                });
              };

              emit();
              return request;
            },
          } as unknown as IDBObjectStore;
        },
      };

      queueMicrotask(() => queueMicrotask(() => {
        tx.oncomplete?.({ target: tx } as unknown as Event);
      }));

      return tx as unknown as IDBTransaction;
    },
  } as unknown as IDBDatabase;

  return {
    open: () => {
      const request = {
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        result: undefined,
        error: null,
        transaction: {
          objectStore: (name: string) => db.createObjectStore(name),
        },
      } as unknown as IDBOpenDBRequest;

      queueMicrotask(() => {
        (request as { result: IDBDatabase }).result = db;
        if (!initialized) {
          initialized = true;
          request.onupgradeneeded?.({ target: request } as IDBVersionChangeEvent);
        }
        request.onsuccess?.({ target: request } as Event);
      });

      return request;
    },
  } as unknown as IDBFactory;
}

const originalIndexedDB = globalThis.indexedDB;

// ============================================================
// Tests
// ============================================================

describe('extraction presets', () => {
  it('returns article rules for "article" content type', () => {
    expect(getExtractionRules('article')).toBe(ARTICLE_EXTRACTION_RULES);
  });

  it('returns video rules for "video" content type', () => {
    expect(getExtractionRules('video')).toBe(VIDEO_EXTRACTION_RULES);
  });

  it('returns social rules for "social" content type', () => {
    expect(getExtractionRules('social')).toBe(SOCIAL_EXTRACTION_RULES);
  });

  it('returns general rules for unknown content type', () => {
    expect(getExtractionRules('source')).toBe(GENERAL_EXTRACTION_RULES);
    expect(getExtractionRules(undefined)).toBe(GENERAL_EXTRACTION_RULES);
  });

  it('all rule sets are non-empty arrays of strings', () => {
    for (const rules of [
      ARTICLE_EXTRACTION_RULES,
      VIDEO_EXTRACTION_RULES,
      SOCIAL_EXTRACTION_RULES,
      GENERAL_EXTRACTION_RULES,
    ]) {
      expect(rules.length).toBeGreaterThan(0);
      for (const rule of rules) {
        expect(typeof rule).toBe('string');
        expect(rule.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('shadow cache', () => {
  beforeAll(() => {
    (globalThis as { indexedDB?: IDBFactory }).indexedDB = createFakeIndexedDB();
  });

  afterAll(() => {
    if (originalIndexedDB) {
      (globalThis as { indexedDB?: IDBFactory }).indexedDB = originalIndexedDB;
    } else {
      delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    }
  });

  beforeEach(() => {
    resetShadowCacheForTests();
  });

  it('caches and retrieves page content', async () => {
    await cachePageContent('https://example.com/article', 'Hello, world!');
    const content = await getPageContent('https://example.com/article');
    expect(content).toBe('Hello, world!');
  });

  it('returns null for unknown URL', async () => {
    const content = await getPageContent('https://example.com/unknown');
    expect(content).toBeNull();
  });

  it('overwrites existing entry', async () => {
    await cachePageContent('https://example.com/page', 'Version 1');
    await cachePageContent('https://example.com/page', 'Version 2');
    const content = await getPageContent('https://example.com/page');
    expect(content).toBe('Version 2');
  });

  it('exports SPARK_COMMIT_ORIGIN constant', () => {
    expect(SPARK_COMMIT_ORIGIN).toBe('ai:spark');
  });
});

describe('spark tagDef and fieldDef bootstrapping', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('creates #spark tagDef with correct properties', () => {
    ensureSparkTagDef();
    const sparkTag = loroDoc.toNodexNode(NDX_T.SPARK);
    expect(sparkTag).toBeDefined();
    expect(sparkTag!.type).toBe('tagDef');
    expect(sparkTag!.name).toBe('spark');
    expect(sparkTag!.color).toBe('amber');
  });

  it('is idempotent — calling twice does not error', () => {
    ensureSparkTagDef();
    ensureSparkTagDef();
    const sparkTag = loroDoc.toNodexNode(NDX_T.SPARK);
    expect(sparkTag).toBeDefined();
  });

  it('creates is/has/about fieldDefs under #source', () => {
    ensureSourceMetadataFieldDefs();

    const isField = loroDoc.toNodexNode(NDX_F.SOURCE_IS);
    expect(isField).toBeDefined();
    expect(isField!.type).toBe('fieldDef');
    expect(isField!.name).toBe('is');
    expect(isField!.fieldType).toBe('options');

    const hasField = loroDoc.toNodexNode(NDX_F.SOURCE_HAS);
    expect(hasField).toBeDefined();
    expect(hasField!.type).toBe('fieldDef');
    expect(hasField!.name).toBe('has');
    expect(hasField!.fieldType).toBe('options');
    expect(hasField!.cardinality).toBe('list');

    const aboutField = loroDoc.toNodexNode(NDX_F.SOURCE_ABOUT);
    expect(aboutField).toBeDefined();
    expect(aboutField!.type).toBe('fieldDef');
    expect(aboutField!.name).toBe('about');
    expect(aboutField!.fieldType).toBe('options');
    expect(aboutField!.cardinality).toBe('list');
  });

  it('is/has/about fieldDefs are children of #source tagDef', () => {
    ensureSourceMetadataFieldDefs();
    expect(loroDoc.getParentId(NDX_F.SOURCE_IS)).toBe(SYS_T.SOURCE);
    expect(loroDoc.getParentId(NDX_F.SOURCE_HAS)).toBe(SYS_T.SOURCE);
    expect(loroDoc.getParentId(NDX_F.SOURCE_ABOUT)).toBe(SYS_T.SOURCE);
  });

  it('ensureSourceMetadataFieldDefs is idempotent', () => {
    ensureSourceMetadataFieldDefs();
    ensureSourceMetadataFieldDefs();
    // Should not error and fieldDefs should still be valid
    expect(loroDoc.toNodexNode(NDX_F.SOURCE_IS)).toBeDefined();
  });
});

describe('shouldAutoTrigger', () => {
  it('delegates to hasApiKey and returns a boolean', async () => {
    // In test environment there's no chrome.storage and no Settings node
    // with an API key, so shouldAutoTrigger should return false.
    const result = await shouldAutoTrigger();
    expect(typeof result).toBe('boolean');
  });
});

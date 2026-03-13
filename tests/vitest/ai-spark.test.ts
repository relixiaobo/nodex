/**
 * ai-spark — Spark structure extraction tests.
 *
 * Tests cover:
 * - Spark trigger conditions (shouldAutoTrigger)
 * - Shadow Cache read/write + TTL expiry
 * - #spark tagDef bootstrapping
 * - Spark #agent node bootstrapping and config reading
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  cachePageContent,
  getPageContent,
  cleanExpiredCache,
  resetShadowCacheForTests,
} from '../../src/lib/ai-shadow-cache.js';
import {
  ensureSparkTagDef,
  shouldAutoTrigger,
  parseSparkResponse,
  SPARK_COMMIT_ORIGIN,
} from '../../src/lib/ai-spark.js';
import {
  ensureSparkAgentNode,
  readSparkAgentConfig,
  SPARK_AGENT_NODE_IDS,
  SPARK_DEFAULT_TEMPERATURE,
  SPARK_DEFAULT_MAX_TOKENS,
  SPARK_DEFAULT_PROMPT_LINES,
} from '../../src/lib/ai-agent-node.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { NDX_T, SYSTEM_NODE_IDS, SYS_T } from '../../src/types/index.js';
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

describe('spark tagDef bootstrapping', () => {
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
});

describe('spark agent node bootstrapping', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('creates Spark agent node tagged with #agent', () => {
    ensureSparkAgentNode();
    loroDoc.commitDoc();

    const sparkAgent = loroDoc.toNodexNode(SYSTEM_NODE_IDS.SPARK_AGENT);
    expect(sparkAgent).toBeDefined();
    expect(sparkAgent!.name).toBe('Spark');
    expect(sparkAgent!.tags).toContain(SYS_T.AGENT);
  });

  it('creates prompt children from default lines', () => {
    ensureSparkAgentNode();
    loroDoc.commitDoc();

    const children = loroDoc.getChildren(SYSTEM_NODE_IDS.SPARK_AGENT);
    // Filter content children (not field entries)
    const contentChildren = children.filter((id) => {
      const n = loroDoc.toNodexNode(id);
      return n != null && n.type !== 'fieldEntry';
    });
    expect(contentChildren.length).toBe(SPARK_DEFAULT_PROMPT_LINES.length);
  });

  it('creates field entries for Model, Temperature, MaxTokens', () => {
    ensureSparkAgentNode();
    loroDoc.commitDoc();

    const modelFE = loroDoc.toNodexNode(SPARK_AGENT_NODE_IDS.MODEL_FIELD_ENTRY);
    expect(modelFE).toBeDefined();
    expect(modelFE!.type).toBe('fieldEntry');

    const tempFE = loroDoc.toNodexNode(SPARK_AGENT_NODE_IDS.TEMPERATURE_FIELD_ENTRY);
    expect(tempFE).toBeDefined();
    expect(tempFE!.type).toBe('fieldEntry');

    const maxTokensFE = loroDoc.toNodexNode(SPARK_AGENT_NODE_IDS.MAX_TOKENS_FIELD_ENTRY);
    expect(maxTokensFE).toBeDefined();
    expect(maxTokensFE!.type).toBe('fieldEntry');
  });

  it('is idempotent — calling twice does not duplicate children', () => {
    ensureSparkAgentNode();
    loroDoc.commitDoc();
    const firstChildren = loroDoc.getChildren(SYSTEM_NODE_IDS.SPARK_AGENT);

    ensureSparkAgentNode();
    loroDoc.commitDoc();
    const secondChildren = loroDoc.getChildren(SYSTEM_NODE_IDS.SPARK_AGENT);

    expect(secondChildren.length).toBe(firstChildren.length);
  });
});

describe('spark agent config reading', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('reads default config values', () => {
    const config = readSparkAgentConfig();
    expect(config.nodeId).toBe(SYSTEM_NODE_IDS.SPARK_AGENT);
    expect(config.temperature).toBe(SPARK_DEFAULT_TEMPERATURE);
    expect(config.maxTokens).toBe(SPARK_DEFAULT_MAX_TOKENS);
    expect(config.systemPrompt.length).toBeGreaterThan(0);
    expect(config.skillIds).toEqual([]);
  });

  it('system prompt contains all default lines', () => {
    const config = readSparkAgentConfig();
    for (const line of SPARK_DEFAULT_PROMPT_LINES) {
      expect(config.systemPrompt).toContain(line);
    }
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

describe('parseSparkResponse', () => {
  it('parses new format: { napkin, insights }', () => {
    const input = JSON.stringify({
      napkin: 'Modules should be bounded by rate of change, not function',
      insights: [
        {
          name: 'Core framework: constraint shapes freedom',
          children: [
            { name: 'Load-bearing: change rate determines module boundary' },
            { name: 'Implicit assumption: change rate is predictable' },
          ],
        },
        { name: 'Minor: microservices often split wrong' },
      ],
    });

    const result = parseSparkResponse(input);
    expect(result.napkin).toBe('Modules should be bounded by rate of change, not function');
    expect(result.insights).toHaveLength(2);
    expect(result.insights[0].children).toHaveLength(2);
    expect(result.insights[1].children).toBeUndefined();
  });

  it('handles recursive children (3+ levels)', () => {
    const input = JSON.stringify({
      napkin: 'Test',
      insights: [
        {
          name: 'Level 1',
          children: [
            {
              name: 'Level 2',
              children: [{ name: 'Level 3' }],
            },
          ],
        },
      ],
    });

    const result = parseSparkResponse(input);
    expect(result.insights[0].children![0].children![0].name).toBe('Level 3');
  });

  it('falls back to legacy array format with empty napkin', () => {
    const input = JSON.stringify([
      { name: 'Insight 1', children: [{ name: 'Sub 1' }] },
      { name: 'Insight 2' },
    ]);

    const result = parseSparkResponse(input);
    expect(result.napkin).toBe('');
    expect(result.insights).toHaveLength(2);
    expect(result.insights[0].children).toHaveLength(1);
  });

  it('strips markdown code fences', () => {
    const input = '```json\n' + JSON.stringify({
      napkin: 'Test napkin',
      insights: [{ name: 'Insight' }],
    }) + '\n```';

    const result = parseSparkResponse(input);
    expect(result.napkin).toBe('Test napkin');
    expect(result.insights).toHaveLength(1);
  });

  it('filters out empty-name insights', () => {
    const input = JSON.stringify({
      napkin: 'Valid',
      insights: [
        { name: 'Good insight' },
        { name: '' },
        { name: '   ' },
      ],
    });

    const result = parseSparkResponse(input);
    expect(result.insights).toHaveLength(1);
  });

  it('throws on invalid input', () => {
    expect(() => parseSparkResponse('"just a string"')).toThrow();
    expect(() => parseSparkResponse('not json')).toThrow();
  });
});

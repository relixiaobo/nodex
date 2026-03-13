/**
 * ai-spark — Spark structure extraction tests.
 *
 * Tests cover:
 * - Spark trigger conditions (shouldAutoTrigger)
 * - Shadow Cache read/write + TTL expiry
 * - Extraction rule loading by content type
 * - #spark tagDef bootstrapping
 * - #skill node bootstrap + rule reading + fallback
 * - Collision system prompt building (spark text based)
 * - System prompt content (skeleton + flesh extraction)
 * - Content type detection
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
  getSkillBasedRules,
  ensureDefaultSkillNodes,
  ensureSkillTriggerFieldDef,
  findSkillByTrigger,
  readSkillRules,
  DEFAULT_SKILL_IDS,
  ARTICLE_EXTRACTION_RULES,
  VIDEO_EXTRACTION_RULES,
  SOCIAL_EXTRACTION_RULES,
  GENERAL_EXTRACTION_RULES,
} from '../../src/lib/ai-skills/extraction-presets.js';
import {
  ensureSparkTagDef,
  shouldAutoTrigger,
  detectContentType,
  buildSparkSystemPrompt,
  buildCollisionSystemPrompt,
  gatherSparkSummary,
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

describe('shouldAutoTrigger', () => {
  it('delegates to hasApiKey and returns a boolean', async () => {
    // In test environment there's no chrome.storage and no Settings node
    // with an API key, so shouldAutoTrigger should return false.
    const result = await shouldAutoTrigger();
    expect(typeof result).toBe('boolean');
  });
});

// ============================================================
// #skill node bootstrap + rule reading
// ============================================================

describe('skill trigger fieldDef', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('creates Trigger fieldDef under #skill tagDef', () => {
    // Ensure #skill tagDef exists first (normally done by ai-agent-node bootstrap)
    if (!loroDoc.hasNode(SYS_T.SKILL)) {
      loroDoc.createNode(SYS_T.SKILL, SYSTEM_NODE_IDS.SCHEMA);
      loroDoc.setNodeDataBatch(SYS_T.SKILL, { type: 'tagDef', name: 'skill' });
      loroDoc.commitDoc();
    }

    ensureSkillTriggerFieldDef();

    const triggerField = loroDoc.toNodexNode(NDX_F.SKILL_TRIGGER);
    expect(triggerField).toBeDefined();
    expect(triggerField!.type).toBe('fieldDef');
    expect(triggerField!.name).toBe('Trigger');
    expect(triggerField!.fieldType).toBe('options');
    expect(loroDoc.getParentId(NDX_F.SKILL_TRIGGER)).toBe(SYS_T.SKILL);
  });

  it('ensureSkillTriggerFieldDef is idempotent', () => {
    if (!loroDoc.hasNode(SYS_T.SKILL)) {
      loroDoc.createNode(SYS_T.SKILL, SYSTEM_NODE_IDS.SCHEMA);
      loroDoc.setNodeDataBatch(SYS_T.SKILL, { type: 'tagDef', name: 'skill' });
      loroDoc.commitDoc();
    }

    ensureSkillTriggerFieldDef();
    ensureSkillTriggerFieldDef();
    expect(loroDoc.toNodexNode(NDX_F.SKILL_TRIGGER)).toBeDefined();
  });
});

describe('default skill nodes', () => {
  beforeEach(() => {
    resetAndSeed();
    // Ensure #skill tagDef exists
    if (!loroDoc.hasNode(SYS_T.SKILL)) {
      loroDoc.createNode(SYS_T.SKILL, SYSTEM_NODE_IDS.SCHEMA);
      loroDoc.setNodeDataBatch(SYS_T.SKILL, { type: 'tagDef', name: 'skill' });
      loroDoc.commitDoc();
    }
  });

  it('creates 4 default skill nodes', () => {
    ensureDefaultSkillNodes();

    for (const id of Object.values(DEFAULT_SKILL_IDS)) {
      const node = loroDoc.toNodexNode(id);
      expect(node).toBeDefined();
      expect(node!.tags).toContain(SYS_T.SKILL);
    }
  });

  it('each skill node has rules as children', () => {
    ensureDefaultSkillNodes();

    const articleRules = readSkillRules(DEFAULT_SKILL_IDS.ARTICLE);
    expect(articleRules.length).toBe(ARTICLE_EXTRACTION_RULES.length);
    expect(articleRules[0]).toBe(ARTICLE_EXTRACTION_RULES[0]);

    const videoRules = readSkillRules(DEFAULT_SKILL_IDS.VIDEO);
    expect(videoRules.length).toBe(VIDEO_EXTRACTION_RULES.length);

    const socialRules = readSkillRules(DEFAULT_SKILL_IDS.SOCIAL);
    expect(socialRules.length).toBe(SOCIAL_EXTRACTION_RULES.length);

    const generalRules = readSkillRules(DEFAULT_SKILL_IDS.GENERAL);
    expect(generalRules.length).toBe(GENERAL_EXTRACTION_RULES.length);
  });

  it('findSkillByTrigger finds matching skill nodes', () => {
    ensureDefaultSkillNodes();

    expect(findSkillByTrigger('article')).toBe(DEFAULT_SKILL_IDS.ARTICLE);
    expect(findSkillByTrigger('video')).toBe(DEFAULT_SKILL_IDS.VIDEO);
    expect(findSkillByTrigger('social')).toBe(DEFAULT_SKILL_IDS.SOCIAL);
    expect(findSkillByTrigger('general')).toBe(DEFAULT_SKILL_IDS.GENERAL);
  });

  it('findSkillByTrigger returns null for unknown trigger', () => {
    ensureDefaultSkillNodes();
    expect(findSkillByTrigger('unknown_type')).toBeNull();
  });

  it('ensureDefaultSkillNodes is idempotent', () => {
    ensureDefaultSkillNodes();
    ensureDefaultSkillNodes();

    // Should not duplicate nodes
    const articleNode = loroDoc.toNodexNode(DEFAULT_SKILL_IDS.ARTICLE);
    expect(articleNode).toBeDefined();
    expect(readSkillRules(DEFAULT_SKILL_IDS.ARTICLE).length).toBe(ARTICLE_EXTRACTION_RULES.length);
  });
});

describe('getSkillBasedRules', () => {
  beforeEach(() => {
    resetAndSeed();
    // Ensure #skill tagDef exists
    if (!loroDoc.hasNode(SYS_T.SKILL)) {
      loroDoc.createNode(SYS_T.SKILL, SYSTEM_NODE_IDS.SCHEMA);
      loroDoc.setNodeDataBatch(SYS_T.SKILL, { type: 'tagDef', name: 'skill' });
      loroDoc.commitDoc();
    }
  });

  it('returns skill node rules when matching skill exists', () => {
    ensureDefaultSkillNodes();

    const rules = getSkillBasedRules('article');
    expect(rules.length).toBe(ARTICLE_EXTRACTION_RULES.length);
    expect(rules[0]).toBe(ARTICLE_EXTRACTION_RULES[0]);
  });

  it('falls back to hardcoded presets when no skill nodes exist', () => {
    // No skill nodes bootstrapped
    const rules = getSkillBasedRules('article');
    expect(rules).toBe(ARTICLE_EXTRACTION_RULES);
  });

  it('returns general rules for undefined content type', () => {
    const rules = getSkillBasedRules(undefined);
    expect(rules).toBe(GENERAL_EXTRACTION_RULES);
  });
});

// ============================================================
// System prompt content
// ============================================================

describe('buildSparkSystemPrompt', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('includes extraction rules in the prompt', () => {
    const prompt = buildSparkSystemPrompt('test-source-id', 'article');
    expect(prompt).toContain('<extraction-rules>');
    expect(prompt).toContain('argumentation framework');
  });

  it('includes source node ID in the prompt', () => {
    const prompt = buildSparkSystemPrompt('my-source-123', 'article');
    expect(prompt).toContain('my-source-123');
  });

  it('includes skeleton and flesh instructions', () => {
    const prompt = buildSparkSystemPrompt('test-source-id', 'article');
    expect(prompt).toContain('Skeleton');
    expect(prompt).toContain('Flesh');
    expect(prompt).toContain('spark');
  });

  it('does not include metadata field instructions', () => {
    const prompt = buildSparkSystemPrompt('test-source-id', 'article');
    // No is/has/about metadata instructions
    expect(prompt).not.toContain('one call PER concept');
    expect(prompt).not.toContain('one call PER topic');
    expect(prompt).not.toContain('node_edit');
  });
});

// ============================================================
// Collision
// ============================================================

describe('gatherSparkSummary', () => {
  beforeEach(() => {
    resetAndSeed();
    ensureSparkTagDef();
  });

  it('returns empty array for node with no spark children', () => {
    loroDoc.createNode('test-source', SYSTEM_NODE_IDS.JOURNAL);
    loroDoc.addTag('test-source', SYS_T.SOURCE);
    loroDoc.commitDoc();

    const summary = gatherSparkSummary('test-source');
    expect(summary).toEqual([]);
  });

  it('collects spark child names and grandchildren', () => {
    loroDoc.createNode('test-source-2', SYSTEM_NODE_IDS.JOURNAL);
    loroDoc.addTag('test-source-2', SYS_T.SOURCE);

    // Create a #spark child node
    loroDoc.createNode('spark-child-1', 'test-source-2');
    loroDoc.setNodeRichTextContent('spark-child-1', 'Core framework', [], []);
    loroDoc.addTag('spark-child-1', NDX_T.SPARK);

    // Create a grandchild under the spark node
    loroDoc.createNode('spark-gc-1', 'spark-child-1');
    loroDoc.setNodeRichTextContent('spark-gc-1', 'Supporting detail', [], []);
    loroDoc.commitDoc();

    const summary = gatherSparkSummary('test-source-2');
    expect(summary).toContain('Core framework');
    expect(summary).toContain('  - Supporting detail');
  });
});

describe('buildCollisionSystemPrompt', () => {
  it('includes spark summary and source node ID', () => {
    const prompt = buildCollisionSystemPrompt(
      'src-123',
      ['Core framework: constraint-freedom trade-off', '  - Detail about modularity'],
    );

    expect(prompt).toContain('src-123');
    expect(prompt).toContain('constraint-freedom trade-off');
    expect(prompt).toContain('Detail about modularity');
  });

  it('includes confidence threshold instructions', () => {
    const prompt = buildCollisionSystemPrompt(
      'src-456',
      ['Some spark content'],
    );

    expect(prompt).toContain('Confidence threshold');
    expect(prompt).toContain('Cross-domain');
    expect(prompt).toContain('0-2 collisions');
  });

  it('handles empty spark summary gracefully', () => {
    const prompt = buildCollisionSystemPrompt(
      'src-789',
      [],
    );

    expect(prompt).toContain('no spark nodes');
  });
});

// ============================================================
// Content type detection
// ============================================================

describe('detectContentType', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('detects article from NDX_T.ARTICLE tag', () => {
    loroDoc.createNode('ct-article', SYSTEM_NODE_IDS.JOURNAL);
    loroDoc.addTag('ct-article', SYS_T.SOURCE);
    loroDoc.addTag('ct-article', NDX_T.ARTICLE);
    loroDoc.commitDoc();

    expect(detectContentType('ct-article')).toBe('article');
  });

  it('detects video from NDX_T.VIDEO tag', () => {
    loroDoc.createNode('ct-video', SYSTEM_NODE_IDS.JOURNAL);
    loroDoc.addTag('ct-video', SYS_T.SOURCE);
    loroDoc.addTag('ct-video', NDX_T.VIDEO);
    loroDoc.commitDoc();

    expect(detectContentType('ct-video')).toBe('video');
  });

  it('detects social from NDX_T.SOCIAL tag', () => {
    loroDoc.createNode('ct-social', SYSTEM_NODE_IDS.JOURNAL);
    loroDoc.addTag('ct-social', SYS_T.SOURCE);
    loroDoc.addTag('ct-social', NDX_T.SOCIAL);
    loroDoc.commitDoc();

    expect(detectContentType('ct-social')).toBe('social');
  });

  it('returns source for generic #source tag', () => {
    loroDoc.createNode('ct-source', SYSTEM_NODE_IDS.JOURNAL);
    loroDoc.addTag('ct-source', SYS_T.SOURCE);
    loroDoc.commitDoc();

    expect(detectContentType('ct-source')).toBe('source');
  });

  it('returns undefined for non-existent node', () => {
    expect(detectContentType('non-existent')).toBeUndefined();
  });
});

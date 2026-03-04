/**
 * highlight-pending-queue — unit tests for the offline pending highlight queue.
 *
 * Mocks chrome.storage.local to test queue CRUD, cleanup, idempotency,
 * and URL normalization.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { HighlightAnchor } from '../../src/lib/highlight-anchor.js';
import type { NoteEntry } from '../../src/lib/highlight-messaging.js';
import {
  enqueuePendingHighlight,
  getPendingHighlightsForUrl,
  getAllPendingHighlights,
  removePendingHighlight,
  removePendingHighlights,
  findPendingHighlight,
  updatePendingHighlightNotes,
  markPendingHighlightFailed,
} from '../../src/lib/highlight-pending-queue.js';

// ── Mock chrome.storage.local ──

let store: Record<string, unknown> = {};

const mockStorage = {
  get: vi.fn(async (key: string) => ({ [key]: store[key] })),
  set: vi.fn(async (items: Record<string, unknown>) => {
    Object.assign(store, items);
  }),
};

vi.stubGlobal('chrome', {
  storage: { local: mockStorage },
});

// ── Helpers ──

const makeAnchor = (): HighlightAnchor => ({
  version: 1,
  exact: 'test text',
  prefix: 'before ',
  suffix: ' after',
});

const makeEntry = (tempId: string, pageUrl = 'https://example.com/page') => ({
  tempId,
  anchor: makeAnchor(),
  selectedText: 'test text',
  pageUrl,
  pageTitle: 'Example Page',
});

beforeEach(() => {
  store = {};
  vi.clearAllMocks();
});

// ── Tests ──

describe('enqueuePendingHighlight', () => {
  it('enqueues an entry and getAll returns it', async () => {
    await enqueuePendingHighlight(makeEntry('temp_1'));
    const all = await getAllPendingHighlights();
    expect(all).toHaveLength(1);
    expect(all[0].tempId).toBe('temp_1');
    expect(all[0].retryCount).toBe(0);
    expect(all[0].createdAt).toBeGreaterThan(0);
  });

  it('auto-fills normalizedUrl', async () => {
    await enqueuePendingHighlight(makeEntry('temp_1', 'http://www.example.com/page/'));
    const all = await getAllPendingHighlights();
    expect(all[0].normalizedUrl).toBe('https://example.com/page');
  });

  it('is idempotent — same tempId not duplicated', async () => {
    await enqueuePendingHighlight(makeEntry('temp_dup'));
    await enqueuePendingHighlight(makeEntry('temp_dup'));
    const all = await getAllPendingHighlights();
    expect(all).toHaveLength(1);
  });
});

describe('getPendingHighlightsForUrl', () => {
  it('filters by normalizedUrl', async () => {
    await enqueuePendingHighlight(makeEntry('temp_a', 'https://example.com/page'));
    await enqueuePendingHighlight(makeEntry('temp_b', 'https://other.com/page'));
    const results = await getPendingHighlightsForUrl('http://www.example.com/page/');
    expect(results).toHaveLength(1);
    expect(results[0].tempId).toBe('temp_a');
  });

  it('URL normalization: http vs https, www, trailing slash', async () => {
    await enqueuePendingHighlight(makeEntry('temp_norm', 'https://example.com/path'));
    // All these should match
    const r1 = await getPendingHighlightsForUrl('http://example.com/path');
    const r2 = await getPendingHighlightsForUrl('https://www.example.com/path/');
    const r3 = await getPendingHighlightsForUrl('https://example.com/path#section');
    expect(r1).toHaveLength(1);
    expect(r2).toHaveLength(1);
    expect(r3).toHaveLength(1);
  });
});

describe('removePendingHighlight', () => {
  it('removes a single entry by tempId', async () => {
    await enqueuePendingHighlight(makeEntry('temp_rm'));
    await removePendingHighlight('temp_rm');
    const all = await getAllPendingHighlights();
    expect(all).toHaveLength(0);
  });

  it('no-op for non-existent tempId', async () => {
    await enqueuePendingHighlight(makeEntry('temp_keep'));
    await removePendingHighlight('temp_gone');
    const all = await getAllPendingHighlights();
    expect(all).toHaveLength(1);
  });
});

describe('removePendingHighlights (batch)', () => {
  it('removes multiple entries', async () => {
    await enqueuePendingHighlight(makeEntry('temp_1'));
    await enqueuePendingHighlight(makeEntry('temp_2'));
    await enqueuePendingHighlight(makeEntry('temp_3'));
    await removePendingHighlights(['temp_1', 'temp_3']);
    const all = await getAllPendingHighlights();
    expect(all).toHaveLength(1);
    expect(all[0].tempId).toBe('temp_2');
  });
});

describe('findPendingHighlight', () => {
  it('finds an entry by tempId', async () => {
    await enqueuePendingHighlight(makeEntry('temp_find'));
    const found = await findPendingHighlight('temp_find');
    expect(found).toBeDefined();
    expect(found!.tempId).toBe('temp_find');
  });

  it('returns undefined for unknown tempId', async () => {
    const found = await findPendingHighlight('temp_nope');
    expect(found).toBeUndefined();
  });
});

describe('updatePendingHighlightNotes', () => {
  it('updates noteEntries for an existing entry', async () => {
    await enqueuePendingHighlight(makeEntry('temp_notes'));
    const notes: NoteEntry[] = [{ text: 'my note', depth: 0 }];
    await updatePendingHighlightNotes('temp_notes', notes);
    const found = await findPendingHighlight('temp_notes');
    expect(found!.noteEntries).toEqual(notes);
  });

  it('no-op for unknown tempId', async () => {
    const notes: NoteEntry[] = [{ text: 'orphan', depth: 0 }];
    await updatePendingHighlightNotes('temp_ghost', notes);
    const all = await getAllPendingHighlights();
    expect(all).toHaveLength(0);
  });
});

describe('markPendingHighlightFailed', () => {
  it('increments retryCount and sets lastError', async () => {
    await enqueuePendingHighlight(makeEntry('temp_fail'));
    await markPendingHighlightFailed('temp_fail', 'LoroDoc error');
    const found = await findPendingHighlight('temp_fail');
    expect(found!.retryCount).toBe(1);
    expect(found!.lastError).toBe('LoroDoc error');
  });
});

describe('cleanup', () => {
  it('evicts entries older than 30 days on enqueue', async () => {
    // Manually write an old entry
    const old = {
      ...makeEntry('temp_old'),
      normalizedUrl: 'https://example.com/page',
      createdAt: Date.now() - 31 * 24 * 60 * 60 * 1000,
      retryCount: 0,
    };
    store['soma_pending_highlights'] = [old];

    await enqueuePendingHighlight(makeEntry('temp_new'));
    const all = await getAllPendingHighlights();
    expect(all).toHaveLength(1);
    expect(all[0].tempId).toBe('temp_new');
  });

  it('trims to 200 entries keeping newest', async () => {
    // Create 200 existing entries
    const existing = Array.from({ length: 200 }, (_, i) => ({
      ...makeEntry(`temp_${i}`),
      normalizedUrl: 'https://example.com/page',
      createdAt: Date.now() - (200 - i) * 1000,
      retryCount: 0,
    }));
    store['soma_pending_highlights'] = existing;

    // Add one more — should evict the oldest
    await enqueuePendingHighlight(makeEntry('temp_newest'));
    const all = await getAllPendingHighlights();
    expect(all.length).toBeLessThanOrEqual(201);
    // The very first one (temp_0) should have been evicted
    const ids = all.map((e) => e.tempId);
    expect(ids).toContain('temp_newest');
    expect(ids).not.toContain('temp_0');
  });
});

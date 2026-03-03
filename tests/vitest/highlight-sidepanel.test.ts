import { describe, it, expect, beforeEach } from 'vitest';
import { useNodeStore } from '../../src/stores/node-store.js';
import { resetAndSeed } from './helpers/test-state.js';
import { CONTAINER_IDS, SYS_T } from '../../src/types/index.js';
import {
  ensureHighlightTagDef,
  ensureNoteTagDef,
  type HighlightNodeStore,
} from '../../src/lib/highlight-service.js';
import { findClipNodeByUrl } from '../../src/lib/webclip-service.js';
import {
  createHighlightFromPayload,
  buildHighlightRestorePayload,
  findOrCreateClipNodeForUrl,
  collectAllHighlightNodeIds,
  getRemovedHighlightIds,
  saveHighlightNotes,
  getHighlightNoteEntries,
} from '../../src/lib/highlight-sidepanel.js';
import type { HighlightCreatePayload } from '../../src/lib/highlight-messaging.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { ensureTodayNode } from '../../src/lib/journal.js';

function getStore(): HighlightNodeStore {
  return useNodeStore.getState() as HighlightNodeStore;
}

function makePayload(overrides?: Partial<HighlightCreatePayload>): HighlightCreatePayload {
  return {
    selectedText: 'highlighted text',
    pageUrl: 'https://medium.com/example-article',
    pageTitle: 'Example Article — Medium',
    anchor: {
      version: 1,
      exact: 'highlighted text',
      prefix: 'before ',
      suffix: ' after',
    },
    ...overrides,
  };
}

describe('highlight-sidepanel', () => {
  beforeEach(() => {
    resetAndSeed();
    const store = getStore();
    ensureHighlightTagDef(store);
    ensureNoteTagDef(store);
  });

  it('creates highlight as child of existing clip node', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(makePayload(), store);

    expect(result.clipNodeId).toBe('webclip_1');

    // Highlight should be child of clip page
    expect(loroDoc.getParentId(result.highlightNodeId)).toBe('webclip_1');

    const node = store.getNode(result.highlightNodeId);
    expect(node).not.toBeNull();
    expect(node!.tags).toContain(SYS_T.HIGHLIGHT);
  });

  it('creates lightweight clip when URL has no existing clip node', async () => {
    const store = getStore();
    const payload = makePayload({
      pageUrl: 'https://example.com/new-highlight',
      pageTitle: 'Fresh page',
    });

    const result = await createHighlightFromPayload(payload, store);
    expect(result.clipNodeId).not.toBe('webclip_1');

    const clipNode = store.getNode(result.clipNodeId);
    expect(clipNode).not.toBeNull();
    expect(clipNode!.tags).toContain(SYS_T.SOURCE);
    expect(loroDoc.getParentId(result.clipNodeId)).toBe(ensureTodayNode());
    expect(findClipNodeByUrl('https://example.com/new-highlight')).toBe(result.clipNodeId);

    // Highlight should be child of the new clip page
    expect(loroDoc.getParentId(result.highlightNodeId)).toBe(result.clipNodeId);
  });

  it('creates #note children from noteEntries', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(
      makePayload({ noteEntries: [{ text: 'captured note', depth: 0 }] }),
      store,
    );

    const entries = getHighlightNoteEntries(result.highlightNodeId);
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe('captured note');
    expect(entries[0].depth).toBe(0);
  });

  it('creates nested #note children from noteEntries with depth', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(
      makePayload({
        noteEntries: [
          { text: 'parent', depth: 0 },
          { text: 'child', depth: 1 },
          { text: 'grandchild', depth: 2 },
        ],
      }),
      store,
    );

    const entries = getHighlightNoteEntries(result.highlightNodeId);
    expect(entries).toEqual([
      { text: 'parent', depth: 0 },
      { text: 'child', depth: 1 },
      { text: 'grandchild', depth: 2 },
    ]);
  });

  it('stores anchor data in node description', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(makePayload(), store);

    const node = loroDoc.toNodexNode(result.highlightNodeId);
    expect(node!.description).toBeDefined();
    const parsed = JSON.parse(node!.description!);
    expect(parsed.exact).toBe('highlighted text');
  });

  it('builds restore payload with parsed anchor and tagDef color', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(makePayload(), store);

    const payload = buildHighlightRestorePayload(result.clipNodeId);
    const item = payload.highlights.find((h) => h.id === result.highlightNodeId);
    expect(item).toBeDefined();
    // Color is derived from tagDef and passed as the base highlight color
    expect(item!.color).toBe('#9B7C38');
    expect(item!.anchor.exact).toBe('highlighted text');
    expect(item!.hasComment).toBe(false);
  });

  it('sets hasComment=true in restore payload when highlight has #note child', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(makePayload(), store);
    saveHighlightNotes(store, result.highlightNodeId, [{ text: 'note', depth: 0 }]);

    const payload = buildHighlightRestorePayload(result.clipNodeId);
    const item = payload.highlights.find((h) => h.id === result.highlightNodeId);
    expect(item?.hasComment).toBe(true);
  });

  it('batch saves notes: deletes existing and rebuilds from entries', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(
      makePayload({ noteEntries: [{ text: 'first', depth: 0 }] }),
      store,
    );

    // Replace with two flat notes
    const saveResult = saveHighlightNotes(store, result.highlightNodeId, [
      { text: 'updated', depth: 0 },
      { text: 'second', depth: 0 },
    ]);
    expect(saveResult.created).toBe(2);
    expect(saveResult.deleted).toBe(1);

    const entries = getHighlightNoteEntries(result.highlightNodeId);
    expect(entries).toEqual([
      { text: 'updated', depth: 0 },
      { text: 'second', depth: 0 },
    ]);
  });

  it('batch save filters empty strings', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(
      makePayload({ noteEntries: [{ text: 'first', depth: 0 }, { text: 'second', depth: 0 }] }),
      store,
    );

    // Save with only 1 non-empty text + empties → filters empties
    const saveResult = saveHighlightNotes(store, result.highlightNodeId, [
      { text: 'kept', depth: 0 },
      { text: '', depth: 0 },
      { text: '  ', depth: 0 },
    ]);
    expect(saveResult.created).toBe(1);
    expect(saveResult.deleted).toBe(2);

    const entries = getHighlightNoteEntries(result.highlightNodeId);
    expect(entries).toEqual([{ text: 'kept', depth: 0 }]);
  });

  it('getHighlightNoteEntries returns all #note entries in DFS order', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(makePayload(), store);
    saveHighlightNotes(store, result.highlightNodeId, [
      { text: 'alpha', depth: 0 },
      { text: 'beta', depth: 0 },
      { text: 'gamma', depth: 0 },
    ]);

    const entries = getHighlightNoteEntries(result.highlightNodeId);
    expect(entries).toEqual([
      { text: 'alpha', depth: 0 },
      { text: 'beta', depth: 0 },
      { text: 'gamma', depth: 0 },
    ]);
  });

  it('saves and reads nested note tree with correct depths', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(makePayload(), store);
    saveHighlightNotes(store, result.highlightNodeId, [
      { text: 'root 1', depth: 0 },
      { text: 'child 1.1', depth: 1 },
      { text: 'child 1.2', depth: 1 },
      { text: 'grandchild 1.2.1', depth: 2 },
      { text: 'root 2', depth: 0 },
    ]);

    const entries = getHighlightNoteEntries(result.highlightNodeId);
    expect(entries).toEqual([
      { text: 'root 1', depth: 0 },
      { text: 'child 1.1', depth: 1 },
      { text: 'child 1.2', depth: 1 },
      { text: 'grandchild 1.2.1', depth: 2 },
      { text: 'root 2', depth: 0 },
    ]);
  });

  it('deduplicates concurrent clip creation for the same normalized URL', async () => {
    const store = getStore();
    const urlA = 'https://www.example.com/path/';
    const urlB = 'http://example.com/path';

    const [clipIdA, clipIdB] = await Promise.all([
      findOrCreateClipNodeForUrl(urlA, 'Example A', store),
      findOrCreateClipNodeForUrl(urlB, 'Example B', store),
    ]);

    expect(clipIdA).toBe(clipIdB);
  });

  it('collectAllHighlightNodeIds finds highlights under clip pages (new model)', async () => {
    const store = getStore();
    const first = await createHighlightFromPayload(makePayload({ selectedText: 'first' }), store);
    const second = await createHighlightFromPayload(makePayload({ selectedText: 'second' }), store);

    const ids = collectAllHighlightNodeIds();
    expect(ids.has(first.highlightNodeId)).toBe(true);
    expect(ids.has(second.highlightNodeId)).toBe(true);
  });

  it('detects removed highlight IDs', async () => {
    const store = getStore();
    const first = await createHighlightFromPayload(makePayload({ selectedText: 'first' }), store);
    const second = await createHighlightFromPayload(makePayload({ selectedText: 'second' }), store);

    const before = collectAllHighlightNodeIds();
    expect(before.has(first.highlightNodeId)).toBe(true);
    expect(before.has(second.highlightNodeId)).toBe(true);

    loroDoc.moveNode(first.highlightNodeId, CONTAINER_IDS.TRASH);
    const after = collectAllHighlightNodeIds();
    const removed = getRemovedHighlightIds(before, after);

    expect(removed).toContain(first.highlightNodeId);
    expect(removed).not.toContain(second.highlightNodeId);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { useNodeStore } from '../../src/stores/node-store.js';
import { resetAndSeed } from './helpers/test-state.js';
import { CONTAINER_IDS, SYS_T, NDX_F } from '../../src/types/index.js';
import {
  ensureHighlightTagDef,
  ensureNoteTagDef,
  getHighlightAnchor,
  getHighlightsForNote,
  getNotesForClip,
  type HighlightNodeStore,
} from '../../src/lib/highlight-service.js';
import { findClipNodeByUrl } from '../../src/lib/webclip-service.js';
import {
  createNoteFromPayload,
  buildHighlightRestorePayload,
  findOrCreateClipNodeForUrl,
  collectAllHighlightNodeIds,
  getRemovedHighlightIds,
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
    noteEntries: [{ text: 'my insight', depth: 0 }],
    ...overrides,
  };
}

describe('highlight-sidepanel (note-first model)', () => {
  beforeEach(() => {
    resetAndSeed();
    const store = getStore();
    ensureHighlightTagDef(store);
    ensureNoteTagDef(store);
  });

  it('creates #note as child of existing clip node', async () => {
    const store = getStore();
    const result = await createNoteFromPayload(makePayload(), store);

    expect(result.clipNodeId).toBe('webclip_1');

    // Note should be child of clip page
    expect(loroDoc.getParentId(result.noteNodeId)).toBe('webclip_1');

    const noteNode = store.getNode(result.noteNodeId);
    expect(noteNode).not.toBeNull();
    expect(noteNode!.tags).toContain(SYS_T.NOTE);
    expect(noteNode!.name).toBe('my insight');
  });

  it('creates #highlight under note Highlights field', async () => {
    const store = getStore();
    const result = await createNoteFromPayload(makePayload(), store);

    const hlNode = store.getNode(result.highlightNodeId);
    expect(hlNode).not.toBeNull();
    expect(hlNode!.tags).toContain(SYS_T.HIGHLIGHT);
    expect(hlNode!.name).toBe('highlighted text');

    // Highlight should be under a fieldEntry
    const hlParentId = loroDoc.getParentId(result.highlightNodeId);
    const hlParent = loroDoc.toNodexNode(hlParentId!);
    expect(hlParent?.type).toBe('fieldEntry');
    expect(hlParent?.fieldDefId).toBe(NDX_F.NOTE_HIGHLIGHTS);
  });

  it('creates lightweight clip when URL has no existing clip node', async () => {
    const store = getStore();
    const payload = makePayload({
      pageUrl: 'https://example.com/new-highlight',
      pageTitle: 'Fresh page',
    });

    const result = await createNoteFromPayload(payload, store);
    expect(result.clipNodeId).not.toBe('webclip_1');

    const clipNode = store.getNode(result.clipNodeId);
    expect(clipNode).not.toBeNull();
    expect(clipNode!.tags).toContain(SYS_T.SOURCE);
    expect(loroDoc.getParentId(result.clipNodeId)).toBe(ensureTodayNode());
    expect(findClipNodeByUrl('https://example.com/new-highlight')).toBe(result.clipNodeId);

    // Note should be child of the new clip page
    expect(loroDoc.getParentId(result.noteNodeId)).toBe(result.clipNodeId);
  });

  it('creates extra note entries as children of #note', async () => {
    const store = getStore();
    const result = await createNoteFromPayload(
      makePayload({
        noteEntries: [
          { text: 'main thought', depth: 0 },
          { text: 'sub-thought', depth: 0 },
        ],
      }),
      store,
    );

    const entries = getHighlightNoteEntries(result.noteNodeId);
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe('sub-thought');
    expect(entries[0].depth).toBe(0);
  });

  it('stores anchor data in hidden Anchor field', async () => {
    const store = getStore();
    const result = await createNoteFromPayload(makePayload(), store);

    const anchorRaw = getHighlightAnchor(result.highlightNodeId);
    expect(anchorRaw).toBeDefined();
    const parsed = JSON.parse(anchorRaw!);
    expect(parsed.exact).toBe('highlighted text');
  });

  it('builds restore payload from note-first structure', async () => {
    const store = getStore();
    const result = await createNoteFromPayload(makePayload(), store);

    const payload = buildHighlightRestorePayload(result.clipNodeId);
    const item = payload.highlights.find((h) => h.id === result.highlightNodeId);
    expect(item).toBeDefined();
    expect(item!.color).toBe('#8B8422');
    expect(item!.anchor.exact).toBe('highlighted text');
    expect(item!.hasNote).toBe(true); // note has text "my insight"
  });

  it('sets hasNote=false when note has no text', async () => {
    const store = getStore();
    const result = await createNoteFromPayload(
      makePayload({ noteEntries: [{ text: '', depth: 0 }] }),
      store,
    );

    const payload = buildHighlightRestorePayload(result.clipNodeId);
    const item = payload.highlights.find((h) => h.id === result.highlightNodeId);
    expect(item?.hasNote).toBe(false);
  });

  it('getHighlightNoteEntries returns non-fieldEntry children', async () => {
    const store = getStore();
    const result = await createNoteFromPayload(
      makePayload({
        noteEntries: [
          { text: 'main', depth: 0 },
          { text: 'child1', depth: 0 },
          { text: 'child2', depth: 0 },
        ],
      }),
      store,
    );

    const entries = getHighlightNoteEntries(result.noteNodeId);
    expect(entries).toHaveLength(2); // child1 + child2 (main is the note text)
    expect(entries[0].text).toBe('child1');
    expect(entries[1].text).toBe('child2');
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

  it('collectAllHighlightNodeIds finds highlights in note-first structure', async () => {
    const store = getStore();
    const first = await createNoteFromPayload(makePayload({ selectedText: 'first' }), store);
    const second = await createNoteFromPayload(makePayload({ selectedText: 'second' }), store);

    const ids = collectAllHighlightNodeIds();
    expect(ids.has(first.highlightNodeId)).toBe(true);
    expect(ids.has(second.highlightNodeId)).toBe(true);
  });

  it('detects removed highlight IDs', async () => {
    const store = getStore();
    const first = await createNoteFromPayload(makePayload({ selectedText: 'first' }), store);
    const second = await createNoteFromPayload(makePayload({ selectedText: 'second' }), store);

    const before = collectAllHighlightNodeIds();
    expect(before.has(first.highlightNodeId)).toBe(true);
    expect(before.has(second.highlightNodeId)).toBe(true);

    // Trash the note (which moves the whole subtree including highlight)
    loroDoc.moveNode(first.noteNodeId, CONTAINER_IDS.TRASH);
    const after = collectAllHighlightNodeIds();
    const removed = getRemovedHighlightIds(before, after);

    expect(removed).toContain(first.highlightNodeId);
    expect(removed).not.toContain(second.highlightNodeId);
  });
});

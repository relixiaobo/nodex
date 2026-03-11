import { describe, it, expect, beforeEach } from 'vitest';
import { useNodeStore } from '../../src/stores/node-store.js';
import { resetAndSeed } from './helpers/test-state.js';
import { SYSTEM_NODE_IDS, SYS_T, NDX_F } from '../../src/types/index.js';
import {
  ensureHighlightTagDef,
  ensureNoteTagDef,
  getHighlightAnchor,
  getHighlightsForNote,
  getNotesForClip,
  findNotesForHighlight,
  type HighlightNodeStore,
} from '../../src/lib/highlight-service.js';
import { findClipNodeByUrl } from '../../src/lib/webclip-service.js';
import {
  createHighlightFromPayload,
  buildHighlightRestorePayload,
  findOrCreateClipNodeForUrl,
  collectAllHighlightNodeIds,
  getRemovedHighlightIds,
  getHighlightNoteEntries,
  findNoteEntriesForHighlight,
  saveNotesForHighlight,
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

describe('highlight-sidepanel (unified Path B model)', () => {
  beforeEach(() => {
    resetAndSeed();
    const store = getStore();
    ensureHighlightTagDef(store);
    ensureNoteTagDef(store);
  });

  it('creates #note as child of existing clip node', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(makePayload(), store);

    expect(result.clipNodeId).toBe('webclip_1');

    // Note should be child of clip page
    expect(loroDoc.getParentId(result.noteNodeId)).toBe('webclip_1');

    const noteNode = store.getNode(result.noteNodeId);
    expect(noteNode).not.toBeNull();
    expect(noteNode!.tags).toContain(SYS_T.NOTE);
    expect(noteNode!.name).toBe('my insight');
  });

  it('creates #highlight as direct child of clip (Path B)', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(makePayload(), store);

    const hlNode = store.getNode(result.highlightNodeId);
    expect(hlNode).not.toBeNull();
    expect(hlNode!.tags).toContain(SYS_T.HIGHLIGHT);
    expect(hlNode!.name).toBe('highlighted text');

    // Highlight should be direct child of clip page
    expect(loroDoc.getParentId(result.highlightNodeId)).toBe('webclip_1');

    // Note's Highlights field should contain a reference to the highlight
    const noteNode = store.getNode(result.noteNodeId!);
    expect(noteNode).not.toBeNull();
    const highlights = getHighlightsForNote(result.noteNodeId!);
    expect(highlights).toHaveLength(1);
    expect(highlights[0].id).toBe(result.highlightNodeId);
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

    // Note should be child of the new clip page
    expect(loroDoc.getParentId(result.noteNodeId)).toBe(result.clipNodeId);
  });

  it('creates multiple #notes from multiple depth-0 entries on creation', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(
      makePayload({
        noteEntries: [
          { text: 'main thought', depth: 0 },
          { text: 'sub-thought', depth: 0 },
        ],
      }),
      store,
    );

    // Two depth-0 entries → two separate #note nodes
    const notes = findNotesForHighlight(result.highlightNodeId);
    expect(notes).toHaveLength(2);
    expect(notes[0].name).toBe('main thought');
    expect(notes[1].name).toBe('sub-thought');
    // result.noteNodeId returns the first note
    expect(result.noteNodeId).toBe(notes[0].id);
  });

  it('stores anchor data in hidden Anchor field', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(makePayload(), store);

    const anchorRaw = getHighlightAnchor(result.highlightNodeId);
    expect(anchorRaw).toBeDefined();
    const parsed = JSON.parse(anchorRaw!);
    expect(parsed.exact).toBe('highlighted text');
  });

  it('builds restore payload from note-first structure', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(makePayload(), store);

    const payload = buildHighlightRestorePayload(result.clipNodeId);
    const item = payload.highlights.find((h) => h.id === result.highlightNodeId);
    expect(item).toBeDefined();
    expect(item!.color).toBe('#8B8422');
    expect(item!.anchor.exact).toBe('highlighted text');
    expect(item!.hasNote).toBe(true); // note has text "my insight"
  });

  it('sets hasNote=false when note has no text', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(
      makePayload({ noteEntries: [{ text: '', depth: 0 }] }),
      store,
    );

    const payload = buildHighlightRestorePayload(result.clipNodeId);
    const item = payload.highlights.find((h) => h.id === result.highlightNodeId);
    expect(item?.hasNote).toBe(false);
  });

  it('getHighlightNoteEntries returns non-fieldEntry children of a note', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(
      makePayload({
        noteEntries: [
          { text: 'main', depth: 0 },
          { text: 'child1', depth: 1 },
          { text: 'child2', depth: 1 },
        ],
      }),
      store,
    );

    // depth-1 entries become children of the note node
    const entries = getHighlightNoteEntries(result.noteNodeId);
    expect(entries).toHaveLength(2);
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
    const first = await createHighlightFromPayload(makePayload({ selectedText: 'first' }), store);
    const second = await createHighlightFromPayload(makePayload({ selectedText: 'second' }), store);

    const ids = collectAllHighlightNodeIds();
    expect(ids.has(first.highlightNodeId)).toBe(true);
    expect(ids.has(second.highlightNodeId)).toBe(true);
  });

  it('collectAllHighlightNodeIds still scans a legacy Library container when present', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(makePayload({ selectedText: 'legacy-library' }), store);

    loroDoc.createNode(SYSTEM_NODE_IDS.LIBRARY, 'ws_default');
    loroDoc.setNodeDataBatch(SYSTEM_NODE_IDS.LIBRARY, { name: 'Library' });
    loroDoc.moveNode(result.clipNodeId, SYSTEM_NODE_IDS.LIBRARY);
    loroDoc.commitDoc('__seed__');

    const ids = collectAllHighlightNodeIds();
    expect(ids.has(result.highlightNodeId)).toBe(true);
  });

  it('detects removed highlight IDs', async () => {
    const store = getStore();
    // Use bare highlights (no notes) so trashing highlight is sufficient
    const first = await createHighlightFromPayload(makePayload({ selectedText: 'first', noteEntries: [] }), store);
    const second = await createHighlightFromPayload(makePayload({ selectedText: 'second', noteEntries: [] }), store);

    const before = collectAllHighlightNodeIds();
    expect(before.has(first.highlightNodeId)).toBe(true);
    expect(before.has(second.highlightNodeId)).toBe(true);

    // Trash the highlight (direct child of clip, no note reference to keep it alive)
    loroDoc.moveNode(first.highlightNodeId, SYSTEM_NODE_IDS.TRASH);
    const after = collectAllHighlightNodeIds();
    const removed = getRemovedHighlightIds(before, after);

    expect(removed).toContain(first.highlightNodeId);
    expect(removed).not.toContain(second.highlightNodeId);
  });

  it('findNoteEntriesForHighlight returns entries with correct depth offsets', async () => {
    const store = getStore();
    // Popover sends depth 0 (root) + depth 1 (children)
    const result = await createHighlightFromPayload(
      makePayload({
        noteEntries: [
          { text: 'root note', depth: 0 },
          { text: 'child 1', depth: 1 },
          { text: 'child 2', depth: 1 },
        ],
      }),
      store,
    );

    // Round-trip: retrieve entries should match what the popover originally sent
    const entries = findNoteEntriesForHighlight(result.highlightNodeId);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({ text: 'root note', depth: 0 });
    expect(entries[1]).toEqual({ text: 'child 1', depth: 1 });
    expect(entries[2]).toEqual({ text: 'child 2', depth: 1 });
  });

  it('saveNotesForHighlight updates existing note name and children', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(
      makePayload({ noteEntries: [{ text: 'original note', depth: 0 }] }),
      store,
    );

    const notes = findNotesForHighlight(result.highlightNodeId);
    expect(notes).toHaveLength(1);
    expect(notes[0].name).toBe('original note');

    // Update with new content via saveNotesForHighlight
    const { noteNodeIds } = saveNotesForHighlight(result.highlightNodeId, result.clipNodeId, [
      { text: 'updated note', depth: 0 },
      { text: 'new child', depth: 1 },
    ], store);

    expect(noteNodeIds).toHaveLength(1);
    expect(noteNodeIds[0]).toBe(notes[0].id); // Same note, updated

    // Verify name updated
    const updatedNote = loroDoc.toNodexNode(notes[0].id);
    expect(updatedNote!.name).toBe('updated note');

    // Verify children updated
    const entries = getHighlightNoteEntries(notes[0].id);
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe('new child');
  });

  it('saveNotesForHighlight preserves Highlights field reference', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(
      makePayload({ noteEntries: [{ text: 'original', depth: 0 }] }),
      store,
    );

    saveNotesForHighlight(result.highlightNodeId, result.clipNodeId, [
      { text: 'updated', depth: 0 },
    ], store);

    // Highlights field reference should still work
    const notes = findNotesForHighlight(result.highlightNodeId);
    expect(notes).toHaveLength(1);
    const highlights = getHighlightsForNote(notes[0].id);
    expect(highlights).toHaveLength(1);
    expect(highlights[0].id).toBe(result.highlightNodeId);
  });

  it('saveNotesForHighlight creates multiple notes from multiple depth-0 entries', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(
      makePayload({ noteEntries: [] }), // bare highlight, no note
      store,
    );

    // Save two separate notes (two depth-0 groups)
    const { noteNodeIds } = saveNotesForHighlight(result.highlightNodeId, result.clipNodeId, [
      { text: 'perspective A', depth: 0 },
      { text: 'detail A1', depth: 1 },
      { text: 'perspective B', depth: 0 },
    ], store);

    expect(noteNodeIds).toHaveLength(2);

    // Verify both notes exist and reference the same highlight
    const notes = findNotesForHighlight(result.highlightNodeId);
    expect(notes).toHaveLength(2);
    expect(notes[0].name).toBe('perspective A');
    expect(notes[1].name).toBe('perspective B');

    // First note should have a child
    const entries1 = getHighlightNoteEntries(noteNodeIds[0]);
    expect(entries1).toHaveLength(1);
    expect(entries1[0].text).toBe('detail A1');
  });

  it('saveNotesForHighlight deletes excess notes when groups are reduced', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(
      makePayload({ noteEntries: [] }),
      store,
    );

    // Create two notes
    saveNotesForHighlight(result.highlightNodeId, result.clipNodeId, [
      { text: 'note A', depth: 0 },
      { text: 'note B', depth: 0 },
    ], store);
    expect(findNotesForHighlight(result.highlightNodeId)).toHaveLength(2);

    // Save again with only one note — second should be deleted
    saveNotesForHighlight(result.highlightNodeId, result.clipNodeId, [
      { text: 'note A updated', depth: 0 },
    ], store);

    const remaining = findNotesForHighlight(result.highlightNodeId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe('note A updated');
  });

  it('findNoteEntriesForHighlight returns entries from multiple notes', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(
      makePayload({ noteEntries: [] }),
      store,
    );

    // Create two notes with children
    saveNotesForHighlight(result.highlightNodeId, result.clipNodeId, [
      { text: 'thought 1', depth: 0 },
      { text: 'sub 1a', depth: 1 },
      { text: 'thought 2', depth: 0 },
    ], store);

    const entries = findNoteEntriesForHighlight(result.highlightNodeId);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({ text: 'thought 1', depth: 0 });
    expect(entries[1]).toEqual({ text: 'sub 1a', depth: 1 });
    expect(entries[2]).toEqual({ text: 'thought 2', depth: 0 });
  });
});

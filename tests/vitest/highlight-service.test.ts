/**
 * highlight-service — #highlight and #note system tag tests.
 *
 * Unified model (Path B):
 * - #highlight is always a direct child of clip page
 * - #note (optional) is a sibling with reference to #highlight in Highlights field
 * - Anchor data stored in #highlight's hidden "Anchor" field
 * - Source field stays on #highlight (auto-init from #source ancestor)
 *
 * Legacy createNoteWithHighlight tests kept for backward compat with existing data.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useNodeStore } from '../../src/stores/node-store.js';
import { resetAndSeed } from './helpers/test-state.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { SYSTEM_NODE_IDS, SYS_T, SYS_V, NDX_F, FIELD_TYPES, AUTO_INIT_STRATEGY } from '../../src/types/index.js';
import {
  ensureHighlightTagDef,
  ensureNoteTagDef,
  ensureHighlightAnchorFieldDef,
  ensureNoteHighlightsFieldDef,
  createHighlightOnly,
  addNoteForHighlight,
  getNotesForClip,
  getHighlightsForNote,
  getBareHighlightsForClip,
  getHighlightAnchor,
  getSourceFieldDefId,
  findNotesForHighlight,
  _resetHighlightCache,
  type HighlightNodeStore,
} from '../../src/lib/highlight-service.js';

/** Get the store as HighlightNodeStore. */
function getStore(): HighlightNodeStore {
  return useNodeStore.getState() as HighlightNodeStore;
}

describe('ensureHighlightTagDef', () => {
  beforeEach(() => {
    _resetHighlightCache();
    resetAndSeed();
  });

  it('creates #highlight tagDef with fixed ID SYS_T200', () => {
    const store = getStore();
    ensureHighlightTagDef(store);

    const tagDef = loroDoc.toNodexNode(SYS_T.HIGHLIGHT);
    expect(tagDef).toBeDefined();
    expect(tagDef!.type).toBe('tagDef');
    expect(tagDef!.name).toBe('highlight');
  });

  it('creates 2 fieldDefs (Source + Anchor) under tagDef', () => {
    const store = getStore();
    ensureHighlightTagDef(store);

    const children = loroDoc.getChildren(SYS_T.HIGHLIGHT);
    const fieldDefs = children.filter(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldDef';
    });
    expect(fieldDefs).toHaveLength(2);
  });

  it('creates Source field as options_from_supertag type', () => {
    const store = getStore();
    ensureHighlightTagDef(store);

    const sourceFd = loroDoc.toNodexNode(getSourceFieldDefId());
    expect(sourceFd).toBeDefined();
    expect(sourceFd!.name).toBe('Source');
    expect(sourceFd!.fieldType).toBe(FIELD_TYPES.OPTIONS_FROM_SUPERTAG);
  });

  it('sets sourceSupertag on Source field to #source tagDef', () => {
    const store = getStore();
    ensureHighlightTagDef(store);

    const sourceFd = loroDoc.toNodexNode(getSourceFieldDefId());
    expect(sourceFd!.sourceSupertag).toBeDefined();

    const sourceTagDef = loroDoc.toNodexNode(sourceFd!.sourceSupertag!);
    expect(sourceTagDef).toBeDefined();
    expect(sourceTagDef!.name).toBe('source');
  });

  it('configures autoInitialize = ancestor_supertag_ref on Source field', () => {
    const store = getStore();
    ensureHighlightTagDef(store);

    const sourceFd = loroDoc.toNodexNode(getSourceFieldDefId());
    expect(sourceFd!.autoInitialize).toBe(AUTO_INIT_STRATEGY.ANCESTOR_SUPERTAG_REF);
  });

  it('creates Anchor hidden field (plain, hideField: ALWAYS)', () => {
    const store = getStore();
    ensureHighlightTagDef(store);

    const anchorFd = loroDoc.toNodexNode(NDX_F.HIGHLIGHT_ANCHOR);
    expect(anchorFd).toBeDefined();
    expect(anchorFd!.name).toBe('Anchor');
    expect(anchorFd!.fieldType).toBe(FIELD_TYPES.PLAIN);
    expect(anchorFd!.hideField).toBe(SYS_V.ALWAYS);
  });

  it('is idempotent — calling twice does not duplicate', () => {
    const store = getStore();
    ensureHighlightTagDef(store);
    _resetHighlightCache();
    ensureHighlightTagDef(store);

    const children = loroDoc.getChildren(SYS_T.HIGHLIGHT);
    const fieldDefs = children.filter(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldDef';
    });
    expect(fieldDefs).toHaveLength(2); // Source + Anchor
  });
});

describe('ensureNoteTagDef', () => {
  beforeEach(() => {
    _resetHighlightCache();
    resetAndSeed();
  });

  it('creates #note tagDef with fixed ID SYS_T201', () => {
    const store = getStore();
    ensureNoteTagDef(store);

    const tagDef = loroDoc.toNodexNode(SYS_T.NOTE);
    expect(tagDef).toBeDefined();
    expect(tagDef!.type).toBe('tagDef');
    expect(tagDef!.name).toBe('note');
  });

  it('creates Highlights template field (OPTIONS_FROM_SUPERTAG → #highlight)', () => {
    const store = getStore();
    ensureNoteTagDef(store);

    const hlFd = loroDoc.toNodexNode(NDX_F.NOTE_HIGHLIGHTS);
    expect(hlFd).toBeDefined();
    expect(hlFd!.name).toBe('Highlights');
    expect(hlFd!.fieldType).toBe(FIELD_TYPES.OPTIONS_FROM_SUPERTAG);
    expect(hlFd!.sourceSupertag).toBe(SYS_T.HIGHLIGHT);
  });

  it('is idempotent', () => {
    const store = getStore();
    ensureNoteTagDef(store);
    ensureNoteTagDef(store);

    const tagDef = loroDoc.toNodexNode(SYS_T.NOTE);
    expect(tagDef).toBeDefined();

    const schemaChildren = loroDoc.getChildren(SYSTEM_NODE_IDS.SCHEMA);
    const noteDefs = schemaChildren.filter(cid => cid === SYS_T.NOTE);
    expect(noteDefs).toHaveLength(1);
  });
});

describe('getNotesForClip', () => {
  beforeEach(() => {
    _resetHighlightCache();
    resetAndSeed();
    const store = getStore();
    ensureHighlightTagDef(store);
    ensureNoteTagDef(store);
  });

  it('returns empty array when no notes exist', () => {
    expect(getNotesForClip('nonexistent_clip')).toEqual([]);
  });

  it('finds #note children of clip page', () => {
    const store = getStore();
    const { highlightNode: hl1 } = createHighlightOnly({ store, selectedText: 'hl 1', clipNodeId: 'webclip_1' });
    const { highlightNode: hl2 } = createHighlightOnly({ store, selectedText: 'hl 2', clipNodeId: 'webclip_1' });
    addNoteForHighlight({ store, highlightNodeId: hl1.id, clipNodeId: 'webclip_1', noteText: 'note 1' });
    addNoteForHighlight({ store, highlightNodeId: hl2.id, clipNodeId: 'webclip_1', noteText: 'note 2' });

    const results = getNotesForClip('webclip_1');
    expect(results).toHaveLength(2);
    expect(results.map(r => r.name)).toContain('note 1');
    expect(results.map(r => r.name)).toContain('note 2');
  });
});

describe('getHighlightsForNote', () => {
  beforeEach(() => {
    _resetHighlightCache();
    resetAndSeed();
    const store = getStore();
    ensureHighlightTagDef(store);
    ensureNoteTagDef(store);
  });

  it('resolves reference nodes to actual #highlight', () => {
    const store = getStore();
    // Create bare highlight first
    const { highlightNode } = createHighlightOnly({
      store, selectedText: 'bare text', clipNodeId: 'webclip_1',
    });
    // Add note that references it
    const { noteNode } = addNoteForHighlight({
      store, highlightNodeId: highlightNode.id, clipNodeId: 'webclip_1', noteText: 'my thought',
    });

    const highlights = getHighlightsForNote(noteNode.id);
    expect(highlights).toHaveLength(1);
    expect(highlights[0].id).toBe(highlightNode.id);
    expect(highlights[0].name).toBe('bare text');
  });

  it('ignores non-reference children inside the Highlights field', () => {
    const store = getStore();
    const { highlightNode } = createHighlightOnly({
      store, selectedText: 'bare text', clipNodeId: 'webclip_1',
    });
    const { noteNode } = addNoteForHighlight({
      store, highlightNodeId: highlightNode.id, clipNodeId: 'webclip_1', noteText: 'my thought',
    });

    const highlightsFieldEntryId = loroDoc.getChildren(noteNode.id).find((childId) => {
      const child = loroDoc.toNodexNode(childId);
      return child?.type === 'fieldEntry' && child.fieldDefId === NDX_F.NOTE_HIGHLIGHTS;
    });
    expect(highlightsFieldEntryId).toBeDefined();

    const directHighlight = store.createChild(highlightsFieldEntryId!, undefined, { name: 'direct child highlight' });
    store.applyTag(directHighlight.id, SYS_T.HIGHLIGHT);

    const highlights = getHighlightsForNote(noteNode.id);
    expect(highlights).toHaveLength(1);
    expect(highlights[0].id).toBe(highlightNode.id);
  });
});

describe('createHighlightOnly', () => {
  beforeEach(() => {
    _resetHighlightCache();
    resetAndSeed();
    const store = getStore();
    ensureHighlightTagDef(store);
    ensureNoteTagDef(store);
  });

  it('creates #highlight as direct child of clip page', () => {
    const store = getStore();
    const { highlightNode } = createHighlightOnly({
      store, selectedText: 'selected text', clipNodeId: 'webclip_1',
    });

    expect(loroDoc.getParentId(highlightNode.id)).toBe('webclip_1');
    expect(highlightNode.tags).toContain(SYS_T.HIGHLIGHT);
    expect(highlightNode.name).toBe('selected text');
  });

  it('stores anchor data in Anchor field', () => {
    const store = getStore();
    const anchorJson = JSON.stringify({ version: 1, exact: 'test', prefix: 'p', suffix: 's' });
    const { highlightNode } = createHighlightOnly({
      store, selectedText: 'test', clipNodeId: 'webclip_1', anchor: anchorJson,
    });

    const retrieved = getHighlightAnchor(highlightNode.id);
    expect(retrieved).toBe(anchorJson);
  });

  it('auto-fills Source field via ancestor_supertag_ref', () => {
    const store = getStore();
    const { highlightNode } = createHighlightOnly({
      store, selectedText: 'text', clipNodeId: 'webclip_1',
    });

    const hlChildren = loroDoc.getChildren(highlightNode.id);
    const sourceFieldDefId = getSourceFieldDefId();
    const fieldEntry = hlChildren.find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === sourceFieldDefId;
    });
    expect(fieldEntry).toBeDefined();

    const feChildren = loroDoc.getChildren(fieldEntry!);
    expect(feChildren.length).toBe(1);
    const valueNode = loroDoc.toNodexNode(feChildren[0]);
    expect(valueNode?.targetId).toBe('webclip_1');
  });
});

describe('addNoteForHighlight', () => {
  beforeEach(() => {
    _resetHighlightCache();
    resetAndSeed();
    const store = getStore();
    ensureHighlightTagDef(store);
    ensureNoteTagDef(store);
  });

  it('creates #note as child of clip page with reference to highlight', () => {
    const store = getStore();
    const { highlightNode } = createHighlightOnly({
      store, selectedText: 'highlighted', clipNodeId: 'webclip_1',
    });
    const { noteNode } = addNoteForHighlight({
      store, highlightNodeId: highlightNode.id, clipNodeId: 'webclip_1', noteText: 'my thought',
    });

    expect(loroDoc.getParentId(noteNode.id)).toBe('webclip_1');
    expect(noteNode.tags).toContain(SYS_T.NOTE);
    expect(noteNode.name).toBe('my thought');
  });

  it('does not move the original #highlight', () => {
    const store = getStore();
    const { highlightNode } = createHighlightOnly({
      store, selectedText: 'highlighted', clipNodeId: 'webclip_1',
    });
    addNoteForHighlight({
      store, highlightNodeId: highlightNode.id, clipNodeId: 'webclip_1', noteText: 'thought',
    });

    // Highlight stays as direct child of clip
    expect(loroDoc.getParentId(highlightNode.id)).toBe('webclip_1');
  });

  it('Highlights fieldEntry contains reference node with targetId', () => {
    const store = getStore();
    const { highlightNode } = createHighlightOnly({
      store, selectedText: 'highlighted', clipNodeId: 'webclip_1',
    });
    const { noteNode } = addNoteForHighlight({
      store, highlightNodeId: highlightNode.id, clipNodeId: 'webclip_1', noteText: 'thought',
    });

    // Find Highlights fieldEntry
    const noteChildren = loroDoc.getChildren(noteNode.id);
    const feId = noteChildren.find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === NDX_F.NOTE_HIGHLIGHTS;
    });
    expect(feId).toBeDefined();

    // Reference node inside fieldEntry
    const feChildren = loroDoc.getChildren(feId!);
    expect(feChildren).toHaveLength(1);
    const refNode = loroDoc.toNodexNode(feChildren[0]);
    expect(refNode?.type).toBe('reference');
    expect(refNode?.targetId).toBe(highlightNode.id);
  });

  it('creates extra note entries as children of #note', () => {
    const store = getStore();
    const { highlightNode } = createHighlightOnly({
      store, selectedText: 'highlighted', clipNodeId: 'webclip_1',
    });
    const { noteNode } = addNoteForHighlight({
      store, highlightNodeId: highlightNode.id, clipNodeId: 'webclip_1',
      noteText: 'main thought',
      extraNoteEntries: [{ text: 'sub note 1', depth: 0 }, { text: 'sub note 2', depth: 0 }],
    });

    const children = loroDoc.getChildren(noteNode.id);
    const contentChildren = children.filter(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n && n.type !== 'fieldEntry';
    });
    expect(contentChildren).toHaveLength(2);
  });
});

describe('getBareHighlightsForClip', () => {
  beforeEach(() => {
    _resetHighlightCache();
    resetAndSeed();
    const store = getStore();
    ensureHighlightTagDef(store);
    ensureNoteTagDef(store);
  });

  it('returns empty when no bare highlights', () => {
    expect(getBareHighlightsForClip('webclip_1')).toEqual([]);
  });

  it('returns bare #highlights that are direct children of clip', () => {
    const store = getStore();
    createHighlightOnly({ store, selectedText: 'bare 1', clipNodeId: 'webclip_1' });
    createHighlightOnly({ store, selectedText: 'bare 2', clipNodeId: 'webclip_1' });

    const results = getBareHighlightsForClip('webclip_1');
    expect(results).toHaveLength(2);
    expect(results.map(r => r.name)).toContain('bare 1');
    expect(results.map(r => r.name)).toContain('bare 2');
  });

  it('does not return #note siblings', () => {
    const store = getStore();
    const { highlightNode } = createHighlightOnly({ store, selectedText: 'bare one', clipNodeId: 'webclip_1' });
    addNoteForHighlight({ store, highlightNodeId: highlightNode.id, clipNodeId: 'webclip_1', noteText: 'note' });

    const results = getBareHighlightsForClip('webclip_1');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('bare one');
  });
});

describe('findNotesForHighlight', () => {
  beforeEach(() => {
    _resetHighlightCache();
    resetAndSeed();
    const store = getStore();
    ensureHighlightTagDef(store);
    ensureNoteTagDef(store);
  });

  it('returns empty array for bare highlight with no note', () => {
    const store = getStore();
    const { highlightNode } = createHighlightOnly({ store, selectedText: 'bare', clipNodeId: 'webclip_1' });
    expect(findNotesForHighlight(highlightNode.id)).toHaveLength(0);
  });

  it('returns note nodes when highlight has associated notes', () => {
    const store = getStore();
    const { highlightNode } = createHighlightOnly({ store, selectedText: 'text', clipNodeId: 'webclip_1' });
    const { noteNode } = addNoteForHighlight({
      store, highlightNodeId: highlightNode.id, clipNodeId: 'webclip_1', noteText: 'my thought',
    });

    const found = findNotesForHighlight(highlightNode.id);
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(noteNode.id);
    expect(found[0].name).toBe('my thought');
  });

  it('returns multiple notes for a highlight with multiple notes', () => {
    const store = getStore();
    const { highlightNode } = createHighlightOnly({ store, selectedText: 'text', clipNodeId: 'webclip_1' });
    const { noteNode: note1 } = addNoteForHighlight({
      store, highlightNodeId: highlightNode.id, clipNodeId: 'webclip_1', noteText: 'thought 1',
    });
    const { noteNode: note2 } = addNoteForHighlight({
      store, highlightNodeId: highlightNode.id, clipNodeId: 'webclip_1', noteText: 'thought 2',
    });

    const found = findNotesForHighlight(highlightNode.id);
    expect(found).toHaveLength(2);
    expect(found.map(n => n.id)).toContain(note1.id);
    expect(found.map(n => n.id)).toContain(note2.id);
  });

  it('returns empty array for nonexistent highlight', () => {
    expect(findNotesForHighlight('nonexistent_id')).toHaveLength(0);
  });
});

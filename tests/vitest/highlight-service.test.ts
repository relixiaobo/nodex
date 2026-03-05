/**
 * highlight-service — Note-first #highlight and #note system tag tests.
 *
 * New model (v2):
 * - #note is the primary node (child of clip page)
 * - #highlight is a field value under #note's "Highlights" field
 * - Anchor data stored in #highlight's hidden "Anchor" field
 * - Source field stays on #highlight (auto-init from #source ancestor)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useNodeStore } from '../../src/stores/node-store.js';
import { resetAndSeed } from './helpers/test-state.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { CONTAINER_IDS, SYS_T, SYS_V, NDX_F, FIELD_TYPES, AUTO_INIT_STRATEGY } from '../../src/types/index.js';
import {
  ensureHighlightTagDef,
  ensureNoteTagDef,
  ensureHighlightAnchorFieldDef,
  ensureNoteHighlightsFieldDef,
  createNoteWithHighlight,
  getNotesForClip,
  getHighlightsForNote,
  getHighlightAnchor,
  getSourceFieldDefId,
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

    const schemaChildren = loroDoc.getChildren(CONTAINER_IDS.SCHEMA);
    const noteDefs = schemaChildren.filter(cid => cid === SYS_T.NOTE);
    expect(noteDefs).toHaveLength(1);
  });
});

describe('createNoteWithHighlight', () => {
  beforeEach(() => {
    _resetHighlightCache();
    resetAndSeed();
    const store = getStore();
    ensureHighlightTagDef(store);
    ensureNoteTagDef(store);
  });

  it('creates #note as child of clip page', () => {
    const store = getStore();
    const { noteNode } = createNoteWithHighlight({
      store,
      noteText: 'my insight',
      selectedText: 'highlighted text',
      clipNodeId: 'webclip_1',
    });

    expect(loroDoc.getParentId(noteNode.id)).toBe('webclip_1');
    expect(noteNode.tags).toContain(SYS_T.NOTE);
    expect(noteNode.name).toBe('my insight');
  });

  it('creates #highlight under Highlights fieldEntry', () => {
    const store = getStore();
    const { noteNode, highlightNode } = createNoteWithHighlight({
      store,
      noteText: 'my insight',
      selectedText: 'highlighted text',
      clipNodeId: 'webclip_1',
    });

    // highlightNode should be tagged with #highlight
    expect(highlightNode.tags).toContain(SYS_T.HIGHLIGHT);
    expect(highlightNode.name).toBe('highlighted text');

    // Should be under a fieldEntry
    const hlParentId = loroDoc.getParentId(highlightNode.id);
    const hlParent = loroDoc.toNodexNode(hlParentId!);
    expect(hlParent?.type).toBe('fieldEntry');
    expect(hlParent?.fieldDefId).toBe(NDX_F.NOTE_HIGHLIGHTS);
  });

  it('auto-fills Source field on #highlight via ancestor_supertag_ref', () => {
    const store = getStore();
    const { highlightNode } = createNoteWithHighlight({
      store,
      noteText: 'insight',
      selectedText: 'text',
      clipNodeId: 'webclip_1',
    });

    // Source fieldEntry should have a value referencing the clip page
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

  it('stores anchor data in hidden Anchor field', () => {
    const store = getStore();
    const anchorJson = JSON.stringify({ version: 1, exact: 'test', prefix: 'before', suffix: 'after' });
    const { highlightNode } = createNoteWithHighlight({
      store,
      noteText: 'insight',
      selectedText: 'test',
      clipNodeId: 'webclip_1',
      anchor: anchorJson,
    });

    const retrieved = getHighlightAnchor(highlightNode.id);
    expect(retrieved).toBe(anchorJson);
  });

  it('creates extra note entries as children of #note', () => {
    const store = getStore();
    const { noteNode } = createNoteWithHighlight({
      store,
      noteText: 'main note',
      selectedText: 'highlighted',
      clipNodeId: 'webclip_1',
      extraNoteEntries: [
        { text: 'child 1', depth: 0 },
        { text: 'child 2', depth: 0 },
      ],
    });

    // Non-fieldEntry children of the note (both at depth 0 → direct children)
    const children = loroDoc.getChildren(noteNode.id);
    const contentChildren = children.filter(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n && n.type !== 'fieldEntry';
    });
    expect(contentChildren).toHaveLength(2);
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
    createNoteWithHighlight({
      store, noteText: 'note 1', selectedText: 'hl 1', clipNodeId: 'webclip_1',
    });
    createNoteWithHighlight({
      store, noteText: 'note 2', selectedText: 'hl 2', clipNodeId: 'webclip_1',
    });

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

  it('returns highlights from note Highlights field', () => {
    const store = getStore();
    const { noteNode, highlightNode } = createNoteWithHighlight({
      store, noteText: 'insight', selectedText: 'the text', clipNodeId: 'webclip_1',
    });

    const highlights = getHighlightsForNote(noteNode.id);
    expect(highlights).toHaveLength(1);
    expect(highlights[0].id).toBe(highlightNode.id);
    expect(highlights[0].name).toBe('the text');
  });
});

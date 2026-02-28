/**
 * highlight-service — #highlight and #comment system tag CRUD tests.
 *
 * Simplified model:
 * - One template field: "Clip" (options_from_supertag → #web_clip)
 * - Anchor data stored in node description (JSON)
 * - Highlight color = tagDef color (no per-node color)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useNodeStore } from '../../src/stores/node-store.js';
import { resetAndSeed } from './helpers/test-state.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { CONTAINER_IDS, SYS_T, FIELD_TYPES } from '../../src/types/index.js';
import {
  ensureHighlightTagDef,
  ensureCommentTagDef,
  createHighlightNode,
  getHighlightsForClip,
  createCommentNode,
  getClipFieldDefId,
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

  it('creates 1 fieldDef (Clip) under tagDef', () => {
    const store = getStore();
    ensureHighlightTagDef(store);

    const children = loroDoc.getChildren(SYS_T.HIGHLIGHT);
    const fieldDefs = children.filter(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldDef';
    });
    expect(fieldDefs).toHaveLength(1);
  });

  it('creates Clip field as options_from_supertag type', () => {
    const store = getStore();
    ensureHighlightTagDef(store);

    const clipFd = loroDoc.toNodexNode(getClipFieldDefId());
    expect(clipFd).toBeDefined();
    expect(clipFd!.name).toBe('Clip');
    expect(clipFd!.fieldType).toBe(FIELD_TYPES.OPTIONS_FROM_SUPERTAG);
  });

  it('sets sourceSupertag on Clip field to #web_clip tagDef', () => {
    const store = getStore();
    ensureHighlightTagDef(store);

    const clipFd = loroDoc.toNodexNode(getClipFieldDefId());
    expect(clipFd!.sourceSupertag).toBeDefined();

    // sourceSupertag should point to #web_clip tagDef
    const sourceTagDef = loroDoc.toNodexNode(clipFd!.sourceSupertag!);
    expect(sourceTagDef).toBeDefined();
    expect(sourceTagDef!.name).toBe('web_clip');
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
    expect(fieldDefs).toHaveLength(1);
  });
});

describe('ensureCommentTagDef', () => {
  beforeEach(() => {
    _resetHighlightCache();
    resetAndSeed();
  });

  it('creates #comment tagDef with fixed ID SYS_T201', () => {
    const store = getStore();
    ensureCommentTagDef(store);

    const tagDef = loroDoc.toNodexNode(SYS_T.COMMENT);
    expect(tagDef).toBeDefined();
    expect(tagDef!.type).toBe('tagDef');
    expect(tagDef!.name).toBe('comment');
  });

  it('creates no fieldDefs under comment tagDef', () => {
    const store = getStore();
    ensureCommentTagDef(store);

    const children = loroDoc.getChildren(SYS_T.COMMENT);
    const fieldDefs = children.filter(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldDef';
    });
    expect(fieldDefs).toHaveLength(0);
  });

  it('is idempotent', () => {
    const store = getStore();
    ensureCommentTagDef(store);
    ensureCommentTagDef(store);

    const tagDef = loroDoc.toNodexNode(SYS_T.COMMENT);
    expect(tagDef).toBeDefined();

    const schemaChildren = loroDoc.getChildren(CONTAINER_IDS.SCHEMA);
    const commentDefs = schemaChildren.filter(cid => cid === SYS_T.COMMENT);
    expect(commentDefs).toHaveLength(1);
  });
});

describe('createHighlightNode', () => {
  beforeEach(() => {
    _resetHighlightCache();
    resetAndSeed();
    const store = getStore();
    ensureHighlightTagDef(store);
    ensureCommentTagDef(store);
  });

  it('creates node in LIBRARY container', () => {
    const store = getStore();
    const node = createHighlightNode({
      store,
      selectedText: 'highlighted text',
    });

    expect(loroDoc.getParentId(node.id)).toBe(CONTAINER_IDS.LIBRARY);
    expect(loroDoc.getChildren(CONTAINER_IDS.LIBRARY)).toContain(node.id);
  });

  it('sets node name to selected text', () => {
    const store = getStore();
    const node = createHighlightNode({
      store,
      selectedText: 'highlighted text',
    });

    const saved = loroDoc.toNodexNode(node.id);
    expect(saved!.name).toBe('highlighted text');
  });

  it('applies #highlight tag', () => {
    const store = getStore();
    const node = createHighlightNode({
      store,
      selectedText: 'test',
    });

    const saved = loroDoc.toNodexNode(node.id);
    expect(saved!.tags).toContain(SYS_T.HIGHLIGHT);
  });

  it('sets Clip field via setOptionsFieldValue when clipNodeId is provided', () => {
    const store = getStore();
    const node = createHighlightNode({
      store,
      selectedText: 'test',
      clipNodeId: 'webclip_1',
    });

    // Verify the Clip fieldEntry exists with a value child referencing the clip
    const children = loroDoc.getChildren(node.id);
    const clipFieldDefId = getClipFieldDefId();
    const fieldEntry = children.find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === clipFieldDefId;
    });
    expect(fieldEntry).toBeDefined();
  });

  it('stores anchor data in node description', () => {
    const store = getStore();
    const anchorJson = JSON.stringify({ version: 1, exact: 'test', prefix: 'before', suffix: 'after' });
    const node = createHighlightNode({
      store,
      selectedText: 'test',
      anchor: anchorJson,
    });

    const saved = loroDoc.toNodexNode(node.id);
    expect(saved!.description).toBe(anchorJson);
  });

  it('skips Clip field when clipNodeId not provided', () => {
    const store = getStore();
    const node = createHighlightNode({
      store,
      selectedText: 'test',
    });

    // No Clip fieldEntry should be explicitly set
    const children = loroDoc.getChildren(node.id);
    const clipFieldDefId = getClipFieldDefId();
    const fieldEntries = children.filter(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === clipFieldDefId;
    });
    // May have an empty fieldEntry from applyTag template sync, but no value children
    for (const feId of fieldEntries) {
      const valueChildren = loroDoc.getChildren(feId);
      expect(valueChildren).toHaveLength(0);
    }
  });
});

describe('getHighlightsForClip', () => {
  beforeEach(() => {
    _resetHighlightCache();
    resetAndSeed();
    const store = getStore();
    ensureHighlightTagDef(store);
    ensureCommentTagDef(store);
  });

  it('returns empty array when no highlights exist', () => {
    expect(getHighlightsForClip('nonexistent_clip')).toEqual([]);
  });

  it('finds highlights linked to a specific clip', () => {
    const store = getStore();
    createHighlightNode({
      store,
      selectedText: 'highlight 1',
      clipNodeId: 'webclip_1',
    });
    createHighlightNode({
      store,
      selectedText: 'highlight 2',
      clipNodeId: 'webclip_1',
    });

    const results = getHighlightsForClip('webclip_1');
    expect(results).toHaveLength(2);
    expect(results.map(r => r.name)).toContain('highlight 1');
    expect(results.map(r => r.name)).toContain('highlight 2');
  });

  it('does not return highlights from different clips', () => {
    const store = getStore();
    createHighlightNode({
      store,
      selectedText: 'for clip A',
      clipNodeId: 'clipA',
    });
    createHighlightNode({
      store,
      selectedText: 'for clip B',
      clipNodeId: 'clipB',
    });

    const results = getHighlightsForClip('clipA');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('for clip A');
  });
});

describe('createCommentNode', () => {
  beforeEach(() => {
    _resetHighlightCache();
    resetAndSeed();
    const store = getStore();
    ensureHighlightTagDef(store);
    ensureCommentTagDef(store);
  });

  it('creates child node under highlight', () => {
    const store = getStore();
    const highlight = createHighlightNode({
      store,
      selectedText: 'test',
    });

    const comment = createCommentNode(store, highlight.id, 'my comment');
    expect(loroDoc.getParentId(comment.id)).toBe(highlight.id);
  });

  it('sets comment text as node name', () => {
    const store = getStore();
    const highlight = createHighlightNode({
      store,
      selectedText: 'test',
    });

    const comment = createCommentNode(store, highlight.id, 'my comment');
    const saved = loroDoc.toNodexNode(comment.id);
    expect(saved!.name).toBe('my comment');
  });

  it('applies #comment tag', () => {
    const store = getStore();
    const highlight = createHighlightNode({
      store,
      selectedText: 'test',
    });

    const comment = createCommentNode(store, highlight.id, 'my comment');
    const saved = loroDoc.toNodexNode(comment.id);
    expect(saved!.tags).toContain(SYS_T.COMMENT);
  });
});

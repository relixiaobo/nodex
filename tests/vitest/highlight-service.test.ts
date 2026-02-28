/**
 * highlight-service — #highlight and #comment system tag CRUD tests.
 *
 * New model:
 * - Highlights are children of clip page nodes
 * - Source field auto-filled by ancestor_supertag_ref strategy
 * - Anchor data stored in node description (JSON)
 * - Highlight color = tagDef color (no per-node color)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useNodeStore } from '../../src/stores/node-store.js';
import { resetAndSeed } from './helpers/test-state.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { CONTAINER_IDS, SYS_T, FIELD_TYPES, AUTO_INIT_STRATEGY } from '../../src/types/index.js';
import {
  ensureHighlightTagDef,
  ensureCommentTagDef,
  createHighlightNode,
  getHighlightsForClip,
  createCommentNode,
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

  it('creates 1 fieldDef (Source) under tagDef', () => {
    const store = getStore();
    ensureHighlightTagDef(store);

    const children = loroDoc.getChildren(SYS_T.HIGHLIGHT);
    const fieldDefs = children.filter(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldDef';
    });
    expect(fieldDefs).toHaveLength(1);
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

    // sourceSupertag should point to #source tagDef
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

  it('creates node as child of clip page', () => {
    const store = getStore();
    const node = createHighlightNode({
      store,
      selectedText: 'highlighted text',
      clipNodeId: 'webclip_1',
    });

    expect(loroDoc.getParentId(node.id)).toBe('webclip_1');
    expect(loroDoc.getChildren('webclip_1')).toContain(node.id);
  });

  it('sets node name to selected text', () => {
    const store = getStore();
    const node = createHighlightNode({
      store,
      selectedText: 'highlighted text',
      clipNodeId: 'webclip_1',
    });

    const saved = loroDoc.toNodexNode(node.id);
    expect(saved!.name).toBe('highlighted text');
  });

  it('applies #highlight tag', () => {
    const store = getStore();
    const node = createHighlightNode({
      store,
      selectedText: 'test',
      clipNodeId: 'webclip_1',
    });

    const saved = loroDoc.toNodexNode(node.id);
    expect(saved!.tags).toContain(SYS_T.HIGHLIGHT);
  });

  it('auto-fills Source field via ancestor_supertag_ref when under clip page', () => {
    const store = getStore();
    const node = createHighlightNode({
      store,
      selectedText: 'test',
      clipNodeId: 'webclip_1',
    });

    // Verify the Source fieldEntry has a value child referencing the clip
    const children = loroDoc.getChildren(node.id);
    const sourceFieldDefId = getSourceFieldDefId();
    const fieldEntry = children.find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === sourceFieldDefId;
    });
    expect(fieldEntry).toBeDefined();

    // Value node should have targetId (reference), not name (text)
    const feChildren = loroDoc.getChildren(fieldEntry!);
    expect(feChildren.length).toBe(1);
    const valueNode = loroDoc.toNodexNode(feChildren[0]);
    expect(valueNode?.targetId).toBe('webclip_1');
  });

  it('stores anchor data in node description', () => {
    const store = getStore();
    const anchorJson = JSON.stringify({ version: 1, exact: 'test', prefix: 'before', suffix: 'after' });
    const node = createHighlightNode({
      store,
      selectedText: 'test',
      clipNodeId: 'webclip_1',
      anchor: anchorJson,
    });

    const saved = loroDoc.toNodexNode(node.id);
    expect(saved!.description).toBe(anchorJson);
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

  it('finds highlights that are children of the clip page', () => {
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

    // Create a second clip page
    const clip2 = store.createChild(CONTAINER_IDS.INBOX, undefined, { name: 'Clip 2' });
    store.applyTag(clip2.id, 'tagDef_source');

    createHighlightNode({
      store,
      selectedText: 'for clip A',
      clipNodeId: 'webclip_1',
    });
    createHighlightNode({
      store,
      selectedText: 'for clip B',
      clipNodeId: clip2.id,
    });

    const results = getHighlightsForClip('webclip_1');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('for clip A');
  });

  it('finds legacy highlights in LIBRARY via Source field match', () => {
    const store = getStore();

    // Simulate legacy: create highlight directly in LIBRARY and set Source field manually
    const legacyNode = store.createChild(CONTAINER_IDS.LIBRARY, undefined, { name: 'legacy highlight' });
    store.applyTag(legacyNode.id, SYS_T.HIGHLIGHT);
    store.setOptionsFieldValue(legacyNode.id, getSourceFieldDefId(), 'webclip_1');

    const results = getHighlightsForClip('webclip_1');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('legacy highlight');
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
      clipNodeId: 'webclip_1',
    });

    const comment = createCommentNode(store, highlight.id, 'my comment');
    expect(loroDoc.getParentId(comment.id)).toBe(highlight.id);
  });

  it('sets comment text as node name', () => {
    const store = getStore();
    const highlight = createHighlightNode({
      store,
      selectedText: 'test',
      clipNodeId: 'webclip_1',
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
      clipNodeId: 'webclip_1',
    });

    const comment = createCommentNode(store, highlight.id, 'my comment');
    const saved = loroDoc.toNodexNode(comment.id);
    expect(saved!.tags).toContain(SYS_T.COMMENT);
  });
});

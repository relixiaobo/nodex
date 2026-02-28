/**
 * highlight-service — #highlight and #comment system tag CRUD tests.
 *
 * Tests:
 * - ensureHighlightTagDef: creates tagDef + 4 fieldDefs + 5 color options
 * - ensureCommentTagDef: creates tagDef (no fields)
 * - createHighlightNode: creates node in LIBRARY with correct structure
 * - getHighlightsForClip: finds highlights by Source field
 * - createCommentNode: creates child with #comment tag
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
  getSourceFieldDefId,
  getAnchorFieldDefId,
  getColorFieldDefId,
  getPageUrlFieldDefId,
  getColorOptionId,
  HIGHLIGHT_COLORS,
  _resetHighlightCache,
  type HighlightNodeStore,
} from '../../src/lib/highlight-service.js';

/** Helper: find fieldEntry child with given fieldDefId. */
function findFieldEntry(nodeId: string, fieldDefId: string): string | undefined {
  return loroDoc.getChildren(nodeId).find(cid => {
    const n = loroDoc.toNodexNode(cid);
    return n?.type === 'fieldEntry' && n.fieldDefId === fieldDefId;
  });
}

/** Helper: get name of first value child of a fieldEntry. */
function getFirstFieldValue(fieldEntryId: string): string | undefined {
  const children = loroDoc.getChildren(fieldEntryId);
  if (children.length === 0) return undefined;
  return loroDoc.toNodexNode(children[0])?.name;
}

/** Helper: get targetId of first value child of a fieldEntry (for options fields). */
function getFirstFieldTargetId(fieldEntryId: string): string | undefined {
  const children = loroDoc.getChildren(fieldEntryId);
  if (children.length === 0) return undefined;
  return loroDoc.toNodexNode(children[0])?.targetId;
}

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

  it('creates 4 fieldDefs under tagDef', () => {
    const store = getStore();
    ensureHighlightTagDef(store);

    const children = loroDoc.getChildren(SYS_T.HIGHLIGHT);
    const fieldDefs = children.filter(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldDef';
    });
    expect(fieldDefs).toHaveLength(4);
  });

  it('creates Source field as plain type', () => {
    const store = getStore();
    ensureHighlightTagDef(store);

    const sourceFd = loroDoc.toNodexNode(getSourceFieldDefId());
    expect(sourceFd).toBeDefined();
    expect(sourceFd!.name).toBe('Source');
    expect(sourceFd!.fieldType).toBe(FIELD_TYPES.PLAIN);
  });

  it('creates Anchor field as plain type', () => {
    const store = getStore();
    ensureHighlightTagDef(store);

    const anchorFd = loroDoc.toNodexNode(getAnchorFieldDefId());
    expect(anchorFd).toBeDefined();
    expect(anchorFd!.name).toBe('Anchor');
    expect(anchorFd!.fieldType).toBe(FIELD_TYPES.PLAIN);
  });

  it('creates Color field as options type with 5 choices', () => {
    const store = getStore();
    ensureHighlightTagDef(store);

    const colorFdId = getColorFieldDefId();
    const colorFd = loroDoc.toNodexNode(colorFdId);
    expect(colorFd).toBeDefined();
    expect(colorFd!.name).toBe('Color');
    expect(colorFd!.fieldType).toBe(FIELD_TYPES.OPTIONS);

    // Check 5 option children
    const optionChildren = loroDoc.getChildren(colorFdId).filter(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === undefined; // option nodes are plain content nodes
    });
    expect(optionChildren).toHaveLength(5);

    // Check option names
    const optionNames = optionChildren.map(cid => loroDoc.toNodexNode(cid)!.name);
    expect(optionNames).toContain('yellow');
    expect(optionNames).toContain('green');
    expect(optionNames).toContain('blue');
    expect(optionNames).toContain('pink');
    expect(optionNames).toContain('purple');
  });

  it('creates Page URL field as url type', () => {
    const store = getStore();
    ensureHighlightTagDef(store);

    const pageUrlFd = loroDoc.toNodexNode(getPageUrlFieldDefId());
    expect(pageUrlFd).toBeDefined();
    expect(pageUrlFd!.name).toBe('Page URL');
    expect(pageUrlFd!.fieldType).toBe(FIELD_TYPES.URL);
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
    expect(fieldDefs).toHaveLength(4);

    // Color options should also not be duplicated
    const colorFdId = getColorFieldDefId();
    const optionChildren = loroDoc.getChildren(colorFdId).filter(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === undefined;
    });
    expect(optionChildren).toHaveLength(5);
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

    // Should still exist
    const tagDef = loroDoc.toNodexNode(SYS_T.COMMENT);
    expect(tagDef).toBeDefined();

    // Count comment tagDefs in schema
    const schemaChildren = loroDoc.getChildren(CONTAINER_IDS.SCHEMA);
    const commentDefs = schemaChildren.filter(cid => {
      const n = loroDoc.toNodexNode(cid);
      return cid === SYS_T.COMMENT;
    });
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

  it('fills Source field with clipNodeId', () => {
    const store = getStore();
    const node = createHighlightNode({
      store,
      selectedText: 'test',
      clipNodeId: 'webclip_1',
    });

    const feId = findFieldEntry(node.id, getSourceFieldDefId());
    expect(feId).toBeDefined();
    expect(getFirstFieldValue(feId!)).toBe('webclip_1');
  });

  it('fills Color field with default yellow', () => {
    const store = getStore();
    const node = createHighlightNode({
      store,
      selectedText: 'test',
    });

    const feId = findFieldEntry(node.id, getColorFieldDefId());
    expect(feId).toBeDefined();
    const targetId = getFirstFieldTargetId(feId!);
    expect(targetId).toBe(getColorOptionId('yellow'));
  });

  it('fills Color field with custom color', () => {
    const store = getStore();
    const node = createHighlightNode({
      store,
      selectedText: 'test',
      color: 'blue',
    });

    const feId = findFieldEntry(node.id, getColorFieldDefId());
    expect(feId).toBeDefined();
    const targetId = getFirstFieldTargetId(feId!);
    expect(targetId).toBe(getColorOptionId('blue'));
  });

  it('fills Anchor field when provided', () => {
    const store = getStore();
    const anchorJson = JSON.stringify({ version: 1, exact: 'test', prefix: 'before', suffix: 'after' });
    const node = createHighlightNode({
      store,
      selectedText: 'test',
      anchor: anchorJson,
    });

    const feId = findFieldEntry(node.id, getAnchorFieldDefId());
    expect(feId).toBeDefined();
    expect(getFirstFieldValue(feId!)).toBe(anchorJson);
  });

  it('fills Page URL field when provided', () => {
    const store = getStore();
    const node = createHighlightNode({
      store,
      selectedText: 'test',
      pageUrl: 'https://example.com/article',
    });

    const feId = findFieldEntry(node.id, getPageUrlFieldDefId());
    expect(feId).toBeDefined();
    expect(getFirstFieldValue(feId!)).toBe('https://example.com/article');
  });

  it('skips Source field when clipNodeId not provided', () => {
    const store = getStore();
    const node = createHighlightNode({
      store,
      selectedText: 'test',
    });

    // Source fieldEntry is still created by applyTag (template sync),
    // but it should have no value children
    const feId = findFieldEntry(node.id, getSourceFieldDefId());
    if (feId) {
      const children = loroDoc.getChildren(feId);
      expect(children).toHaveLength(0);
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

import {
  getAncestorChain,
  getFlattenedVisibleNodes,
  getLastVisibleNode,
  getNavigableParentId,
  getNextVisibleNode,
  getNodeIndex,
  getParentId,
  getPreviousSiblingId,
  getPreviousVisibleNode,
  isOnlyInlineRef,
  isWorkspaceContainer,
} from '../../src/lib/tree-utils.js';
import { resetLoroDoc, initLoroDocForTest, createNode, setNodeDataBatch } from '../../src/lib/loro-doc.js';
import { CONTAINER_IDS } from '../../src/types/index.js';

beforeEach(() => {
  resetLoroDoc();
  initLoroDocForTest('ws_default');
});

describe('tree-utils', () => {
  it('detects workspace containers', () => {
    expect(isWorkspaceContainer(CONTAINER_IDS.LIBRARY)).toBe(true);
    expect(isWorkspaceContainer('note_1')).toBe(false);
    expect(isWorkspaceContainer(CONTAINER_IDS.INBOX)).toBe(true);
  });

  it('builds ancestor chain while skipping structural nodes', () => {
    // Build tree: LIBRARY → parent → fieldEntry → target
    createNode(CONTAINER_IDS.LIBRARY, null);
    setNodeDataBatch(CONTAINER_IDS.LIBRARY, { name: 'Library' });

    createNode('parent', CONTAINER_IDS.LIBRARY);
    setNodeDataBatch('parent', { name: 'Parent' });

    createNode('fieldEntry1', 'parent');
    setNodeDataBatch('fieldEntry1', { type: 'fieldEntry' });

    createNode('target', 'fieldEntry1');
    setNodeDataBatch('target', { name: 'Target' });

    const { ancestors, workspaceRootId } = getAncestorChain('target');
    expect(workspaceRootId).toBe(CONTAINER_IDS.LIBRARY);
    // fieldEntry1 is skipped (structural), so ancestors = [parent]
    expect(ancestors).toEqual([
      { id: 'parent', name: 'Parent' },
    ]);

    expect(getNavigableParentId('target')).toBe('parent');
  });

  it('flattens visible nodes and navigates with parent disambiguation', () => {
    // Build: root → [a, r]; a → [a1, a2]; a1 → [a1c]
    createNode('root', null);
    createNode('a', 'root');
    createNode('a1', 'a');
    createNode('a1c', 'a1');
    createNode('a2', 'a');
    createNode('r', 'root');
    // r also has a1 as child (reference-like - in this test just re-create)
    createNode('a1_ref', 'r');
    setNodeDataBatch('a1_ref', { name: 'a1_ref' });

    const expanded = new Set<string>(['root:a', 'a:a1', 'root:r']);

    const flat = getFlattenedVisibleNodes(['a', 'r'], expanded, 'root');
    expect(flat.map((x) => `${x.parentId}/${x.nodeId}`)).toEqual([
      'root/a',
      'a/a1',
      'a1/a1c',
      'a/a2',
      'root/r',
      'r/a1_ref',
    ]);

    expect(getPreviousVisibleNode('a1', 'a', flat)).toEqual({ nodeId: 'a', parentId: 'root' });
    expect(getNextVisibleNode('a1', 'a', flat)).toEqual({ nodeId: 'a1c', parentId: 'a1' });
  });

  it('finds last visible node and sibling/index helpers', () => {
    // Build: p → [c1, fieldEntry, c2]; c2 → [c2a]
    createNode('p', null);
    createNode('c1', 'p');
    createNode('fieldEntry', 'p');
    setNodeDataBatch('fieldEntry', { type: 'fieldEntry' });
    createNode('c2', 'p');
    createNode('c2a', 'c2');

    // getLastVisibleNode skips structural nodes (fieldEntry)
    // with c2 expanded:
    const result = getLastVisibleNode('p', new Set(['p:c2']));
    expect(result).toEqual({ nodeId: 'c2a', parentId: 'c2' });

    // without expansion:
    const resultCollapsed = getLastVisibleNode('p', new Set());
    expect(resultCollapsed).toEqual({ nodeId: 'c2', parentId: 'p' });

    expect(getParentId('c2a')).toBe('c2');
    expect(getPreviousSiblingId('c2')).toBe('fieldEntry');
    expect(getNodeIndex('c2')).toBe(2);
  });

  it('validates inline-ref-only HTML correctly', () => {
    expect(isOnlyInlineRef('')).toBe(true);
    expect(isOnlyInlineRef('\uFFFC', [{ offset: 0 }])).toBe(true);
    expect(isOnlyInlineRef('x\uFFFC', [{ offset: 1 }])).toBe(false);
    expect(isOnlyInlineRef('<span data-inlineref-node="x">X</span>')).toBe(true);
    expect(isOnlyInlineRef('<p><span data-inlineref-node="x">X</span></p>')).toBe(true);
    expect(isOnlyInlineRef('<span data-inlineref-node="x">X</span> tail')).toBe(false);
    expect(
      isOnlyInlineRef('<span data-inlineref-node="x">X</span><span data-inlineref-node="y">Y</span>'),
    ).toBe(false);
  });
});

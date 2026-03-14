import {
  getAncestorChain,
  getFlattenedVisibleNodes,
  getLastVisibleNode,
  getNavigableParentId,
  getNextVisibleNode,
  getNodeIndex,
  getNodeTextLengthById,
  getParentId,
  getPreviousSiblingId,
  getPreviousVisibleNode,
  isOnlyInlineRef,
} from '../../src/lib/tree-utils.js';
import { resetLoroDoc, initLoroDocForTest, createNode, setNodeDataBatch } from '../../src/lib/loro-doc.js';
import { SYSTEM_NODE_IDS } from '../../src/types/index.js';

beforeEach(() => {
  resetLoroDoc();
  initLoroDocForTest('ws_default');
});

describe('tree-utils', () => {
  it('builds ancestor chain while skipping structural nodes', () => {
    // Build tree: workspace → Library → parent → fieldEntry → target
    createNode('ws_default', null);
    setNodeDataBatch('ws_default', { name: 'Workspace' });

    createNode(SYSTEM_NODE_IDS.LIBRARY, 'ws_default');
    setNodeDataBatch(SYSTEM_NODE_IDS.LIBRARY, { name: 'Library' });

    createNode('parent', SYSTEM_NODE_IDS.LIBRARY);
    setNodeDataBatch('parent', { name: 'Parent' });

    createNode('fieldEntry1', 'parent');
    setNodeDataBatch('fieldEntry1', { type: 'fieldEntry' });

    createNode('target', 'fieldEntry1');
    setNodeDataBatch('target', { name: 'Target' });

    const { ancestors, workspaceRootId } = getAncestorChain('target');
    expect(workspaceRootId).toBe('ws_default');
    expect(ancestors).toEqual([
      { id: 'ws_default', name: 'Workspace' },
      { id: SYSTEM_NODE_IDS.LIBRARY, name: 'Library' },
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

    const expanded = new Set<string>(['main:root:a', 'main:a:a1', 'main:root:r']);

    const flat = getFlattenedVisibleNodes(['a', 'r'], expanded, 'root', 'main');
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

  it('uses getVisualChildIds callback for custom child ordering', () => {
    // Build: root → [a]; a → [c1, c2, c3] (data order)
    createNode('root', null);
    createNode('a', 'root');
    createNode('c1', 'a');
    createNode('c2', 'a');
    createNode('c3', 'a');

    const expanded = new Set<string>(['main:root:a']);

    // Without callback: data order
    const flatDefault = getFlattenedVisibleNodes(['a'], expanded, 'root', 'main');
    expect(flatDefault.map((x) => x.nodeId)).toEqual(['a', 'c1', 'c2', 'c3']);

    // With callback: reversed visual order for node 'a'
    const flatCustom = getFlattenedVisibleNodes(['a'], expanded, 'root', 'main', (nodeId) => {
      if (nodeId === 'a') return ['c3', 'c1', 'c2']; // custom order
      return []; // fallback
    });
    expect(flatCustom.map((x) => x.nodeId)).toEqual(['a', 'c3', 'c1', 'c2']);
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
    const result = getLastVisibleNode('p', new Set(['main:p:c2']), 'main');
    expect(result).toEqual({ nodeId: 'c2a', parentId: 'c2' });

    // without expansion:
    const resultCollapsed = getLastVisibleNode('p', new Set());
    expect(resultCollapsed).toEqual({ nodeId: 'c2', parentId: 'p' });

    expect(getParentId('c2a')).toBe('c2');
    expect(getPreviousSiblingId('c2')).toBe('fieldEntry');
    expect(getNodeIndex('c2')).toBe(2);
  });

  it('getNodeTextLengthById returns name length or 0 for missing nodes', () => {
    createNode('n1', null);
    setNodeDataBatch('n1', { name: 'hello' });
    expect(getNodeTextLengthById('n1')).toBe(5);

    // Reference node returns target name length
    createNode('target1', null);
    setNodeDataBatch('target1', { name: 'world!' });
    createNode('ref1', null);
    setNodeDataBatch('ref1', { type: 'reference', targetId: 'target1' });
    expect(getNodeTextLengthById('ref1')).toBe(6);

    // Missing node returns 0
    expect(getNodeTextLengthById('nonexistent')).toBe(0);
  });

  it('validates inline-ref-only content with explicit inlineRefs', () => {
    expect(isOnlyInlineRef('')).toBe(true);
    expect(isOnlyInlineRef('\uFFFC', [{ offset: 0 }])).toBe(true);
    expect(isOnlyInlineRef('x\uFFFC', [{ offset: 1 }])).toBe(false);
    expect(isOnlyInlineRef('\uFFFC')).toBe(false);
    expect(isOnlyInlineRef('\uFFFC', [{ offset: 1 }])).toBe(false);
    expect(isOnlyInlineRef('\uFFFC', [{ offset: 0 }, { offset: 1 }])).toBe(false);
  });
});

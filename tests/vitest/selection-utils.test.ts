import {
  isNodeOrAncestorSelected,
  hasSelectedAncestor,
  toggleNodeInSelection,
  computeRangeSelection,
  filterToRootLevel,
  getFirstSelectedInOrder,
  getSelectedIdsInOrder,
  getSelectionBounds,
  getEffectiveSelectionBounds,
} from '../../src/lib/selection-utils.js';
import { resetLoroDoc, initLoroDocForTest, createNode } from '../../src/lib/loro-doc.js';

/**
 * Tree structure for tests:
 *
 *  root
 *   ├── A
 *   │   ├── A1
 *   │   └── A2
 *   ├── B
 *   │   └── B1
 *   └── C
 */
function buildTree() {
  createNode('root', null);
  createNode('A', 'root');
  createNode('A1', 'A');
  createNode('A2', 'A');
  createNode('B', 'root');
  createNode('B1', 'B');
  createNode('C', 'root');
}

beforeEach(() => {
  resetLoroDoc();
  initLoroDocForTest('ws_default');
  buildTree();
});

// ─── isNodeOrAncestorSelected ───

describe('isNodeOrAncestorSelected', () => {
  it('returns false for empty selection', () => {
    expect(isNodeOrAncestorSelected('A', new Set())).toBe(false);
  });

  it('returns true if node itself is selected', () => {
    expect(isNodeOrAncestorSelected('A', new Set(['A']))).toBe(true);
  });

  it('returns true if parent is selected', () => {
    expect(isNodeOrAncestorSelected('A1', new Set(['A']))).toBe(true);
  });

  it('returns true if grandparent is selected', () => {
    expect(isNodeOrAncestorSelected('A1', new Set(['root']))).toBe(true);
  });

  it('returns false if sibling is selected (not ancestor)', () => {
    expect(isNodeOrAncestorSelected('B', new Set(['A']))).toBe(false);
  });

  it('returns false for unknown node', () => {
    expect(isNodeOrAncestorSelected('unknown', new Set(['A']))).toBe(false);
  });
});

// ─── hasSelectedAncestor ───

describe('hasSelectedAncestor', () => {
  it('returns false for empty selection', () => {
    expect(hasSelectedAncestor('A1', new Set())).toBe(false);
  });

  it('returns false if only self is selected (not ancestor)', () => {
    expect(hasSelectedAncestor('A', new Set(['A']))).toBe(false);
  });

  it('returns true if parent is selected', () => {
    expect(hasSelectedAncestor('A1', new Set(['A']))).toBe(true);
  });

  it('returns false for root node (no parent)', () => {
    expect(hasSelectedAncestor('root', new Set(['root']))).toBe(false);
  });
});

// ─── toggleNodeInSelection ───

describe('toggleNodeInSelection', () => {
  it('adds a new node to empty selection', () => {
    const result = toggleNodeInSelection('A', new Set());
    expect(result).toEqual(new Set(['A']));
  });

  it('removes a directly selected node', () => {
    const result = toggleNodeInSelection('A', new Set(['A', 'B']));
    expect(result).toEqual(new Set(['B']));
  });

  it('ignores click on node whose ancestor is selected', () => {
    const result = toggleNodeInSelection('A1', new Set(['A']));
    // A1 is already implicitly selected via A — no change
    expect(result).toEqual(new Set(['A']));
  });

  it('absorbs descendants when selecting ancestor', () => {
    const result = toggleNodeInSelection('A', new Set(['A1', 'A2']));
    // Selecting A absorbs A1 and A2
    expect(result).toEqual(new Set(['A']));
  });

  it('absorbs nested descendants when selecting high ancestor', () => {
    const result = toggleNodeInSelection('root', new Set(['A1', 'B1', 'C']));
    // root absorbs all descendants
    expect(result).toEqual(new Set(['root']));
  });

  it('adds node alongside non-ancestor selections', () => {
    const result = toggleNodeInSelection('C', new Set(['A']));
    expect(result).toEqual(new Set(['A', 'C']));
  });
});

// ─── computeRangeSelection ───
// These tests use flatList and don't need ancestor traversal (they pass flatList for context)

describe('computeRangeSelection', () => {
  // Flat list: A, A1, A2, B, B1, C (all expanded)
  const flatList = [
    { nodeId: 'A', parentId: 'root' },
    { nodeId: 'A1', parentId: 'A' },
    { nodeId: 'A2', parentId: 'A' },
    { nodeId: 'B', parentId: 'root' },
    { nodeId: 'B1', parentId: 'B' },
    { nodeId: 'C', parentId: 'root' },
  ];

  it('selects range between anchor and target (forward)', () => {
    const result = computeRangeSelection('A', 'B', flatList);
    expect(result).toEqual(new Set(['A', 'B']));
  });

  it('selects range between anchor and target (backward)', () => {
    const result = computeRangeSelection('C', 'B', flatList);
    expect(result).toEqual(new Set(['B', 'C']));
  });

  it('selects single node when anchor equals target', () => {
    const result = computeRangeSelection('B', 'B', flatList);
    expect(result).toEqual(new Set(['B']));
  });

  it('handles full range from first to last', () => {
    const result = computeRangeSelection('A', 'C', flatList);
    expect(result).toEqual(new Set(['A', 'B', 'C']));
  });

  it('handles missing anchor gracefully', () => {
    const result = computeRangeSelection('MISSING', 'A', flatList);
    expect(result.has('MISSING')).toBe(true);
    expect(result.has('A')).toBe(true);
  });
});

// ─── filterToRootLevel ───

describe('filterToRootLevel', () => {
  it('keeps only root-level nodes', () => {
    const result = filterToRootLevel(new Set(['A', 'A1', 'A2', 'B']));
    expect(result).toEqual(new Set(['A', 'B']));
  });

  it('returns all if none are ancestors of each other', () => {
    const result = filterToRootLevel(new Set(['A', 'B', 'C']));
    expect(result).toEqual(new Set(['A', 'B', 'C']));
  });

  it('handles empty set', () => {
    const result = filterToRootLevel(new Set());
    expect(result).toEqual(new Set());
  });

  it('handles deeply nested chain', () => {
    const result = filterToRootLevel(new Set(['root', 'A', 'A1']));
    expect(result).toEqual(new Set(['root']));
  });
});

// ─── getFirstSelectedInOrder ───

describe('getFirstSelectedInOrder', () => {
  const flatList = [
    { nodeId: 'A', parentId: 'root' },
    { nodeId: 'B', parentId: 'root' },
    { nodeId: 'C', parentId: 'root' },
  ];

  it('returns first selected node in visible order', () => {
    const result = getFirstSelectedInOrder(new Set(['B', 'C']), flatList);
    expect(result).toEqual({ nodeId: 'B', parentId: 'root' });
  });

  it('returns null for empty selection', () => {
    const result = getFirstSelectedInOrder(new Set(), flatList);
    expect(result).toBeNull();
  });

  it('returns the only selected node', () => {
    const result = getFirstSelectedInOrder(new Set(['C']), flatList);
    expect(result).toEqual({ nodeId: 'C', parentId: 'root' });
  });
});

// ─── getSelectedIdsInOrder ───

describe('getSelectedIdsInOrder', () => {
  const flatList = [
    { nodeId: 'A', parentId: 'root' },
    { nodeId: 'A1', parentId: 'A' },
    { nodeId: 'A2', parentId: 'A' },
    { nodeId: 'B', parentId: 'root' },
    { nodeId: 'C', parentId: 'root' },
  ];

  it('returns selected IDs in visible order', () => {
    expect(getSelectedIdsInOrder(new Set(['C', 'A']), flatList)).toEqual(['A', 'C']);
  });

  it('returns empty array for empty selection', () => {
    expect(getSelectedIdsInOrder(new Set(), flatList)).toEqual([]);
  });

  it('filters to only IDs in selectedIds set', () => {
    expect(getSelectedIdsInOrder(new Set(['B']), flatList)).toEqual(['B']);
  });

  it('ignores selected IDs not in flatList', () => {
    expect(getSelectedIdsInOrder(new Set(['X', 'A']), flatList)).toEqual(['A']);
  });
});

// ─── getSelectionBounds ───

describe('getSelectionBounds', () => {
  const flatList = [
    { nodeId: 'A', parentId: 'root' },
    { nodeId: 'B', parentId: 'root' },
    { nodeId: 'C', parentId: 'root' },
    { nodeId: 'D', parentId: 'root' },
  ];

  it('returns first and last selected nodes', () => {
    const result = getSelectionBounds(new Set(['B', 'D']), flatList);
    expect(result).toEqual({
      first: { nodeId: 'B', parentId: 'root' },
      last: { nodeId: 'D', parentId: 'root' },
    });
  });

  it('returns same node for single selection', () => {
    const result = getSelectionBounds(new Set(['C']), flatList);
    expect(result).toEqual({
      first: { nodeId: 'C', parentId: 'root' },
      last: { nodeId: 'C', parentId: 'root' },
    });
  });

  it('returns null for empty selection', () => {
    const result = getSelectionBounds(new Set(), flatList);
    expect(result).toBeNull();
  });

  it('handles non-contiguous selection', () => {
    const result = getSelectionBounds(new Set(['A', 'C', 'D']), flatList);
    expect(result).toEqual({
      first: { nodeId: 'A', parentId: 'root' },
      last: { nodeId: 'D', parentId: 'root' },
    });
  });
});

// ─── getEffectiveSelectionBounds ───

describe('getEffectiveSelectionBounds', () => {
  // Flat list: A, A1, A2, B, B1, C (all expanded)
  const flatList = [
    { nodeId: 'A', parentId: 'root' },
    { nodeId: 'A1', parentId: 'A' },
    { nodeId: 'A2', parentId: 'A' },
    { nodeId: 'B', parentId: 'root' },
    { nodeId: 'B1', parentId: 'B' },
    { nodeId: 'C', parentId: 'root' },
  ];

  it('returns null for empty selection', () => {
    expect(getEffectiveSelectionBounds(new Set(), flatList)).toBeNull();
  });

  it('includes implicitly selected descendants of a parent', () => {
    const result = getEffectiveSelectionBounds(new Set(['A']), flatList);
    expect(result).toEqual({ firstIdx: 0, lastIdx: 2 }); // A(0) through A2(2)
  });

  it('returns exact index for leaf node selection', () => {
    const result = getEffectiveSelectionBounds(new Set(['C']), flatList);
    expect(result).toEqual({ firstIdx: 5, lastIdx: 5 });
  });

  it('spans across multiple selected parents with descendants', () => {
    const result = getEffectiveSelectionBounds(new Set(['A', 'B']), flatList);
    expect(result).toEqual({ firstIdx: 0, lastIdx: 4 }); // A(0) through B1(4)
  });

  it('matches getSelectionBounds when no children are expanded', () => {
    const collapsedList = [
      { nodeId: 'A', parentId: 'root' },
      { nodeId: 'B', parentId: 'root' },
      { nodeId: 'C', parentId: 'root' },
    ];
    const result = getEffectiveSelectionBounds(new Set(['A', 'C']), collapsedList);
    expect(result).toEqual({ firstIdx: 0, lastIdx: 2 });
  });
});

// ─── filterToRootLevel with flatList (display hierarchy) ───

describe('filterToRootLevel with flatList (display hierarchy)', () => {
  it('filters using display hierarchy when flatList provided', () => {
    const flatList = [
      { nodeId: 'A', parentId: 'root' },
      { nodeId: 'A1', parentId: 'A' },
      { nodeId: 'A2', parentId: 'A' },
      { nodeId: 'B', parentId: 'root' },
    ];
    const result = filterToRootLevel(new Set(['A', 'A1', 'A2', 'B']), undefined, flatList);
    expect(result).toEqual(new Set(['A', 'B']));
  });

  it('does NOT incorrectly filter reference nodes via LoroDoc parent', () => {
    // Add a reference node R whose LoroDoc parent is A, but displayed under B
    createNode('R', 'A');
    const flatList = [
      { nodeId: 'A', parentId: 'root' },
      { nodeId: 'B', parentId: 'root' },
      { nodeId: 'R', parentId: 'B' },  // displayed under B
      { nodeId: 'C', parentId: 'root' },
    ];
    // A and R: R's display parent is B, so R is NOT covered by A
    const result = filterToRootLevel(new Set(['A', 'R']), undefined, flatList);
    expect(result).toEqual(new Set(['A', 'R']));
  });

  it('reference node filtered when its display parent IS selected', () => {
    createNode('R', 'A');
    const flatList = [
      { nodeId: 'A', parentId: 'root' },
      { nodeId: 'B', parentId: 'root' },
      { nodeId: 'R', parentId: 'B' },
      { nodeId: 'C', parentId: 'root' },
    ];
    // Select B and R: R's display parent is B → filtered out
    const result = filterToRootLevel(new Set(['B', 'R']), undefined, flatList);
    expect(result).toEqual(new Set(['B']));
  });
});

describe('computeRangeSelection with reference nodes', () => {
  it('range across reference node includes it correctly', () => {
    createNode('D', 'root');
    // Flat list: A, R (ref displayed at root level), B
    const flatList = [
      { nodeId: 'A', parentId: 'root' },
      { nodeId: 'D', parentId: 'root' },
      { nodeId: 'B', parentId: 'root' },
    ];
    const result = computeRangeSelection('A', 'B', flatList);
    expect(result).toEqual(new Set(['A', 'D', 'B']));
  });
});

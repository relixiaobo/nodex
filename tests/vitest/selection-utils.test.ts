import type { NodexNode } from '../../src/types/index.js';
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

/** Helper to create a minimal NodexNode. */
function makeNode(id: string, ownerId: string | undefined, children: string[] = []): NodexNode {
  return {
    id,
    workspaceId: 'ws',
    children,
    associationMap: {},
    touchCounts: [],
    modifiedTs: [],
    props: {
      _ownerId: ownerId,
      created: Date.now(),
    },
  } as unknown as NodexNode;
}

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
function makeEntities(): Record<string, NodexNode> {
  return {
    root: makeNode('root', undefined, ['A', 'B', 'C']),
    A: makeNode('A', 'root', ['A1', 'A2']),
    A1: makeNode('A1', 'A', []),
    A2: makeNode('A2', 'A', []),
    B: makeNode('B', 'root', ['B1']),
    B1: makeNode('B1', 'B', []),
    C: makeNode('C', 'root', []),
  };
}

// ─── isNodeOrAncestorSelected ───

describe('isNodeOrAncestorSelected', () => {
  const entities = makeEntities();

  it('returns false for empty selection', () => {
    expect(isNodeOrAncestorSelected('A', new Set(), entities)).toBe(false);
  });

  it('returns true if node itself is selected', () => {
    expect(isNodeOrAncestorSelected('A', new Set(['A']), entities)).toBe(true);
  });

  it('returns true if parent is selected', () => {
    expect(isNodeOrAncestorSelected('A1', new Set(['A']), entities)).toBe(true);
  });

  it('returns true if grandparent is selected', () => {
    expect(isNodeOrAncestorSelected('A1', new Set(['root']), entities)).toBe(true);
  });

  it('returns false if sibling is selected (not ancestor)', () => {
    expect(isNodeOrAncestorSelected('B', new Set(['A']), entities)).toBe(false);
  });

  it('returns false for unknown node', () => {
    expect(isNodeOrAncestorSelected('unknown', new Set(['A']), entities)).toBe(false);
  });
});

// ─── hasSelectedAncestor ───

describe('hasSelectedAncestor', () => {
  const entities = makeEntities();

  it('returns false for empty selection', () => {
    expect(hasSelectedAncestor('A1', new Set(), entities)).toBe(false);
  });

  it('returns false if only self is selected (not ancestor)', () => {
    expect(hasSelectedAncestor('A', new Set(['A']), entities)).toBe(false);
  });

  it('returns true if parent is selected', () => {
    expect(hasSelectedAncestor('A1', new Set(['A']), entities)).toBe(true);
  });

  it('returns false for root node (no parent)', () => {
    expect(hasSelectedAncestor('root', new Set(['root']), entities)).toBe(false);
  });
});

// ─── toggleNodeInSelection ───

describe('toggleNodeInSelection', () => {
  const entities = makeEntities();

  it('adds a new node to empty selection', () => {
    const result = toggleNodeInSelection('A', new Set(), entities);
    expect(result).toEqual(new Set(['A']));
  });

  it('removes a directly selected node', () => {
    const result = toggleNodeInSelection('A', new Set(['A', 'B']), entities);
    expect(result).toEqual(new Set(['B']));
  });

  it('ignores click on node whose ancestor is selected', () => {
    const result = toggleNodeInSelection('A1', new Set(['A']), entities);
    // A1 is already implicitly selected via A — no change
    expect(result).toEqual(new Set(['A']));
  });

  it('absorbs descendants when selecting ancestor', () => {
    const result = toggleNodeInSelection('A', new Set(['A1', 'A2']), entities);
    // Selecting A absorbs A1 and A2
    expect(result).toEqual(new Set(['A']));
  });

  it('absorbs nested descendants when selecting high ancestor', () => {
    const result = toggleNodeInSelection('root', new Set(['A1', 'B1', 'C']), entities);
    // root absorbs all descendants
    expect(result).toEqual(new Set(['root']));
  });

  it('adds node alongside non-ancestor selections', () => {
    const result = toggleNodeInSelection('C', new Set(['A']), entities);
    expect(result).toEqual(new Set(['A', 'C']));
  });
});

// ─── computeRangeSelection ───

describe('computeRangeSelection', () => {
  const entities = makeEntities();
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
    const result = computeRangeSelection('A', 'B', flatList, entities);
    // Range: A, A1, A2, B → root-level filter: A (covers A1,A2) + B
    expect(result).toEqual(new Set(['A', 'B']));
  });

  it('selects range between anchor and target (backward)', () => {
    const result = computeRangeSelection('C', 'B', flatList, entities);
    // Range: B, B1, C → root-level: B (covers B1) + C
    expect(result).toEqual(new Set(['B', 'C']));
  });

  it('selects single node when anchor equals target', () => {
    const result = computeRangeSelection('B', 'B', flatList, entities);
    expect(result).toEqual(new Set(['B']));
  });

  it('handles full range from first to last', () => {
    const result = computeRangeSelection('A', 'C', flatList, entities);
    // All nodes → root-level: A, B, C (A covers A1/A2, B covers B1)
    expect(result).toEqual(new Set(['A', 'B', 'C']));
  });

  it('handles missing anchor gracefully', () => {
    const result = computeRangeSelection('MISSING', 'A', flatList, entities);
    // Fallback: both IDs
    expect(result.has('MISSING')).toBe(true);
    expect(result.has('A')).toBe(true);
  });
});

// ─── filterToRootLevel ───

describe('filterToRootLevel', () => {
  const entities = makeEntities();

  it('keeps only root-level nodes', () => {
    const result = filterToRootLevel(new Set(['A', 'A1', 'A2', 'B']), entities);
    expect(result).toEqual(new Set(['A', 'B']));
  });

  it('returns all if none are ancestors of each other', () => {
    const result = filterToRootLevel(new Set(['A', 'B', 'C']), entities);
    expect(result).toEqual(new Set(['A', 'B', 'C']));
  });

  it('handles empty set', () => {
    const result = filterToRootLevel(new Set(), entities);
    expect(result).toEqual(new Set());
  });

  it('handles deeply nested chain', () => {
    const result = filterToRootLevel(new Set(['root', 'A', 'A1']), entities);
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
  const entities = makeEntities();
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
    expect(getEffectiveSelectionBounds(new Set(), flatList, entities)).toBeNull();
  });

  it('includes implicitly selected descendants of a parent', () => {
    // Only A is in selectedNodeIds, but A1 and A2 are descendants
    const result = getEffectiveSelectionBounds(new Set(['A']), flatList, entities);
    expect(result).toEqual({ firstIdx: 0, lastIdx: 2 }); // A(0) through A2(2)
  });

  it('returns exact index for leaf node selection', () => {
    const result = getEffectiveSelectionBounds(new Set(['C']), flatList, entities);
    expect(result).toEqual({ firstIdx: 5, lastIdx: 5 }); // C is at index 5
  });

  it('spans across multiple selected parents with descendants', () => {
    // A and B selected → covers A, A1, A2, B, B1
    const result = getEffectiveSelectionBounds(new Set(['A', 'B']), flatList, entities);
    expect(result).toEqual({ firstIdx: 0, lastIdx: 4 }); // A(0) through B1(4)
  });

  it('matches getSelectionBounds when no children are expanded', () => {
    // Collapsed flat list: only A, B, C (no children visible)
    const collapsedList = [
      { nodeId: 'A', parentId: 'root' },
      { nodeId: 'B', parentId: 'root' },
      { nodeId: 'C', parentId: 'root' },
    ];
    const result = getEffectiveSelectionBounds(new Set(['A', 'C']), collapsedList, entities);
    expect(result).toEqual({ firstIdx: 0, lastIdx: 2 }); // A(0) through C(2)
  });

  it('includes reference node descendants via display hierarchy', () => {
    // Reference node R appears under B in display, but _ownerId points to A.
    // If B is selected, R (displayed under B) should be counted as implicitly selected.
    const refEntities: Record<string, NodexNode> = {
      ...entities,
      R: makeNode('R', 'A', []), // _ownerId = A (original owner)
    };
    // In the display tree, R appears under B (as a reference)
    const refFlatList = [
      { nodeId: 'A', parentId: 'root' },
      { nodeId: 'A1', parentId: 'A' },
      { nodeId: 'A2', parentId: 'A' },
      { nodeId: 'B', parentId: 'root' },
      { nodeId: 'R', parentId: 'B' },  // R displayed under B
      { nodeId: 'B1', parentId: 'B' },
      { nodeId: 'C', parentId: 'root' },
    ];
    // B selected → R (display child of B) should be included in effective bounds
    const result = getEffectiveSelectionBounds(new Set(['B']), refFlatList, refEntities);
    expect(result).toEqual({ firstIdx: 3, lastIdx: 5 }); // B(3) through B1(5), including R(4)
  });
});

// ─── Reference node selection tests ───

describe('filterToRootLevel with flatList (display hierarchy)', () => {
  const entities = makeEntities();

  it('filters using display hierarchy when flatList provided', () => {
    // A1 is displayed under A in flatList, so selecting {A, A1} → keeps only A
    const flatList = [
      { nodeId: 'A', parentId: 'root' },
      { nodeId: 'A1', parentId: 'A' },
      { nodeId: 'A2', parentId: 'A' },
      { nodeId: 'B', parentId: 'root' },
    ];
    const result = filterToRootLevel(new Set(['A', 'A1', 'A2', 'B']), entities, flatList);
    expect(result).toEqual(new Set(['A', 'B']));
  });

  it('does NOT incorrectly filter reference nodes via _ownerId', () => {
    // Reference node R: _ownerId = A (original owner), but displayed under B
    const refEntities: Record<string, NodexNode> = {
      ...entities,
      R: makeNode('R', 'A', []), // _ownerId points to A
    };
    const flatList = [
      { nodeId: 'A', parentId: 'root' },
      { nodeId: 'B', parentId: 'root' },
      { nodeId: 'R', parentId: 'B' },  // displayed under B
      { nodeId: 'C', parentId: 'root' },
    ];
    // Select A and R: without flatList, _ownerId chain would see R→A→root,
    // incorrectly filtering R as covered by A. With flatList, R's display parent is B,
    // so R is NOT covered by A.
    const result = filterToRootLevel(new Set(['A', 'R']), refEntities, flatList);
    expect(result).toEqual(new Set(['A', 'R'])); // Both kept
  });

  it('reference node filtered when its display parent IS selected', () => {
    const refEntities: Record<string, NodexNode> = {
      ...entities,
      R: makeNode('R', 'A', []),
    };
    const flatList = [
      { nodeId: 'A', parentId: 'root' },
      { nodeId: 'B', parentId: 'root' },
      { nodeId: 'R', parentId: 'B' },
      { nodeId: 'C', parentId: 'root' },
    ];
    // Select B and R: R's display parent is B, so R is filtered out
    const result = filterToRootLevel(new Set(['B', 'R']), refEntities, flatList);
    expect(result).toEqual(new Set(['B']));
  });
});

describe('computeRangeSelection with reference nodes', () => {
  it('range across reference node includes it correctly', () => {
    const refEntities: Record<string, NodexNode> = {
      ...makeEntities(),
      R: makeNode('R', 'A', []), // _ownerId = A, displayed under root
    };
    // Flat list: A, R (ref displayed at root level), B
    const flatList = [
      { nodeId: 'A', parentId: 'root' },
      { nodeId: 'R', parentId: 'root' },  // reference at root level
      { nodeId: 'B', parentId: 'root' },
    ];
    // Range from A to B should include R
    const result = computeRangeSelection('A', 'B', flatList, refEntities);
    expect(result).toEqual(new Set(['A', 'R', 'B']));
  });

  it('range does not oscillate: reference node not wrongly removed', () => {
    // This is the core bug scenario: selecting A → extending to include R
    // R's _ownerId = A, so old filterToRootLevel would see R as covered by A.
    // With flatList-based filtering, R at root display level stays.
    const refEntities: Record<string, NodexNode> = {
      ...makeEntities(),
      R: makeNode('R', 'A', []),
    };
    const flatList = [
      { nodeId: 'A', parentId: 'root' },
      { nodeId: 'A1', parentId: 'A' },
      { nodeId: 'A2', parentId: 'A' },
      { nodeId: 'R', parentId: 'root' },  // ref at root level
      { nodeId: 'B', parentId: 'root' },
    ];
    // Range from A to R
    const result = computeRangeSelection('A', 'R', flatList, refEntities);
    // A covers A1/A2 (display children), R is at root → both A and R in result
    expect(result).toEqual(new Set(['A', 'R']));
  });
});

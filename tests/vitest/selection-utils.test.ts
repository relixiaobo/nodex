import type { NodexNode } from '../../src/types/index.js';
import {
  isNodeOrAncestorSelected,
  hasSelectedAncestor,
  toggleNodeInSelection,
  computeRangeSelection,
  filterToRootLevel,
  getFirstSelectedInOrder,
  getSelectionBounds,
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

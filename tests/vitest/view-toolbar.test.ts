/**
 * view-toolbar — tests for ViewDef node creation and sort config management.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock loro-doc ──
const mockNodes = new Map<string, Record<string, unknown>>();
const mockChildren = new Map<string, string[]>();
const mockDeletedKeys = new Map<string, Set<string>>();

vi.mock('../../src/lib/loro-doc.js', () => ({
  subscribe: vi.fn(),
  isDetached: () => false,
  toNodexNode: (id: string) => {
    const data = mockNodes.get(id);
    if (!data) return null;
    return {
      id,
      children: mockChildren.get(id) ?? [],
      tags: (data.tags as string[]) ?? [],
      createdAt: data.createdAt ?? Date.now(),
      updatedAt: data.updatedAt ?? Date.now(),
      ...data,
    };
  },
  getChildren: (id: string) => mockChildren.get(id) ?? [],
  getParentId: (_id: string) => null,
  createNode: (id: string, parentId: string) => {
    mockNodes.set(id, { id });
    const children = mockChildren.get(parentId) ?? [];
    children.unshift(id);
    mockChildren.set(parentId, children);
  },
  setNodeDataBatch: (id: string, data: Record<string, unknown>) => {
    const existing = mockNodes.get(id) ?? {};
    mockNodes.set(id, { ...existing, ...data });
  },
  deleteNodeData: (id: string, key: string) => {
    const existing = mockNodes.get(id);
    if (existing) {
      delete existing[key];
      mockNodes.set(id, existing);
    }
    const keys = mockDeletedKeys.get(id) ?? new Set();
    keys.add(key);
    mockDeletedKeys.set(id, keys);
  },
  deleteNode: (id: string) => {
    mockNodes.delete(id);
    // Remove from parent's children list
    for (const [parentId, children] of mockChildren.entries()) {
      const idx = children.indexOf(id);
      if (idx !== -1) {
        children.splice(idx, 1);
        mockChildren.set(parentId, children);
        break;
      }
    }
  },
  commitDoc: vi.fn(),
}));

// ── Import store after mock ──
const { useNodeStore } = await import('../../src/stores/node-store.js');

beforeEach(() => {
  mockNodes.clear();
  mockChildren.clear();
  mockDeletedKeys.clear();

  // Set up a parent node with some content children
  mockNodes.set('parent', { id: 'parent', name: 'Parent' });
  mockNodes.set('c1', { id: 'c1', name: 'Child 1' });
  mockNodes.set('c2', { id: 'c2', name: 'Child 2' });
  mockChildren.set('parent', ['c1', 'c2']);
});

describe('getViewDefId', () => {
  it('returns null when no viewDef child exists', () => {
    const result = useNodeStore.getState().getViewDefId('parent');
    expect(result).toBeNull();
  });

  it('returns the viewDef child ID', () => {
    const viewDefId = 'vd1';
    mockNodes.set(viewDefId, { id: viewDefId, type: 'viewDef' });
    mockChildren.set('parent', [viewDefId, 'c1', 'c2']);

    const result = useNodeStore.getState().getViewDefId('parent');
    expect(result).toBe(viewDefId);
  });

  it('ignores non-viewDef children', () => {
    mockNodes.set('ref1', { id: 'ref1', type: 'reference' });
    mockChildren.set('parent', ['ref1', 'c1', 'c2']);

    const result = useNodeStore.getState().getViewDefId('parent');
    expect(result).toBeNull();
  });
});

describe('setSortConfig (creates sortRule child nodes)', () => {
  it('creates a viewDef and sortRule node when none exists', () => {
    useNodeStore.getState().setSortConfig('parent', 'name', 'asc');

    // A viewDef child should have been created
    const viewDefId = useNodeStore.getState().getViewDefId('parent');
    expect(viewDefId).not.toBeNull();

    const viewDef = mockNodes.get(viewDefId!);
    expect(viewDef?.type).toBe('viewDef');

    // sortRule should be a child of viewDef
    const rules = useNodeStore.getState().getSortRules('parent');
    expect(rules).toHaveLength(1);
    expect(rules[0].field).toBe('name');
    expect(rules[0].direction).toBe('asc');
  });

  it('reuses existing viewDef node and creates sortRule child', () => {
    const existingViewDefId = 'vd_existing';
    mockNodes.set(existingViewDefId, { id: existingViewDefId, type: 'viewDef' });
    mockChildren.set(existingViewDefId, []);
    mockChildren.set('parent', [existingViewDefId, 'c1', 'c2']);

    useNodeStore.getState().setSortConfig('parent', 'createdAt', 'desc');

    // Should use the existing viewDef, not create a new one
    const children = mockChildren.get('parent')!;
    const viewDefChildren = children.filter((id) => mockNodes.get(id)?.type === 'viewDef');
    expect(viewDefChildren).toHaveLength(1);
    expect(viewDefChildren[0]).toBe(existingViewDefId);

    // Sort rule should be a child of viewDef
    const rules = useNodeStore.getState().getSortRules('parent');
    expect(rules).toHaveLength(1);
    expect(rules[0].field).toBe('createdAt');
    expect(rules[0].direction).toBe('desc');
  });
});

describe('addSortRule / removeSortRule / updateSortRule', () => {
  it('adds multiple sort rules', () => {
    useNodeStore.getState().addSortRule('parent', 'name', 'asc');
    useNodeStore.getState().addSortRule('parent', 'createdAt', 'desc');

    const rules = useNodeStore.getState().getSortRules('parent');
    expect(rules).toHaveLength(2);
    // Mock createNode prepends, so order is reversed
    const fields = rules.map((r) => r.field);
    expect(fields).toContain('name');
    expect(fields).toContain('createdAt');
  });

  it('updates a sort rule', () => {
    useNodeStore.getState().addSortRule('parent', 'name', 'asc');
    const rules = useNodeStore.getState().getSortRules('parent');
    expect(rules).toHaveLength(1);

    useNodeStore.getState().updateSortRule(rules[0].id, 'updatedAt', 'desc');
    const updated = useNodeStore.getState().getSortRules('parent');
    expect(updated[0].field).toBe('updatedAt');
    expect(updated[0].direction).toBe('desc');
  });

  it('removes a single sort rule', () => {
    useNodeStore.getState().addSortRule('parent', 'name', 'asc');
    useNodeStore.getState().addSortRule('parent', 'createdAt', 'desc');

    const rules = useNodeStore.getState().getSortRules('parent');
    expect(rules).toHaveLength(2);

    // Remove the first rule, one should remain
    const removedField = rules[0].field;
    const keptField = rules[1].field;
    useNodeStore.getState().removeSortRule(rules[0].id);
    const remaining = useNodeStore.getState().getSortRules('parent');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].field).toBe(keptField);
    expect(remaining[0].field).not.toBe(removedField);
  });
});

describe('clearAllSortRules', () => {
  it('removes all sortRule children and legacy props', () => {
    // Set up a viewDef with legacy props + a sortRule child
    const viewDefId = 'vd1';
    mockNodes.set(viewDefId, {
      id: viewDefId,
      type: 'viewDef',
      sortField: 'name',
      sortDirection: 'asc',
    });
    mockChildren.set(viewDefId, []);
    mockChildren.set('parent', [viewDefId, 'c1', 'c2']);

    // Add a sortRule child
    useNodeStore.getState().addSortRule('parent', 'createdAt', 'desc');
    expect(useNodeStore.getState().getSortRules('parent')).toHaveLength(1);

    useNodeStore.getState().clearAllSortRules('parent');

    // sortRule children should be removed
    expect(useNodeStore.getState().getSortRules('parent')).toHaveLength(0);
    // Legacy props should be deleted
    const deletedKeys = mockDeletedKeys.get(viewDefId);
    expect(deletedKeys?.has('sortField')).toBe(true);
    expect(deletedKeys?.has('sortDirection')).toBe(true);
  });

  it('no-ops when no viewDef exists', () => {
    // Should not throw
    useNodeStore.getState().clearAllSortRules('parent');
    expect(mockDeletedKeys.size).toBe(0);
  });
});

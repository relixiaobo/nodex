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

describe('setSortConfig', () => {
  it('creates a viewDef node when none exists', () => {
    useNodeStore.getState().setSortConfig('parent', 'name', 'asc');

    // A viewDef child should have been created
    const viewDefId = useNodeStore.getState().getViewDefId('parent');
    expect(viewDefId).not.toBeNull();

    const viewDef = mockNodes.get(viewDefId!);
    expect(viewDef?.type).toBe('viewDef');
    expect(viewDef?.sortField).toBe('name');
    expect(viewDef?.sortDirection).toBe('asc');
  });

  it('reuses existing viewDef node', () => {
    const existingViewDefId = 'vd_existing';
    mockNodes.set(existingViewDefId, { id: existingViewDefId, type: 'viewDef' });
    mockChildren.set('parent', [existingViewDefId, 'c1', 'c2']);

    useNodeStore.getState().setSortConfig('parent', 'createdAt', 'desc');

    // Should use the existing viewDef, not create a new one
    const children = mockChildren.get('parent')!;
    const viewDefChildren = children.filter((id) => mockNodes.get(id)?.type === 'viewDef');
    expect(viewDefChildren).toHaveLength(1);
    expect(viewDefChildren[0]).toBe(existingViewDefId);

    const viewDef = mockNodes.get(existingViewDefId);
    expect(viewDef?.sortField).toBe('createdAt');
    expect(viewDef?.sortDirection).toBe('desc');
  });
});

describe('clearSort', () => {
  it('deletes sortField and sortDirection from viewDef', () => {
    // First set up a viewDef with sort config
    const viewDefId = 'vd1';
    mockNodes.set(viewDefId, {
      id: viewDefId,
      type: 'viewDef',
      sortField: 'name',
      sortDirection: 'asc',
    });
    mockChildren.set('parent', [viewDefId, 'c1', 'c2']);

    useNodeStore.getState().clearSort('parent');

    // Both keys should have been deleted
    const deletedKeys = mockDeletedKeys.get(viewDefId);
    expect(deletedKeys?.has('sortField')).toBe(true);
    expect(deletedKeys?.has('sortDirection')).toBe(true);
  });

  it('no-ops when no viewDef exists', () => {
    // Should not throw
    useNodeStore.getState().clearSort('parent');
    expect(mockDeletedKeys.size).toBe(0);
  });
});

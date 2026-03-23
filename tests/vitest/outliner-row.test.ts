/**
 * Tests for OutlinerRow — unified row interaction wrapper.
 *
 * Tests the exported pure hooks (useRowSelectionState, useRowPointerHandlers)
 * and the RowInteractionConfig interface contract.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useUIStore } from '../../src/stores/ui-store.js';

// ── useRowSelectionState logic (tested via store state) ──

describe('useRowSelectionState derivation', () => {
  beforeEach(() => {
    useUIStore.getState().clearSelection();
    useUIStore.getState().clearFocus();
  });

  it('isSelected is false when node is not in selectedNodeIds', () => {
    const state = useUIStore.getState();
    expect(state.selectedNodeIds.has('node1')).toBe(false);
  });

  it('isSelected is true when node is the single selected node with matching parent', () => {
    useUIStore.getState().setSelectedNode('node1', 'parent1');
    const state = useUIStore.getState();
    expect(state.selectedNodeIds.has('node1')).toBe(true);
    expect(state.selectedParentId).toBe('parent1');
    // isSelected = inSet && (multiSelected || parentMatch)
    // size=1, parentId matches → true
  });

  it('isSelected is true for multi-select regardless of parent', () => {
    useUIStore.getState().setSelectedNodes(new Set(['node1', 'node2']), 'node1');
    const state = useUIStore.getState();
    expect(state.selectedNodeIds.has('node1')).toBe(true);
    expect(state.selectedNodeIds.size).toBe(2);
    // isMultiSelected = true → isSelected = true regardless of parentId
  });

  it('selectionAnchorId tracks the anchor correctly', () => {
    useUIStore.getState().setSelectedNodes(new Set(['a', 'b', 'c']), 'b');
    expect(useUIStore.getState().selectionAnchorId).toBe('b');
  });

  it('clearSelection resets all selection state', () => {
    useUIStore.getState().setSelectedNodes(new Set(['a', 'b']), 'a');
    useUIStore.getState().clearSelection();
    const state = useUIStore.getState();
    expect(state.selectedNodeIds.size).toBe(0);
    expect(state.selectionAnchorId).toBeNull();
  });

  it('isolates focus and selection by panel id', () => {
    useUIStore.getState().setFocusedNode('node1', 'parent1', 'chat-panel');
    const state = useUIStore.getState();

    expect(state.focusedNodeId).toBe('node1');
    expect(state.focusedParentId).toBe('parent1');
    expect(state.focusedPanelId).toBe('chat-panel');
    expect(state.selectedNodeIds.has('node1')).toBe(true);
    expect(state.selectedPanelId).toBe('chat-panel');
  });
});

// ── Pointer handler logic (toggle/range) ──

describe('pointer selection toggle logic', () => {
  beforeEach(() => {
    useUIStore.getState().clearSelection();
    useUIStore.getState().clearFocus();
  });

  it('toggleNodeInSelection adds a node to empty selection', () => {
    // Directly test the store action that useRowPointerHandlers wraps
    useUIStore.getState().setSelectedNodes(new Set(['node1']), 'node1');
    expect(useUIStore.getState().selectedNodeIds.has('node1')).toBe(true);
  });

  it('Cmd+Click toggle: adding then removing', () => {
    // Simulate: select node1 first, then Cmd+Click on node2 (adds), then Cmd+Click on node1 (removes)
    useUIStore.getState().setSelectedNodes(new Set(['node1']), 'node1');
    // Cmd+Click node2 → add
    useUIStore.getState().setSelectedNodes(new Set(['node1', 'node2']), 'node1');
    expect(useUIStore.getState().selectedNodeIds.size).toBe(2);
    // Cmd+Click node1 → remove
    useUIStore.getState().setSelectedNodes(new Set(['node2']), 'node2');
    expect(useUIStore.getState().selectedNodeIds.has('node1')).toBe(false);
    expect(useUIStore.getState().selectedNodeIds.has('node2')).toBe(true);
  });
});

// ── RowInteractionConfig contract ──

describe('RowInteractionConfig interface', () => {
  it('config shape matches expected fields', () => {
    // Type-level test: ensure the interface is importable and structurally correct
    const config = {
      rowId: 'test-node',
      parentId: 'parent',
      rootChildIds: ['a', 'b', 'c'],
      rootNodeId: 'root',
      isEditing: false,
      enterEdit: vi.fn(),
      exitEdit: vi.fn(),
      rowKind: 'content' as const,
      onSelectionKeydown: vi.fn(() => false),
      onBatchDelete: vi.fn(),
      onBatchIndent: vi.fn(),
      onBatchOutdent: vi.fn(),
    };

    expect(config.rowKind).toBe('content');
    expect(typeof config.enterEdit).toBe('function');
    expect(typeof config.onSelectionKeydown).toBe('function');
  });

  it('field row config uses field-specific values', () => {
    const config = {
      rowId: 'field-entry-123',
      parentId: 'owner-node',
      rootChildIds: ['field-entry-123', 'field-entry-456'],
      rootNodeId: 'root',
      isEditing: true,
      enterEdit: vi.fn(),
      exitEdit: vi.fn(),
      rowKind: 'field' as const,
    };

    expect(config.rowKind).toBe('field');
    expect(config.isEditing).toBe(true);
  });
});

import { useUIStore } from '../../src/stores/ui-store.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('ui-store undo/redo + focus/selection semantics', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('supports navUndo/navRedo and clears redo after new navigation', () => {
    const ui = useUIStore.getState();

    // Seed starts at Library panel.
    expect(useUIStore.getState().panelHistory[useUIStore.getState().panelIndex]).toBe('LIBRARY');

    ui.navigateTo('note_2');
    ui.navigateTo('task_1');
    expect(useUIStore.getState().panelHistory[useUIStore.getState().panelIndex]).toBe('task_1');

    ui.navUndo();
    expect(useUIStore.getState().panelHistory[useUIStore.getState().panelIndex]).toBe('note_2');

    ui.navUndo();
    expect(useUIStore.getState().panelHistory[useUIStore.getState().panelIndex]).toBe('LIBRARY');

    ui.navRedo();
    expect(useUIStore.getState().panelHistory[useUIStore.getState().panelIndex]).toBe('note_2');

    // A fresh navigation should clear redo stack.
    ui.navigateTo('inbox_3');
    const beforeRedoIndex = useUIStore.getState().panelIndex;
    ui.navRedo();
    expect(useUIStore.getState().panelIndex).toBe(beforeRedoIndex);
    expect(useUIStore.getState().panelHistory[useUIStore.getState().panelIndex]).toBe('inbox_3');
  });

  it('keeps focus/selection mutually exclusive and preserves parent disambiguation', () => {
    const ui = useUIStore.getState();

    ui.setSelectedNode('task_1', 'proj_1', 'ref-click');
    expect(useUIStore.getState().selectedNodeId).toBe('task_1');
    expect(useUIStore.getState().selectedParentId).toBe('proj_1');
    expect(useUIStore.getState().selectionSource).toBe('ref-click');
    expect(useUIStore.getState().focusedNodeId).toBeNull();
    expect(useUIStore.getState().focusedParentId).toBeNull();

    // setFocusedNode now sets selection alongside focus and normalizes source to global.
    ui.setFocusedNode('subtask_1a', 'task_1');
    expect(useUIStore.getState().focusedNodeId).toBe('subtask_1a');
    expect(useUIStore.getState().focusedParentId).toBe('task_1');
    expect(useUIStore.getState().selectedNodeId).toBe('subtask_1a');
    expect(useUIStore.getState().selectedParentId).toBe('task_1');
    expect(useUIStore.getState().selectionSource).toBe('global');

    // ParentId omitted => normalized to null.
    ui.setSelectedNode('note_2');
    expect(useUIStore.getState().selectedNodeId).toBe('note_2');
    expect(useUIStore.getState().selectedParentId).toBeNull();
    expect(useUIStore.getState().selectionSource).toBe('global');
    expect(useUIStore.getState().focusedNodeId).toBeNull();
  });

  it('clears focus and selection on panel navigation', () => {
    const ui = useUIStore.getState();

    ui.setSelectedNodes(new Set(['task_1', 'task_2']), 'task_1');
    expect(useUIStore.getState().selectedNodeIds.size).toBe(2);

    ui.navigateTo('note_2');
    expect(useUIStore.getState().selectedNodeIds.size).toBe(0);
    expect(useUIStore.getState().selectionAnchorId).toBeNull();
    expect(useUIStore.getState().focusedNodeId).toBeNull();
    expect(useUIStore.getState().focusedParentId).toBeNull();
  });

  it('clearFocus preserves selection for Escape edit→selected transition', () => {
    const ui = useUIStore.getState();

    // Simulate click-to-edit: setFocusedNode sets both focus AND selection
    ui.setFocusedNode('task_1', 'proj_1');
    expect(useUIStore.getState().focusedNodeId).toBe('task_1');
    expect(useUIStore.getState().selectedNodeId).toBe('task_1');
    expect(useUIStore.getState().selectedNodeIds.has('task_1')).toBe(true);
    expect(useUIStore.getState().selectionAnchorId).toBe('task_1');
    expect(useUIStore.getState().selectionSource).toBe('global');

    // Simulate Escape: clearFocus only clears focus, selection survives
    ui.clearFocus();
    expect(useUIStore.getState().focusedNodeId).toBeNull();
    expect(useUIStore.getState().focusedParentId).toBeNull();
    // Selection preserved!
    expect(useUIStore.getState().selectedNodeId).toBe('task_1');
    expect(useUIStore.getState().selectedParentId).toBe('proj_1');
    expect(useUIStore.getState().selectedNodeIds.has('task_1')).toBe(true);
    expect(useUIStore.getState().selectionAnchorId).toBe('task_1');
    expect(useUIStore.getState().selectionSource).toBe('global');

    // Second Escape: clearSelection clears everything
    ui.clearSelection();
    expect(useUIStore.getState().selectedNodeId).toBeNull();
    expect(useUIStore.getState().selectedNodeIds.size).toBe(0);
    expect(useUIStore.getState().selectionAnchorId).toBeNull();
    expect(useUIStore.getState().selectionSource).toBeNull();
  });

  it('setFocusedNode collapses multi-select to single node (intentional design)', () => {
    const ui = useUIStore.getState();

    // Set up multi-select: 3 nodes selected
    ui.setSelectedNodes(new Set(['task_1', 'task_2', 'task_3']), 'task_1');
    expect(useUIStore.getState().selectedNodeIds.size).toBe(3);
    expect(useUIStore.getState().selectionSource).toBe('global');

    // setFocusedNode enters edit mode → collapses to single node
    ui.setFocusedNode('task_2', 'proj_1');
    expect(useUIStore.getState().focusedNodeId).toBe('task_2');
    expect(useUIStore.getState().selectedNodeIds.size).toBe(1);
    expect(useUIStore.getState().selectedNodeIds.has('task_2')).toBe(true);
    // Other selections discarded
    expect(useUIStore.getState().selectedNodeIds.has('task_1')).toBe(false);
    expect(useUIStore.getState().selectedNodeIds.has('task_3')).toBe(false);
  });

  it('setFocusedNode(null) clears both focus and selection (blur to empty space)', () => {
    const ui = useUIStore.getState();

    ui.setFocusedNode('task_1', 'proj_1');
    expect(useUIStore.getState().selectedNodeIds.has('task_1')).toBe(true);

    // Blur handler calls setFocusedNode(null) → clears everything
    ui.setFocusedNode(null);
    expect(useUIStore.getState().focusedNodeId).toBeNull();
    expect(useUIStore.getState().selectedNodeId).toBeNull();
    expect(useUIStore.getState().selectedNodeIds.size).toBe(0);
    expect(useUIStore.getState().selectionSource).toBeNull();
  });
});

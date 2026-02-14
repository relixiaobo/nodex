import { useUIStore } from '../../src/stores/ui-store.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('ui-store undo/redo + focus/selection semantics', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('supports navUndo/navRedo and clears redo after new navigation', () => {
    const ui = useUIStore.getState();

    // Seed starts at Library panel.
    expect(useUIStore.getState().panelHistory[useUIStore.getState().panelIndex]).toBe('ws_default_LIBRARY');

    ui.navigateTo('note_2');
    ui.navigateTo('task_1');
    expect(useUIStore.getState().panelHistory[useUIStore.getState().panelIndex]).toBe('task_1');

    ui.navUndo();
    expect(useUIStore.getState().panelHistory[useUIStore.getState().panelIndex]).toBe('note_2');

    ui.navUndo();
    expect(useUIStore.getState().panelHistory[useUIStore.getState().panelIndex]).toBe('ws_default_LIBRARY');

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

    ui.setSelectedNode('task_1', 'proj_1');
    expect(useUIStore.getState().selectedNodeId).toBe('task_1');
    expect(useUIStore.getState().selectedParentId).toBe('proj_1');
    expect(useUIStore.getState().focusedNodeId).toBeNull();
    expect(useUIStore.getState().focusedParentId).toBeNull();

    ui.setFocusedNode('subtask_1a', 'task_1');
    expect(useUIStore.getState().focusedNodeId).toBe('subtask_1a');
    expect(useUIStore.getState().focusedParentId).toBe('task_1');
    expect(useUIStore.getState().selectedNodeId).toBeNull();
    expect(useUIStore.getState().selectedParentId).toBeNull();

    // ParentId omitted => normalized to null.
    ui.setSelectedNode('note_2');
    expect(useUIStore.getState().selectedNodeId).toBe('note_2');
    expect(useUIStore.getState().selectedParentId).toBeNull();
    expect(useUIStore.getState().focusedNodeId).toBeNull();
  });
});

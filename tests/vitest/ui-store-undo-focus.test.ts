import { ensureTodayNode } from '../../src/lib/journal.js';
import { useUIStore } from '../../src/stores/ui-store.js';
import { resetAndSeed } from './helpers/test-state.js';

function currentNodeId(): string | null {
  return useUIStore.getState().currentNodeId;
}

describe('ui-store navigation + focus/selection semantics', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('supports goBack/goForward via nodeHistory and truncates forward history on new navigation', () => {
    const ui = useUIStore.getState();
    const todayId = ensureTodayNode();

    expect(currentNodeId()).toBe(todayId);

    ui.navigateTo('note_2');
    ui.navigateTo('task_1');
    expect(currentNodeId()).toBe('task_1');

    ui.goBack();
    expect(currentNodeId()).toBe('note_2');

    ui.goBack();
    expect(currentNodeId()).toBe(todayId);

    ui.goForward();
    expect(currentNodeId()).toBe('note_2');

    ui.navigateTo('inbox_3');
    const state = useUIStore.getState();
    expect(state.nodeHistory).toEqual([todayId, 'note_2', 'inbox_3']);
    expect(state.nodeHistoryIndex).toBe(2);

    ui.goForward();
    expect(useUIStore.getState().nodeHistoryIndex).toBe(2);
    expect(currentNodeId()).toBe('inbox_3');
  });

  it('keeps focus/selection mutually exclusive and preserves parent disambiguation', () => {
    const ui = useUIStore.getState();

    ui.setSelectedNode('task_1', 'proj_1', 'ref-click');
    expect(useUIStore.getState().selectedNodeId).toBe('task_1');
    expect(useUIStore.getState().selectedParentId).toBe('proj_1');
    expect(useUIStore.getState().selectionSource).toBe('ref-click');
    expect(useUIStore.getState().focusedNodeId).toBeNull();
    expect(useUIStore.getState().focusedParentId).toBeNull();

    ui.setFocusedNode('subtask_1a', 'task_1');
    expect(useUIStore.getState().focusedNodeId).toBe('subtask_1a');
    expect(useUIStore.getState().focusedParentId).toBe('task_1');
    expect(useUIStore.getState().selectedNodeId).toBe('subtask_1a');
    expect(useUIStore.getState().selectedParentId).toBe('task_1');
    expect(useUIStore.getState().selectionSource).toBe('global');

    ui.setSelectedNode('note_2');
    expect(useUIStore.getState().selectedNodeId).toBe('note_2');
    expect(useUIStore.getState().selectedParentId).toBeNull();
    expect(useUIStore.getState().selectionSource).toBe('global');
    expect(useUIStore.getState().focusedNodeId).toBeNull();
  });

  it('clears focus and selection on node navigation', () => {
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

    ui.setFocusedNode('task_1', 'proj_1');
    expect(useUIStore.getState().focusedNodeId).toBe('task_1');
    expect(useUIStore.getState().selectedNodeId).toBe('task_1');
    expect(useUIStore.getState().selectedNodeIds.has('task_1')).toBe(true);
    expect(useUIStore.getState().selectionAnchorId).toBe('task_1');
    expect(useUIStore.getState().selectionSource).toBe('global');

    ui.clearFocus();
    expect(useUIStore.getState().focusedNodeId).toBeNull();
    expect(useUIStore.getState().focusedParentId).toBeNull();
    expect(useUIStore.getState().selectedNodeId).toBe('task_1');
    expect(useUIStore.getState().selectedParentId).toBe('proj_1');
    expect(useUIStore.getState().selectedNodeIds.has('task_1')).toBe(true);
    expect(useUIStore.getState().selectionAnchorId).toBe('task_1');
    expect(useUIStore.getState().selectionSource).toBe('global');

    ui.clearSelection();
    expect(useUIStore.getState().selectedNodeId).toBeNull();
    expect(useUIStore.getState().selectedNodeIds.size).toBe(0);
    expect(useUIStore.getState().selectionAnchorId).toBeNull();
    expect(useUIStore.getState().selectionSource).toBeNull();
  });

  it('setFocusedNode collapses multi-select to single node', () => {
    const ui = useUIStore.getState();

    ui.setSelectedNodes(new Set(['task_1', 'task_2', 'task_3']), 'task_1');
    expect(useUIStore.getState().selectedNodeIds.size).toBe(3);
    expect(useUIStore.getState().selectionSource).toBe('global');

    ui.setFocusedNode('task_2', 'proj_1');
    expect(useUIStore.getState().focusedNodeId).toBe('task_2');
    expect(useUIStore.getState().selectedNodeIds.size).toBe(1);
    expect(useUIStore.getState().selectedNodeIds.has('task_2')).toBe(true);
    expect(useUIStore.getState().selectedNodeIds.has('task_1')).toBe(false);
    expect(useUIStore.getState().selectedNodeIds.has('task_3')).toBe(false);
  });

  it('setFocusedNode(null) clears both focus and selection', () => {
    const ui = useUIStore.getState();

    ui.setFocusedNode('task_1', 'proj_1');
    expect(useUIStore.getState().selectedNodeIds.has('task_1')).toBe(true);

    ui.setFocusedNode(null);
    expect(useUIStore.getState().focusedNodeId).toBeNull();
    expect(useUIStore.getState().selectedNodeId).toBeNull();
    expect(useUIStore.getState().selectedNodeIds.size).toBe(0);
    expect(useUIStore.getState().selectionSource).toBeNull();
  });
});

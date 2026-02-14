import { useUIStore } from '../../src/stores/ui-store.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('ui-store drag and drop state', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('setDrag initializes drag context and clears stale drop target state', () => {
    const ui = useUIStore.getState();

    ui.setDropTarget('task_1', 'inside');
    expect(useUIStore.getState().dropTargetId).toBe('task_1');
    expect(useUIStore.getState().dropPosition).toBe('inside');

    ui.setDrag('subtask_1a');
    expect(useUIStore.getState().dragNodeId).toBe('subtask_1a');
    expect(useUIStore.getState().dropTargetId).toBeNull();
    expect(useUIStore.getState().dropPosition).toBeNull();
  });

  it('setDropTarget and setDrag(null) update and clear drag state predictably', () => {
    const ui = useUIStore.getState();

    ui.setDrag('subtask_1b');
    ui.setDropTarget('task_2', 'after');
    expect(useUIStore.getState().dragNodeId).toBe('subtask_1b');
    expect(useUIStore.getState().dropTargetId).toBe('task_2');
    expect(useUIStore.getState().dropPosition).toBe('after');

    ui.setDrag(null);
    expect(useUIStore.getState().dragNodeId).toBeNull();
    expect(useUIStore.getState().dropTargetId).toBeNull();
    expect(useUIStore.getState().dropPosition).toBeNull();
  });
});

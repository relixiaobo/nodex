import { useUIStore } from '../../src/stores/ui-store.js';
import { resetAndSeed, resetStores } from './helpers/test-state.js';

describe('ui-store history guard behaviors', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('navigateTo same current node is a no-op for history and undo stack', () => {
    const ui = useUIStore.getState();
    const before = useUIStore.getState();

    ui.navigateTo('ws_default_LIBRARY');

    const after = useUIStore.getState();
    expect(after.panelHistory).toEqual(before.panelHistory);
    expect(after.panelIndex).toBe(before.panelIndex);
    expect(after.navUndoStack.length).toBe(before.navUndoStack.length);
  });

  it('goBack/goForward at boundaries are no-ops', () => {
    const ui = useUIStore.getState();

    // At index 0 initially.
    const beforeBack = useUIStore.getState();
    ui.goBack();
    const afterBack = useUIStore.getState();
    expect(afterBack.panelIndex).toBe(beforeBack.panelIndex);
    expect(afterBack.navUndoStack.length).toBe(beforeBack.navUndoStack.length);

    // Move to end, then goForward should no-op.
    ui.navigateTo('note_2');
    const beforeForward = useUIStore.getState();
    ui.goForward();
    const afterForward = useUIStore.getState();
    expect(afterForward.panelIndex).toBe(beforeForward.panelIndex);
    expect(afterForward.navUndoStack.length).toBe(beforeForward.navUndoStack.length);
  });

  it('navUndo/navRedo on empty stacks are no-ops', () => {
    const ui = useUIStore.getState();
    useUIStore.setState({ navUndoStack: [], navRedoStack: [] });

    const before = useUIStore.getState();
    ui.navUndo();
    ui.navRedo();
    const after = useUIStore.getState();

    expect(after.panelHistory).toEqual(before.panelHistory);
    expect(after.panelIndex).toBe(before.panelIndex);
  });

  it('replacePanel seeds history when history is empty', () => {
    resetStores();
    const ui = useUIStore.getState();
    ui.replacePanel('note_1');

    const state = useUIStore.getState();
    expect(state.panelHistory).toEqual(['note_1']);
    expect(state.panelIndex).toBe(0);
  });
});

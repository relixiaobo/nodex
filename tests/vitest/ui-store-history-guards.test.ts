import { useUIStore } from '../../src/stores/ui-store.js';
import { resetAndSeed, resetStores } from './helpers/test-state.js';

function currentNodeId(): string | null {
  return useUIStore.getState().currentNodeId;
}

describe('ui-store history guard behaviors', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('navigateTo same current node is a no-op for nodeHistory', () => {
    const ui = useUIStore.getState();
    const nodeId = currentNodeId()!;
    const before = useUIStore.getState();

    ui.navigateTo(nodeId);

    const after = useUIStore.getState();
    expect(after.currentNodeId).toBe(before.currentNodeId);
    expect(after.nodeHistory).toEqual(before.nodeHistory);
    expect(after.nodeHistoryIndex).toBe(before.nodeHistoryIndex);
  });

  it('goBack/goForward at boundaries are no-ops', () => {
    const ui = useUIStore.getState();

    const beforeBack = useUIStore.getState();
    ui.goBack();
    const afterBack = useUIStore.getState();
    expect(afterBack.nodeHistoryIndex).toBe(beforeBack.nodeHistoryIndex);
    expect(afterBack.nodeHistory).toEqual(beforeBack.nodeHistory);

    ui.navigateTo('note_2');
    const beforeForward = useUIStore.getState();
    ui.goForward();
    const afterForward = useUIStore.getState();
    expect(afterForward.nodeHistoryIndex).toBe(beforeForward.nodeHistoryIndex);
    expect(afterForward.nodeHistory).toEqual(beforeForward.nodeHistory);
  });

  it('replacePanel seeds the node view when state is empty', () => {
    resetStores();
    const ui = useUIStore.getState();
    ui.replacePanel('note_1');

    const state = useUIStore.getState();
    expect(state.activeView).toBe('node');
    expect(state.currentNodeId).toBe('note_1');
    expect(state.nodeHistory).toEqual(['note_1']);
    expect(state.nodeHistoryIndex).toBe(0);
  });
});

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

  it('goBackNode/goForwardNode at boundaries are no-ops', () => {
    const ui = useUIStore.getState();

    const beforeBack = useUIStore.getState();
    ui.goBackNode();
    const afterBack = useUIStore.getState();
    expect(afterBack.nodeHistoryIndex).toBe(beforeBack.nodeHistoryIndex);
    expect(afterBack.nodeHistory).toEqual(beforeBack.nodeHistory);

    ui.navigateTo('note_2');
    const beforeForward = useUIStore.getState();
    ui.goForwardNode();
    const afterForward = useUIStore.getState();
    expect(afterForward.nodeHistoryIndex).toBe(beforeForward.nodeHistoryIndex);
    expect(afterForward.nodeHistory).toEqual(beforeForward.nodeHistory);
  });

  it('replaceCurrentNode seeds the node view when state is empty', () => {
    resetStores();
    const ui = useUIStore.getState();
    ui.replaceCurrentNode('note_1');

    const state = useUIStore.getState();
    expect(state.currentNodeId).toBe('note_1');
    expect(state.nodeHistory).toEqual(['note_1']);
    expect(state.nodeHistoryIndex).toBe(0);
  });
});

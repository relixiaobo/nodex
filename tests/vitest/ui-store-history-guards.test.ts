import { useUIStore } from '../../src/stores/ui-store.js';
import { resetAndSeed, resetStores } from './helpers/test-state.js';

/** Helper: get current active panel node ID */
function currentNodeId(): string | null {
  const s = useUIStore.getState();
  return s.panels.find((p) => p.id === s.activePanelId)?.nodeId ?? null;
}

describe('ui-store history guard behaviors', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('navigateTo same current node is a no-op for history', () => {
    const ui = useUIStore.getState();
    const nodeId = currentNodeId()!;
    const before = useUIStore.getState();

    ui.navigateTo(nodeId);

    const after = useUIStore.getState();
    expect(after.panels).toEqual(before.panels);
    expect(after.activePanelId).toBe(before.activePanelId);
    expect(after.navHistory.length).toBe(before.navHistory.length);
  });

  it('goBack/goForward at boundaries are no-ops', () => {
    const ui = useUIStore.getState();

    // navIndex starts at -1 (no events yet), goBack should be no-op.
    const beforeBack = useUIStore.getState();
    ui.goBack();
    const afterBack = useUIStore.getState();
    expect(afterBack.navIndex).toBe(beforeBack.navIndex);
    expect(afterBack.navHistory.length).toBe(beforeBack.navHistory.length);

    // Navigate, then goForward at end should be no-op.
    ui.navigateTo('note_2');
    const beforeForward = useUIStore.getState();
    ui.goForward();
    const afterForward = useUIStore.getState();
    expect(afterForward.navIndex).toBe(beforeForward.navIndex);
    expect(afterForward.navHistory.length).toBe(beforeForward.navHistory.length);
  });

  it('replacePanel seeds panels when panels array is empty', () => {
    resetStores();
    const ui = useUIStore.getState();
    ui.replacePanel('note_1');

    const state = useUIStore.getState();
    expect(state.panels).toEqual([{ id: 'main', nodeId: 'note_1' }]);
    expect(state.activePanelId).toBe('main');
  });
});

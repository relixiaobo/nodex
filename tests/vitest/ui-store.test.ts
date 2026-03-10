import { useUIStore } from '../../src/stores/ui-store.js';
import { SYSTEM_NODE_IDS } from '../../src/types/index.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('ui-store navigation and UI state', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('handles navigation history and UI toggles correctly', () => {
    const ui = useUIStore.getState();

    ui.navigateTo('inbox_3');
    let state = useUIStore.getState();
    expect(state.panelHistory[state.panelIndex]).toBe('inbox_3');

    ui.goBack();
    state = useUIStore.getState();
    expect(state.panelHistory[state.panelIndex]).toBe(SYSTEM_NODE_IDS.LIBRARY);

    ui.goForward();
    state = useUIStore.getState();
    expect(state.panelHistory[state.panelIndex]).toBe('inbox_3');

    ui.replacePanel('note_2');
    state = useUIStore.getState();
    expect(state.panelHistory[state.panelIndex]).toBe('note_2');

    const beforeInvalidNavigate = useUIStore.getState();
    ui.navigateTo('missing_node_for_panel_navigation');
    state = useUIStore.getState();
    expect(state.panelHistory).toEqual(beforeInvalidNavigate.panelHistory);
    expect(state.panelIndex).toBe(beforeInvalidNavigate.panelIndex);

    ui.replacePanel('missing_node_for_panel_navigation');
    state = useUIStore.getState();
    expect(state.panelHistory).toEqual(beforeInvalidNavigate.panelHistory);
    expect(state.panelIndex).toBe(beforeInvalidNavigate.panelIndex);

    ui.setExpanded(`${SYSTEM_NODE_IDS.LIBRARY}:note_2`, true);
    expect(useUIStore.getState().expandedNodes.has(`${SYSTEM_NODE_IDS.LIBRARY}:note_2`)).toBe(true);

    ui.setExpanded(`${SYSTEM_NODE_IDS.LIBRARY}:note_2`, false);
    expect(useUIStore.getState().expandedNodes.has(`${SYSTEM_NODE_IDS.LIBRARY}:note_2`)).toBe(false);

    ui.toggleExpanded(`${SYSTEM_NODE_IDS.LIBRARY}:note_2`);
    expect(useUIStore.getState().expandedNodes.has(`${SYSTEM_NODE_IDS.LIBRARY}:note_2`)).toBe(true);
    ui.toggleExpanded(`${SYSTEM_NODE_IDS.LIBRARY}:note_2`);
    expect(useUIStore.getState().expandedNodes.has(`${SYSTEM_NODE_IDS.LIBRARY}:note_2`)).toBe(false);

    ui.setFocusedNode('subtask_1a');
    expect(useUIStore.getState().focusedNodeId).toBe('subtask_1a');
    ui.setFocusedNode(null);
    expect(useUIStore.getState().focusedNodeId).toBeNull();

    ui.openSearch();
    expect(useUIStore.getState().searchOpen).toBe(true);
    ui.closeSearch();
    expect(useUIStore.getState().searchOpen).toBe(false);
    expect(useUIStore.getState().searchQuery).toBe('');
  });
});

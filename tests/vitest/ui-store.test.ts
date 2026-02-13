import { useUIStore } from '../../src/stores/ui-store.js';
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
    expect(state.panelHistory[state.panelIndex]).toBe('ws_default_LIBRARY');

    ui.goForward();
    state = useUIStore.getState();
    expect(state.panelHistory[state.panelIndex]).toBe('inbox_3');

    ui.replacePanel('note_2');
    state = useUIStore.getState();
    expect(state.panelHistory[state.panelIndex]).toBe('note_2');

    ui.setExpanded('ws_default_LIBRARY:note_2', true);
    expect(useUIStore.getState().expandedNodes.has('ws_default_LIBRARY:note_2')).toBe(true);

    ui.setExpanded('ws_default_LIBRARY:note_2', false);
    expect(useUIStore.getState().expandedNodes.has('ws_default_LIBRARY:note_2')).toBe(false);

    ui.toggleExpanded('ws_default_LIBRARY:note_2');
    expect(useUIStore.getState().expandedNodes.has('ws_default_LIBRARY:note_2')).toBe(true);
    ui.toggleExpanded('ws_default_LIBRARY:note_2');
    expect(useUIStore.getState().expandedNodes.has('ws_default_LIBRARY:note_2')).toBe(false);

    ui.setFocusedNode('subtask_1a');
    expect(useUIStore.getState().focusedNodeId).toBe('subtask_1a');
    ui.setFocusedNode(null);
    expect(useUIStore.getState().focusedNodeId).toBeNull();

    const beforeSidebar = useUIStore.getState().sidebarOpen;
    ui.toggleSidebar();
    expect(useUIStore.getState().sidebarOpen).toBe(!beforeSidebar);
    ui.toggleSidebar();
    expect(useUIStore.getState().sidebarOpen).toBe(beforeSidebar);

    ui.openSearch();
    expect(useUIStore.getState().searchOpen).toBe(true);
    ui.closeSearch();
    expect(useUIStore.getState().searchOpen).toBe(false);
    expect(useUIStore.getState().searchQuery).toBe('');
  });
});


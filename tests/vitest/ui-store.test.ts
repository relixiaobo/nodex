import { useUIStore } from '../../src/stores/ui-store.js';
import { ensureTodayNode } from '../../src/lib/journal.js';
import { resetAndSeed } from './helpers/test-state.js';

/** Helper: get current active panel node ID */
function currentNodeId(): string | null {
  const s = useUIStore.getState();
  return s.panels.find((p) => p.id === s.activePanelId)?.nodeId ?? null;
}

describe('ui-store navigation and UI state', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('handles navigation history and UI toggles correctly', () => {
    const ui = useUIStore.getState();
    const todayId = ensureTodayNode();
    const noteExpandKey = `${todayId}:note_2`;

    ui.navigateTo('inbox_3');
    expect(currentNodeId()).toBe('inbox_3');

    ui.goBack();
    expect(currentNodeId()).toBe(todayId);

    ui.goForward();
    expect(currentNodeId()).toBe('inbox_3');

    ui.replacePanel('note_2');
    expect(currentNodeId()).toBe('note_2');

    const beforeInvalidNavigate = useUIStore.getState();
    ui.navigateTo('missing_node_for_panel_navigation');
    let state = useUIStore.getState();
    // navigateTo with missing node should be a no-op — panels unchanged
    expect(state.panels).toEqual(beforeInvalidNavigate.panels);
    expect(state.activePanelId).toBe(beforeInvalidNavigate.activePanelId);

    ui.replacePanel('missing_node_for_panel_navigation');
    state = useUIStore.getState();
    expect(state.panels).toEqual(beforeInvalidNavigate.panels);
    expect(state.activePanelId).toBe(beforeInvalidNavigate.activePanelId);

    ui.setExpanded(noteExpandKey, true);
    expect(useUIStore.getState().expandedNodes.has(noteExpandKey)).toBe(true);

    ui.setExpanded(noteExpandKey, false);
    expect(useUIStore.getState().expandedNodes.has(noteExpandKey)).toBe(false);

    ui.toggleExpanded(noteExpandKey);
    expect(useUIStore.getState().expandedNodes.has(noteExpandKey)).toBe(true);
    ui.toggleExpanded(noteExpandKey);
    expect(useUIStore.getState().expandedNodes.has(noteExpandKey)).toBe(false);

    ui.setFocusedNode('subtask_1a');
    expect(useUIStore.getState().focusedNodeId).toBe('subtask_1a');
    ui.setFocusedNode(null);
    expect(useUIStore.getState().focusedNodeId).toBeNull();

    ui.openSearch();
    expect(useUIStore.getState().searchOpen).toBe(true);
    ui.closeSearch();
    expect(useUIStore.getState().searchOpen).toBe(false);
    expect(useUIStore.getState().searchQuery).toBe('');

    ui.openChat();
    expect(useUIStore.getState().chatOpen).toBe(true);
    ui.toggleChat();
    expect(useUIStore.getState().chatOpen).toBe(false);
    ui.closeChat();
    expect(useUIStore.getState().chatOpen).toBe(false);
  });
});

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
    const noteExpandKey = `main:${todayId}:note_2`;

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

    ui.openPanel('chat:session_test');
    expect(useUIStore.getState().panels.at(-1)?.nodeId).toBe('chat:session_test');
  });

  it('openPanel creates a new panel and switches active', () => {
    const ui = useUIStore.getState();
    const todayId = ensureTodayNode();
    expect(useUIStore.getState().panels).toHaveLength(1);
    expect(useUIStore.getState().activePanelId).toBe('main');

    ui.openPanel('note_2');
    const s1 = useUIStore.getState();
    expect(s1.panels).toHaveLength(2);
    expect(s1.panels[1].nodeId).toBe('note_2');
    expect(s1.activePanelId).toBe(s1.panels[1].id);
    // Focus should be cleared
    expect(s1.focusedNodeId).toBeNull();

    // navHistory should record the open-panel event
    const lastEvent = s1.navHistory[s1.navIndex];
    expect(lastEvent.action).toBe('open-panel');
  });

  it('closePanel removes the panel and adjusts active', () => {
    const ui = useUIStore.getState();
    ui.openPanel('note_2');
    const s1 = useUIStore.getState();
    const secondPanelId = s1.panels[1].id;

    // Close the second panel
    ui.closePanel(secondPanelId);
    const s2 = useUIStore.getState();
    expect(s2.panels).toHaveLength(1);
    expect(s2.activePanelId).toBe('main');

    // navHistory should record the close-panel event
    const lastEvent = s2.navHistory[s2.navIndex];
    expect(lastEvent.action).toBe('close-panel');
  });

  it('closePanel allows closing the last panel (empty state)', () => {
    const ui = useUIStore.getState();
    expect(useUIStore.getState().panels).toHaveLength(1);
    ui.closePanel('main');
    expect(useUIStore.getState().panels).toHaveLength(0);
    expect(useUIStore.getState().activePanelId).toBe('');
  });

  it('setActivePanel switches active and clears focus', () => {
    const ui = useUIStore.getState();
    ui.openPanel('note_2');
    const s1 = useUIStore.getState();
    const secondPanelId = s1.panels[1].id;

    // Set active back to main
    ui.setActivePanel('main');
    expect(useUIStore.getState().activePanelId).toBe('main');
    expect(useUIStore.getState().focusedNodeId).toBeNull();

    // setActivePanel to nonexistent panel is a no-op
    ui.setActivePanel('nonexistent');
    expect(useUIStore.getState().activePanelId).toBe('main');
  });

  it('goBack undoes open-panel and goForward redoes it', () => {
    const ui = useUIStore.getState();
    ui.openPanel('note_2');
    const s1 = useUIStore.getState();
    expect(s1.panels).toHaveLength(2);

    // goBack should undo the open-panel → back to 1 panel
    ui.goBack();
    const s2 = useUIStore.getState();
    expect(s2.panels).toHaveLength(1);

    // goForward should redo the open-panel → back to 2 panels
    ui.goForward();
    const s3 = useUIStore.getState();
    expect(s3.panels).toHaveLength(2);
    expect(s3.panels[1].nodeId).toBe('note_2');
  });

  it('goBack undoes close-panel by restoring the snapshot', () => {
    const ui = useUIStore.getState();
    ui.openPanel('note_2');
    const s1 = useUIStore.getState();
    const secondPanelId = s1.panels[1].id;

    ui.closePanel(secondPanelId);
    expect(useUIStore.getState().panels).toHaveLength(1);

    // goBack should restore the closed panel
    ui.goBack();
    const s3 = useUIStore.getState();
    expect(s3.panels).toHaveLength(2);
    expect(s3.panels.some((p) => p.id === secondPanelId)).toBe(true);
  });
});

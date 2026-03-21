import { buildExpandedNodeKey } from '../../src/lib/expanded-node-key.js';
import { ensureTodayNode } from '../../src/lib/journal.js';
import { useUIStore } from '../../src/stores/ui-store.js';
import { resetAndSeed, resetStores } from './helpers/test-state.js';

function currentNodeId(): string | null {
  return useUIStore.getState().currentNodeId;
}

function getTodayDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

describe('ui-store navigation and UI state', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('handles node history, view toggles, and common UI state', () => {
    const ui = useUIStore.getState();
    const todayId = ensureTodayNode();
    const noteExpandKey = buildExpandedNodeKey(todayId, 'note_2');

    expect(useUIStore.getState().activeView).toBe('node');
    expect(currentNodeId()).toBe(todayId);
    expect(useUIStore.getState().nodeHistory).toEqual([todayId]);
    expect(useUIStore.getState().nodeHistoryIndex).toBe(0);

    ui.navigateTo('inbox_3');
    expect(currentNodeId()).toBe('inbox_3');

    ui.goBackNode();
    expect(currentNodeId()).toBe(todayId);

    ui.goForwardNode();
    expect(currentNodeId()).toBe('inbox_3');

    ui.replaceCurrentNode('note_2');
    expect(currentNodeId()).toBe('note_2');

    const beforeInvalidNavigate = useUIStore.getState();
    ui.navigateTo('missing_node_for_panel_navigation');
    let state = useUIStore.getState();
    expect(state.currentNodeId).toBe(beforeInvalidNavigate.currentNodeId);
    expect(state.nodeHistory).toEqual(beforeInvalidNavigate.nodeHistory);
    expect(state.nodeHistoryIndex).toBe(beforeInvalidNavigate.nodeHistoryIndex);

    ui.replaceCurrentNode('missing_node_for_panel_navigation');
    state = useUIStore.getState();
    expect(state.currentNodeId).toBe(beforeInvalidNavigate.currentNodeId);
    expect(state.nodeHistory).toEqual(beforeInvalidNavigate.nodeHistory);
    expect(state.nodeHistoryIndex).toBe(beforeInvalidNavigate.nodeHistoryIndex);

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

    ui.navigateTo('chat:session_test');
    expect(useUIStore.getState().activeView).toBe('chat');
    expect(useUIStore.getState().currentChatSessionId).toBe('session_test');
    expect(useUIStore.getState().currentNodeId).toBe('note_2');
  });

  it('switchToNode falls back to Today on first visit and preserves the last node on the same day', () => {
    resetAndSeed();
    useUIStore.setState({
      activeView: 'chat',
      currentNodeId: null,
      nodeHistory: [],
      nodeHistoryIndex: -1,
      lastVisitDate: null,
    });
    const ui = useUIStore.getState();
    const todayId = ensureTodayNode();

    ui.switchToNode();
    expect(useUIStore.getState().activeView).toBe('node');
    expect(currentNodeId()).toBe(todayId);
    expect(useUIStore.getState().nodeHistory).toEqual([todayId]);

    useUIStore.setState({
      activeView: 'chat',
      currentNodeId: 'note_1',
      nodeHistory: ['note_1'],
      nodeHistoryIndex: 0,
      lastVisitDate: getTodayDateKey(),
    });

    ui.switchToNode();
    expect(useUIStore.getState().activeView).toBe('node');
    expect(currentNodeId()).toBe('note_1');
    expect(useUIStore.getState().nodeHistory).toEqual(['note_1']);
  });

  it('replaceCurrentNode seeds the node view when no current node exists', () => {
    resetStores();
    useUIStore.getState().replaceCurrentNode('note_1');

    const state = useUIStore.getState();
    expect(state.activeView).toBe('node');
    expect(state.currentNodeId).toBe('note_1');
    expect(state.nodeHistory).toEqual(['note_1']);
    expect(state.nodeHistoryIndex).toBe(0);
  });
});

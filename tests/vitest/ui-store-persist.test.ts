import { chromeLocalStorage } from '../../src/lib/chrome-storage.js';
import { partializeUIStore, useUIStore } from '../../src/stores/ui-store.js';
import { resetStores } from './helpers/test-state.js';

describe('ui-store persistence helpers', () => {
  beforeEach(async () => {
    resetStores();
    await useUIStore.persist.clearStorage();
  });

  it('partialize keeps only persisted keys and normalizes expanded node keys', () => {
    const expanded = new Set<string>(['main:a:b', 'a:c']);
    const usage = { cmd_1: { count: 3, lastUsedAt: 1000 } };
    const result = partializeUIStore({
      activeView: 'node',
      currentNodeId: 'note_1',
      currentChatSessionId: 'session_1',
      expandedNodes: expanded,
      viewMode: 'cards',
      paletteUsage: usage,
      lastVisitDate: '2026-03-21',
      searchOpen: true,
      searchQuery: 'x',
      focusedNodeId: 'note_1',
    } as never);

    expect(result).toEqual({
      activeView: 'node',
      currentNodeId: 'note_1',
      currentChatSessionId: 'session_1',
      expandedNodes: new Set(['a:b', 'a:c']),
      viewMode: 'cards',
      paletteUsage: usage,
      lastVisitDate: '2026-03-21',
    });
  });
});

describe('ui-store persist migration v5→v6', () => {
  beforeEach(async () => {
    resetStores();
    await useUIStore.persist.clearStorage();
  });

  it('migrates a node-active panel layout into the toggle model', async () => {
    await chromeLocalStorage?.setItem('nodex-ui', {
      state: {
        panels: [
          { id: 'main', nodeId: 'note_1' },
          { id: 'chat', nodeId: 'chat:session_old' },
        ],
        activePanelId: 'main',
        expandedNodes: new Set(['main:proj_1:task_1', 'proj_1:task_2']),
        viewMode: 'list',
      },
      version: 5,
    });

    await useUIStore.persist.rehydrate();

    const state = useUIStore.getState();
    expect(state.activeView).toBe('node');
    expect(state.currentNodeId).toBe('note_1');
    expect(state.currentChatSessionId).toBe('session_old');
    expect(state.expandedNodes).toEqual(new Set(['proj_1:task_1', 'proj_1:task_2']));
    expect(state.nodeHistory).toEqual([]);
    expect(state.nodeHistoryIndex).toBe(-1);
  });

  it('migrates a chat-active panel layout while preserving the fallback node view target', async () => {
    await chromeLocalStorage?.setItem('nodex-ui', {
      state: {
        panels: [
          { id: 'main', nodeId: 'note_1' },
          { id: 'chat', nodeId: 'chat:session_focus' },
        ],
        activePanelId: 'chat',
        expandedNodes: new Set(['main:today:proj_1']),
        viewMode: 'tiles',
      },
      version: 5,
    });

    await useUIStore.persist.rehydrate();

    const state = useUIStore.getState();
    expect(state.activeView).toBe('chat');
    expect(state.currentNodeId).toBe('note_1');
    expect(state.currentChatSessionId).toBe('session_focus');
    expect(state.expandedNodes).toEqual(new Set(['today:proj_1']));
    expect(state.viewMode).toBe('tiles');
  });
});

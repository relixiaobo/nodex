import { chromeLocalStorage } from '../../src/lib/chrome-storage.js';
import { partializeUIStore, useUIStore } from '../../src/stores/ui-store.js';
import { resetStores } from './helpers/test-state.js';

describe('ui-store persistence helpers', () => {
  beforeEach(async () => {
    resetStores();
    await useUIStore.persist.clearStorage();
  });

  it('partialize keeps only persisted keys and preserves scoped expanded node keys', () => {
    const expanded = new Set<string>(['node-main:a:b', 'chat:a:c']);
    const usage = { cmd_1: { count: 3, lastUsedAt: 1000 } };
    const result = partializeUIStore({
      chatDrawerOpen: true,
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
      currentNodeId: 'note_1',
      currentChatSessionId: 'session_1',
      expandedNodes: new Set(['node-main:a:b', 'chat:a:c']),
      viewMode: 'cards',
      paletteUsage: usage,
      lastVisitDate: '2026-03-21',
    });
  });
});

describe('ui-store persist migration', () => {
  beforeEach(async () => {
    resetStores();
    await useUIStore.persist.clearStorage();
  });

  it('migrates a node-active panel layout into the drawer model', async () => {
    await chromeLocalStorage?.setItem('nodex-ui', {
      state: {
        panels: [
          { id: 'main', nodeId: 'note_1' },
          { id: 'chat', nodeId: 'chat:session_old' },
        ],
        activePanelId: 'main',
        expandedNodes: new Set(['node-main:proj_1:task_1', 'proj_1:task_2']),
        viewMode: 'list',
      },
      version: 5,
    });

    await useUIStore.persist.rehydrate();

    const state = useUIStore.getState();
    expect(state.currentNodeId).toBe('note_1');
    expect(state.currentChatSessionId).toBe('session_old');
    expect(state.expandedNodes).toEqual(new Set(['node-main:proj_1:task_1', 'node-main:proj_1:task_2']));
    expect(state.nodeHistory).toEqual([]);
    expect(state.nodeHistoryIndex).toBe(-1);
  });

  it('migrates a chat-active panel layout while preserving the fallback node target', async () => {
    await chromeLocalStorage?.setItem('nodex-ui', {
      state: {
        panels: [
          { id: 'main', nodeId: 'note_1' },
          { id: 'chat', nodeId: 'chat:session_focus' },
        ],
        activePanelId: 'chat',
        expandedNodes: new Set(['node-main:today:proj_1']),
        viewMode: 'tiles',
      },
      version: 5,
    });

    await useUIStore.persist.rehydrate();

    const state = useUIStore.getState();
    expect(state.currentNodeId).toBe('note_1');
    expect(state.currentChatSessionId).toBe('session_focus');
    expect(state.expandedNodes).toEqual(new Set(['node-main:today:proj_1']));
    expect(state.viewMode).toBe('tiles');
  });

  it('rehydrates legacy 2-part expanded keys into node-main scope', async () => {
    await chromeLocalStorage?.setItem('nodex-ui', {
      state: {
        currentNodeId: 'note_1',
        currentChatSessionId: null,
        expandedNodes: ['proj_1:task_1', 'proj_1:task_2'],
        viewMode: 'list',
        paletteUsage: {},
        lastVisitDate: null,
      },
      version: 7,
    });

    await useUIStore.persist.rehydrate();

    expect(useUIStore.getState().expandedNodes).toEqual(new Set([
      'node-main:proj_1:task_1',
      'node-main:proj_1:task_2',
    ]));
  });
});

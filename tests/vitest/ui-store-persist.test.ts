import {
  partializeUIStore,
} from '../../src/stores/ui-store.js';

describe('ui-store persistence helpers', () => {
  it('partialize keeps only persisted keys', () => {
    const expanded = new Set<string>(['main:a:b']);
    const result = partializeUIStore({
      panels: [{ id: 'main', nodeId: 'note_1' }],
      activePanelId: 'main',
      expandedNodes: expanded,
      viewMode: 'cards',
      searchOpen: true,
      searchQuery: 'x',
      focusedNodeId: 'note_1',
    } as never);

    expect(result).toEqual({
      panels: [{ id: 'main', nodeId: 'note_1' }],
      activePanelId: 'main',
      expandedNodes: expanded,
      viewMode: 'cards',
      paletteUsage: undefined,
      lastVisitDate: undefined,
    });
  });

  it('keeps current persisted shape for panel fields', () => {
    const persisted = partializeUIStore({
      panels: [{ id: 'main', nodeId: 'LIBRARY' }],
      activePanelId: 'main',
      expandedNodes: new Set<string>(),
      viewMode: 'list',
    } as never);

    expect(persisted.panels).toEqual([{ id: 'main', nodeId: 'LIBRARY' }]);
    expect(persisted.activePanelId).toBe('main');
  });
});

describe('ui-store persist migration v4→v5', () => {
  it('prefixes 2-part expand keys with main:', async () => {
    // Simulate v4 persisted state with old 2-part expand keys
    const { chromeLocalStorage } = await import('../../src/lib/chrome-storage.js');
    if (!chromeLocalStorage) return;

    const v4State = {
      state: {
        panels: [{ id: 'main', nodeId: 'note_1' }],
        activePanelId: 'main',
        expandedNodes: new Set(['proj_1:task_1', 'note_1:note_2']),
        viewMode: 'list',
      },
      version: 4,
    };

    await chromeLocalStorage.setItem('nodex-ui', v4State);

    // Import the store fresh to trigger migration
    const { useUIStore } = await import('../../src/stores/ui-store.js');
    // Trigger rehydration by calling persist rehydrate
    await useUIStore.persist.rehydrate();

    const { expandedNodes } = useUIStore.getState();
    // Old 2-part keys should now have 'main:' prefix
    expect(expandedNodes.has('main:proj_1:task_1')).toBe(true);
    expect(expandedNodes.has('main:note_1:note_2')).toBe(true);
    // Old keys should not exist
    expect(expandedNodes.has('proj_1:task_1')).toBe(false);
    expect(expandedNodes.has('note_1:note_2')).toBe(false);
  });

  it('preserves already-migrated 3-part keys', async () => {
    const { chromeLocalStorage } = await import('../../src/lib/chrome-storage.js');
    if (!chromeLocalStorage) return;

    const v4State = {
      state: {
        panels: [{ id: 'main', nodeId: 'note_1' }],
        activePanelId: 'main',
        expandedNodes: new Set(['main:proj_1:task_1', 'proj_1:task_2']),
        viewMode: 'list',
      },
      version: 4,
    };

    await chromeLocalStorage.setItem('nodex-ui', v4State);

    const { useUIStore } = await import('../../src/stores/ui-store.js');
    await useUIStore.persist.rehydrate();

    const { expandedNodes } = useUIStore.getState();
    // Already 3-part key stays as-is
    expect(expandedNodes.has('main:proj_1:task_1')).toBe(true);
    // 2-part key gets prefixed
    expect(expandedNodes.has('main:proj_1:task_2')).toBe(true);
  });
});

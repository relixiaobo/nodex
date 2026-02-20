import {
  migrateUIStoreState,
  partializeUIStore,
} from '../../src/stores/ui-store.js';

describe('ui-store persistence helpers', () => {
  it('partialize keeps only persisted keys', () => {
    const expanded = new Set<string>(['a:b']);
    const result = partializeUIStore({
      panelHistory: ['library', 'note_1'],
      panelIndex: 1,
      expandedNodes: expanded,
      sidebarOpen: true,
      viewMode: 'cards',
      searchOpen: true,
      searchQuery: 'x',
      focusedNodeId: 'note_1',
    } as never);

    expect(result).toEqual({
      panelHistory: ['library', 'note_1'],
      panelIndex: 1,
      expandedNodes: expanded,
      sidebarOpen: true,
      viewMode: 'cards',
    });
  });

  it('migrates v0 panelStack through to v2 (Loro reset)', () => {
    const migrated = migrateUIStoreState(
      {
        panelStack: ['a', 'b', 'c'],
        sidebarOpen: false,
      },
      0,
    ) as {
      panelHistory: string[];
      panelIndex: number;
      sidebarOpen: boolean;
    };

    // v0→v2: panelStack is converted, then Loro migration resets navigation
    expect(migrated.panelHistory).toEqual([]);
    expect(migrated.panelIndex).toBe(-1);
    expect(migrated.sidebarOpen).toBe(false);
  });

  it('migrates v1 state to v2 (Loro reset)', () => {
    const migrated = migrateUIStoreState(
      { panelHistory: ['ws_default_LIBRARY'], panelIndex: 0, sidebarOpen: true },
      1,
    ) as { panelHistory: string[]; panelIndex: number };

    // v1→v2: old container IDs are invalid, reset navigation
    expect(migrated.panelHistory).toEqual([]);
    expect(migrated.panelIndex).toBe(-1);
  });

  it('keeps state untouched when at current version', () => {
    const state = { panelHistory: ['LIBRARY'], panelIndex: 0 };
    expect(migrateUIStoreState(state, 2)).toBe(state);
  });
});

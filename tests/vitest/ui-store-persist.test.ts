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

  it('migrates v0 panelStack to history/index', () => {
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

    expect(migrated.panelHistory).toEqual(['a', 'b', 'c']);
    expect(migrated.panelIndex).toBe(2);
    expect(migrated.sidebarOpen).toBe(false);
  });

  it('keeps state untouched when no migration is needed', () => {
    const state = { panelHistory: ['x'], panelIndex: 0 };
    expect(migrateUIStoreState(state, 0)).toBe(state);
    expect(migrateUIStoreState(state, 1)).toBe(state);
  });
});

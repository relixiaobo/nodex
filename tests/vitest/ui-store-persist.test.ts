import {
  partializeUIStore,
} from '../../src/stores/ui-store.js';

describe('ui-store persistence helpers', () => {
  it('partialize keeps only persisted keys', () => {
    const expanded = new Set<string>(['a:b']);
    const result = partializeUIStore({
      panels: [{ id: 'main', nodeId: 'note_1' }],
      activePanelId: 'main',
      expandedNodes: expanded,
      viewMode: 'cards',
      searchOpen: true,
      searchQuery: 'x',
      chatOpen: true,
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

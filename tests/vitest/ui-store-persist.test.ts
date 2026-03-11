import {
  partializeUIStore,
} from '../../src/stores/ui-store.js';

describe('ui-store persistence helpers', () => {
  it('partialize keeps only persisted keys', () => {
    const expanded = new Set<string>(['a:b']);
    const result = partializeUIStore({
      panelHistory: ['library', 'note_1'],
      panelIndex: 1,
      expandedNodes: expanded,
      viewMode: 'cards',
      searchOpen: true,
      searchQuery: 'x',
      chatOpen: true,
      focusedNodeId: 'note_1',
    } as never);

    expect(result).toEqual({
      panelHistory: ['library', 'note_1'],
      panelIndex: 1,
      expandedNodes: expanded,
      viewMode: 'cards',
      paletteUsage: undefined,
      lastVisitDate: undefined,
    });
  });

  it('keeps current persisted shape for panel history fields', () => {
    const persisted = partializeUIStore({
      panelHistory: ['LIBRARY'],
      panelIndex: 0,
      expandedNodes: new Set<string>(),
      viewMode: 'list',
    } as never);

    expect(persisted.panelHistory).toEqual(['LIBRARY']);
    expect(persisted.panelIndex).toBe(0);
  });
});

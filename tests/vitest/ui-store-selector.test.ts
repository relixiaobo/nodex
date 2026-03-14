import { selectCurrentNodeId } from '../../src/stores/ui-store.js';

describe('ui-store selectors', () => {
  it('returns null when no panel matches activePanelId', () => {
    expect(
      selectCurrentNodeId({
        panels: [],
        activePanelId: '',
      } as never),
    ).toBeNull();

    expect(
      selectCurrentNodeId({
        panels: [{ id: 'main', nodeId: 'a' }],
        activePanelId: 'missing',
      } as never),
    ).toBeNull();
  });

  it('returns current node id by active panel', () => {
    expect(
      selectCurrentNodeId({
        panels: [
          { id: 'p1', nodeId: 'library' },
          { id: 'p2', nodeId: 'note_1' },
          { id: 'p3', nodeId: 'task_2' },
        ],
        activePanelId: 'p2',
      } as never),
    ).toBe('note_1');
  });
});

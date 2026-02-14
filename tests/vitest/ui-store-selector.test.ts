import { selectCurrentNodeId } from '../../src/stores/ui-store.js';

describe('ui-store selectors', () => {
  it('returns null when panel index is out of range', () => {
    expect(
      selectCurrentNodeId({
        panelHistory: [],
        panelIndex: -1,
      } as never),
    ).toBeNull();

    expect(
      selectCurrentNodeId({
        panelHistory: ['a'],
        panelIndex: 5,
      } as never),
    ).toBeNull();
  });

  it('returns current node id by panel index', () => {
    expect(
      selectCurrentNodeId({
        panelHistory: ['library', 'note_1', 'task_2'],
        panelIndex: 1,
      } as never),
    ).toBe('note_1');
  });
});

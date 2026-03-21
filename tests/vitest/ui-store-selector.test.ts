import { selectCurrentNodeId } from '../../src/stores/ui-store.js';

describe('ui-store selectors', () => {
  it('returns null when currentNodeId is missing', () => {
    expect(
      selectCurrentNodeId({
        currentNodeId: null,
      } as never),
    ).toBeNull();
  });

  it('returns the current node id directly', () => {
    expect(
      selectCurrentNodeId({
        currentNodeId: 'note_1',
      } as never),
    ).toBe('note_1');
  });
});

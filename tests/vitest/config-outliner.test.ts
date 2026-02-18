import { shouldShowConfigTrailingInput } from '../../src/components/fields/ConfigOutliner.js';

describe('config outliner trailing input visibility', () => {
  it('shows trailing input when config outliner is empty', () => {
    expect(shouldShowConfigTrailingInput([])).toBe(true);
  });

  it('shows trailing input when last row is a field', () => {
    expect(
      shouldShowConfigTrailingInput([
        { type: 'content' },
        { type: 'field' },
      ]),
    ).toBe(true);
  });

  it('hides trailing input when last row is a content node', () => {
    expect(
      shouldShowConfigTrailingInput([
        { type: 'field' },
        { type: 'content' },
      ]),
    ).toBe(false);
  });
});

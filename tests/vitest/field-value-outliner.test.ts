import {
  shouldShowFieldValueTrailingInput,
} from '../../src/components/fields/FieldValueOutliner.js';

describe('field value outliner trailing input visibility', () => {
  it('shows trailing input when field-value outliner is empty', () => {
    expect(shouldShowFieldValueTrailingInput([])).toBe(true);
  });

  it('shows trailing input when last row is a field', () => {
    expect(
      shouldShowFieldValueTrailingInput([
        { type: 'content' },
        { type: 'field' },
      ]),
    ).toBe(true);
  });

  it('hides trailing input when last row is a content node', () => {
    expect(
      shouldShowFieldValueTrailingInput([
        { type: 'field' },
        { type: 'content' },
      ]),
    ).toBe(false);
  });
});

import {
  shouldRenderSingleSelectOptionsPicker,
  shouldShowFieldValueTrailingInput,
} from '../../src/components/fields/FieldValueOutliner.js';
import { FIELD_TYPES } from '../../src/types/index.js';

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

describe('field value outliner options picker mode', () => {
  it('uses the single-select picker for locked single-cardinality options fields', () => {
    expect(
      shouldRenderSingleSelectOptionsPicker(FIELD_TYPES.OPTIONS, {
        locked: true,
        cardinality: 'single',
      }),
    ).toBe(true);
  });

  it('keeps unlocked options fields in outliner mode', () => {
    expect(
      shouldRenderSingleSelectOptionsPicker(FIELD_TYPES.OPTIONS, {
        locked: false,
        cardinality: 'single',
      }),
    ).toBe(false);
  });

  it('keeps list-valued options fields in outliner mode', () => {
    expect(
      shouldRenderSingleSelectOptionsPicker(FIELD_TYPES.OPTIONS, {
        locked: true,
        cardinality: 'list',
      }),
    ).toBe(false);
  });
});

import {
  shouldShowFieldValueTrailingInput,
  resolveSupertagPickerSelectedId,
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

describe('resolveSupertagPickerSelectedId', () => {
  it('returns selected supertag id from value node name', () => {
    const nodes: Record<string, { children?: string[]; name?: string; targetId?: string }> = {
      tuple_1: { children: ['value_1'] },
      value_1: { name: 'tagDef_task' },
    };
    const getNode = (id: string) => nodes[id] ?? null;

    expect(resolveSupertagPickerSelectedId('tuple_1', getNode)).toBe('tagDef_task');
  });

  it('returns undefined when value name is missing', () => {
    const nodes: Record<string, { children?: string[]; name?: string; targetId?: string }> = {
      tuple_1: { children: ['value_1'] },
      value_1: { targetId: 'tagDef_person' },
    };
    const getNode = (id: string) => nodes[id] ?? null;

    expect(resolveSupertagPickerSelectedId('tuple_1', getNode)).toBeUndefined();
  });
});

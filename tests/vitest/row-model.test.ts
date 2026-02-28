import { describe, expect, it } from 'vitest';
import {
  getDragSelectableRowIds,
  shouldShowTrailingInput,
  isHiddenFieldRow,
} from '../../src/components/outliner/row-model.js';
import { SYS_V } from '../../src/types/index.js';

describe('row-model helpers', () => {
  it('resolves hidden field mode correctly', () => {
    expect(isHiddenFieldRow(SYS_V.ALWAYS, false)).toBe(true);
    expect(isHiddenFieldRow(SYS_V.WHEN_EMPTY, true)).toBe(true);
    expect(isHiddenFieldRow(SYS_V.WHEN_EMPTY, false)).toBe(false);
    expect(isHiddenFieldRow(SYS_V.WHEN_NOT_EMPTY, false)).toBe(true);
    expect(isHiddenFieldRow(SYS_V.WHEN_NOT_EMPTY, true)).toBe(false);
    expect(isHiddenFieldRow(undefined, true)).toBe(false);
  });

  it('calculates trailing input visibility from last row type', () => {
    expect(shouldShowTrailingInput([])).toBe(true);
    expect(shouldShowTrailingInput([{ type: 'field' }])).toBe(true);
    expect(shouldShowTrailingInput([{ type: 'field' }, { type: 'content' }])).toBe(false);
  });

  it('includes hidden fields only when revealed for drag-select roots', () => {
    const rows = [
      { id: 'field_hidden', type: 'field', hidden: true },
      { id: 'field_visible', type: 'field' },
      { id: 'content_visible', type: 'content' },
    ] as const;
    const isRevealed = (id: string) => id === 'field_hidden';
    expect(getDragSelectableRowIds(rows, isRevealed)).toEqual([
      'field_hidden',
      'field_visible',
      'content_visible',
    ]);
    expect(getDragSelectableRowIds(rows, () => false)).toEqual([
      'field_visible',
      'content_visible',
    ]);
  });
});

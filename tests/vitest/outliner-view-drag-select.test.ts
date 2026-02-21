import { describe, expect, it } from 'vitest';
import {
  getDragSelectableRootIds,
  type OutlinerVisibleChildRow,
} from '../../src/components/outliner/OutlinerView.js';

describe('OutlinerView drag-select roots', () => {
  it('includes both content and field rows when visible', () => {
    const rows: OutlinerVisibleChildRow[] = [
      { id: 'field_status', type: 'field' },
      { id: 'task_1', type: 'content' },
      { id: 'field_due', type: 'field' },
    ];
    const ids = getDragSelectableRootIds(rows, () => false);
    expect(ids).toEqual(['field_status', 'task_1', 'field_due']);
  });

  it('excludes hidden fields unless manually revealed', () => {
    const rows: OutlinerVisibleChildRow[] = [
      { id: 'field_hidden', type: 'field', hidden: true },
      { id: 'task_1', type: 'content' },
      { id: 'field_revealed', type: 'field', hidden: true },
    ];
    const ids = getDragSelectableRootIds(rows, (id) => id === 'field_revealed');
    expect(ids).toEqual(['task_1', 'field_revealed']);
  });
});

import { Fragment, type ReactNode } from 'react';
import type { OutlinerRowItem } from './row-model.js';

interface RowHostProps<Row extends OutlinerRowItem> {
  rows: Row[];
  isRowVisible?: (row: Row) => boolean;
  renderField: (row: Extract<Row, { type: 'field' }>, index: number, rows: Row[]) => ReactNode;
  renderContent: (row: Extract<Row, { type: 'content' }>, index: number, rows: Row[]) => ReactNode;
}

export function RowHost<Row extends OutlinerRowItem>({
  rows,
  isRowVisible = (row) => !row.hidden,
  renderField,
  renderContent,
}: RowHostProps<Row>) {
  return rows.map((row, index) => {
    if (!isRowVisible(row)) return null;
    return (
      <Fragment key={row.id}>
        {row.type === 'field'
          ? renderField(row as Extract<Row, { type: 'field' }>, index, rows)
          : renderContent(row as Extract<Row, { type: 'content' }>, index, rows)}
      </Fragment>
    );
  });
}

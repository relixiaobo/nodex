import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RowHost } from '../../src/components/outliner/RowHost.js';

describe('RowHost', () => {
  it('renders field/content rows in order', () => {
    const rows = [
      { id: 'f1', type: 'field' as const },
      { id: 'c1', type: 'content' as const },
    ];
    const html = renderToStaticMarkup(createElement(
      'div',
      null,
      createElement(RowHost, {
        rows,
        renderField: (row) => createElement('span', { 'data-kind': 'field' }, row.id),
        renderContent: (row) => createElement('span', { 'data-kind': 'content' }, row.id),
      }),
    ));
    expect(html).toContain('data-kind="field"');
    expect(html).toContain('data-kind="content"');
    expect(html.indexOf('f1')).toBeLessThan(html.indexOf('c1'));
  });

  it('hides hidden rows by default and allows custom visibility rule', () => {
    const rows = [
      { id: 'f_hidden', type: 'field' as const, hidden: true },
      { id: 'c_visible', type: 'content' as const },
    ];

    const defaultHtml = renderToStaticMarkup(createElement(
      'div',
      null,
      createElement(RowHost, {
        rows,
        renderField: (row) => createElement('span', null, row.id),
        renderContent: (row) => createElement('span', null, row.id),
      }),
    ));
    expect(defaultHtml).not.toContain('f_hidden');
    expect(defaultHtml).toContain('c_visible');

    const customHtml = renderToStaticMarkup(createElement(
      'div',
      null,
      createElement(RowHost, {
        rows,
        isRowVisible: () => true,
        renderField: (row) => createElement('span', null, row.id),
        renderContent: (row) => createElement('span', null, row.id),
      }),
    ));
    expect(customHtml).toContain('f_hidden');
    expect(customHtml).toContain('c_visible');
  });
});

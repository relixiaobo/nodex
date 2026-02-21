import { beforeEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FieldList } from '../../src/components/fields/FieldList.js';
import { resetAndSeed } from './helpers/test-state.js';
import { useNodeStore } from '../../src/stores/node-store.js';

describe('FieldList system config rendering', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('renders tag-picker placeholders for tagDef config rows', () => {
    const html = renderToStaticMarkup(createElement(FieldList, { nodeId: 'tagDef_task' }));
    expect(html).toContain('Select supertag');
  });

  it('renders type/select placeholders for fieldDef config rows', () => {
    const html = renderToStaticMarkup(createElement(FieldList, { nodeId: 'attrDef_status' }));
    // SYS_A.TYPE_CHOICE currently has selected value "Options" on attrDef_status.
    expect(html).toContain('Options');
    expect(html).toContain('Select value');
  });

  it('hides auto-collect list rows when autocollect toggle is off', () => {
    useNodeStore.getState().setConfigValue('attrDef_status', 'autocollectOptions', false);
    const html = renderToStaticMarkup(createElement(FieldList, { nodeId: 'attrDef_status' }));
    expect(html).not.toContain('Empty');
  });
});

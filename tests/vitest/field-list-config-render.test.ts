import { beforeEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FieldList } from '../../src/components/fields/FieldList.js';
import { resetAndSeed } from './helpers/test-state.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { NDX_F } from '../../src/types/index.js';

describe('FieldList system config rendering', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('renders tag-picker placeholders for tagDef config rows', () => {
    const html = renderToStaticMarkup(createElement(FieldList, { nodeId: 'tagDef_task' }));
    expect(html).toContain('Select supertag');
  });

  it('renders selected and default values for fieldDef config rows', () => {
    const html = renderToStaticMarkup(createElement(FieldList, { nodeId: 'attrDef_status' }));

    expect(html).toContain('Options');
    expect(html).toContain('Never');
    expect(html).not.toContain('Select value');
  });

  it('renders the selected Boolean field type for settings field definitions', () => {
    const html = renderToStaticMarkup(createElement(FieldList, { nodeId: NDX_F.SETTING_HIGHLIGHT_ENABLED }));

    expect(html).toContain('Boolean');
    expect(html).not.toContain('Select field type');
  });

  it('hides auto-collect list rows when autocollect toggle is off', () => {
    useNodeStore.getState().setConfigValue('attrDef_status', 'autocollectOptions', false);
    const html = renderToStaticMarkup(createElement(FieldList, { nodeId: 'attrDef_status' }));
    expect(html).not.toContain('Empty');
  });

  it('uses tagDef defaults when deciding which config rows are visible', () => {
    const tagDef = useNodeStore.getState().createTagDef('Default tag');
    const html = renderToStaticMarkup(createElement(FieldList, { nodeId: tagDef.id }));

    expect(html).toContain('Show as checkbox');
    expect(html).not.toContain('Done state mapping');
    expect(html).not.toContain('Map checked to');
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FieldRow } from '../../src/components/fields/FieldRow.js';
import { resetAndSeed } from './helpers/test-state.js';
import { SYS_A } from '../../src/types/index.js';
import { FIELD_VALUE_INSET } from '../../src/components/fields/field-layout.js';
import * as loroDoc from '../../src/lib/loro-doc.js';

describe('FieldRow config control resolution', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('falls back to configKey registry when configControl is missing', () => {
    const html = renderToStaticMarkup(createElement(FieldRow, {
      nodeId: 'tagDef_task',
      attrDefId: SYS_A.EXTENDS,
      attrDefName: 'Extend from',
      tupleId: '__virtual_NDX_A05__',
      dataType: 'plain',
      isSystemConfig: true,
      configKey: SYS_A.EXTENDS,
    }));

    expect(html).toContain('Select supertag');
    expect(html).toContain(`padding-left:${FIELD_VALUE_INSET}px`);
  });

  it('renders number_input config as plain text input (no native spinner control)', () => {
    const html = renderToStaticMarkup(createElement(FieldRow, {
      nodeId: 'attrDef_age',
      attrDefId: SYS_A.MIN_VALUE,
      attrDefName: 'Minimum value',
      tupleId: '__virtual_NDX_A03__',
      dataType: 'plain',
      isSystemConfig: true,
      configKey: SYS_A.MIN_VALUE,
      configControl: 'number_input',
    }));

    expect(html).toContain('type="text"');
    expect(html).toContain('placeholder="Empty"');
  });

  it('shows validation warning for invalid number_input config value', () => {
    loroDoc.setNodeData('attrDef_age', 'minValue', 'not-a-number');

    const html = renderToStaticMarkup(createElement(FieldRow, {
      nodeId: 'attrDef_age',
      attrDefId: SYS_A.MIN_VALUE,
      attrDefName: 'Minimum value',
      tupleId: '__virtual_NDX_A03__',
      dataType: 'plain',
      isSystemConfig: true,
      configKey: SYS_A.MIN_VALUE,
      configControl: 'number_input',
    }));

    expect(html).toContain('text-warning');
  });
});

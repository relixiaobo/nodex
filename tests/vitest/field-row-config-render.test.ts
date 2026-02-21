import { beforeEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FieldRow } from '../../src/components/fields/FieldRow.js';
import { resetAndSeed } from './helpers/test-state.js';
import { SYS_A } from '../../src/types/index.js';

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
    expect(html).toContain('padding-left:25px');
  });
});

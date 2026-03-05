import { beforeEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resetAndSeed } from './helpers/test-state.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { AutoCollectSection } from '../../src/components/fields/AutoCollectSection.js';

describe('registerCollectedOption', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('creates auto-collected option under fieldDef', () => {
    const store = useNodeStore.getState();
    const fieldDefId = 'attrDef_status';

    const beforeChildren = loroDoc.getChildren(fieldDefId);
    const beforeCount = beforeChildren.length;

    store.registerCollectedOption(fieldDefId, 'NewOption');

    const afterChildren = loroDoc.getChildren(fieldDefId);
    expect(afterChildren.length).toBe(beforeCount + 1);

    const newOptionId = afterChildren[afterChildren.length - 1];
    const newOption = loroDoc.toNodexNode(newOptionId);
    expect(newOption?.name).toBe('NewOption');
    expect(newOption?.autoCollected).toBe(true);
  });

  it('does not duplicate existing option', () => {
    const store = useNodeStore.getState();
    const fieldDefId = 'attrDef_status';

    const beforeChildren = loroDoc.getChildren(fieldDefId);

    // "To Do" already exists as a pre-determined option
    store.registerCollectedOption(fieldDefId, 'To Do');

    const afterChildren = loroDoc.getChildren(fieldDefId);
    expect(afterChildren.length).toBe(beforeChildren.length);
  });

  it('AutoCollectSection renders collected options', () => {
    const store = useNodeStore.getState();
    const fieldDefId = 'attrDef_status';

    // Enable autocollect (default on, but set explicitly for test clarity)
    store.setConfigValue(fieldDefId, 'autocollectOptions', true);

    // Register a collected option
    store.registerCollectedOption(fieldDefId, 'MyCustomValue');

    const html = renderToStaticMarkup(createElement(AutoCollectSection, { fieldDefId }));
    expect(html).toContain('MyCustomValue');
  });

  it('AutoCollectSection excludes pre-determined options', () => {
    const fieldDefId = 'attrDef_status';

    // Pre-determined options (To Do, In Progress, Done) should not appear
    const html = renderToStaticMarkup(createElement(AutoCollectSection, { fieldDefId }));
    expect(html).not.toContain('To Do');
    expect(html).not.toContain('In Progress');
    expect(html).not.toContain('Done');
    expect(html).toContain('Empty'); // No collected values
  });
});

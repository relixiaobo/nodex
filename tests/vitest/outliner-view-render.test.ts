import { beforeEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OutlinerView } from '../../src/components/outliner/OutlinerView.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('OutlinerView render safety', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('renders node panel outliner without runtime error', () => {
    const html = renderToStaticMarkup(createElement(OutlinerView, { rootNodeId: 'task_1' }));
    expect(html).toContain('Status');
    expect(html).toContain('Session 3 — user struggled with the pricing page');
    expect(html).not.toMatch(/title="\\d+ references?"/);
  });
});

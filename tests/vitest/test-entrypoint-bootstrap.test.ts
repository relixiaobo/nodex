import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('test entrypoint bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('boots with forceFresh seed and skipBootstrap app', async () => {
    const seedTestData = vi.fn().mockResolvedValue(undefined);
    const render = vi.fn();
    const createRoot = vi.fn(() => ({ render }));
    const App = vi.fn(() => null);

    vi.doMock('../../src/entrypoints/test/seed-data.ts', () => ({ seedTestData }));
    vi.doMock('../../src/entrypoints/sidepanel/App.tsx', () => ({ App }));
    vi.doMock('react-dom/client', () => ({ default: { createRoot }, createRoot }));

    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);

    await import('../../src/entrypoints/test/main.tsx');
    await Promise.resolve();

    expect(seedTestData).toHaveBeenCalledWith({ forceFresh: true });
    expect(createRoot).toHaveBeenCalledWith(root);
    expect(render).toHaveBeenCalledTimes(1);

    const renderedTree = render.mock.calls[0][0] as React.ReactElement;
    expect(React.isValidElement(renderedTree)).toBe(true);
    const appElement = renderedTree.props.children as React.ReactElement;
    expect(React.isValidElement(appElement)).toBe(true);
    expect(appElement.type).toBe(App);
    expect(appElement.props.skipBootstrap).toBe(true);
  });
});

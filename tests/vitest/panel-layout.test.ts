import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PanelLayout } from '../../src/components/panel/PanelLayout.js';
import { useUIStore } from '../../src/stores/ui-store.js';
import { resetAndSeed } from './helpers/test-state.js';

class MockResizeObserver {
  static width = 400;

  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(target: Element) {
    this.callback(
      [
        {
          target,
          contentRect: {
            width: MockResizeObserver.width,
            height: 640,
          } as DOMRectReadOnly,
        } as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    );
  }

  disconnect() {}

  unobserve() {}

  takeRecords(): ResizeObserverEntry[] {
    return [];
  }
}

class MockIntersectionObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}

  observe() {
    this.callback(
      [
        {
          isIntersecting: true,
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver,
    );
  }

  disconnect() {}

  unobserve() {}

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  readonly root = null;
  readonly rootMargin = '0px';
  readonly thresholds = [0];
}

describe('PanelLayout notes dropdown', () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalResizeObserver: typeof globalThis.ResizeObserver | undefined;
  let originalIntersectionObserver: typeof globalThis.IntersectionObserver | undefined;

  beforeEach(() => {
    resetAndSeed();
    originalResizeObserver = globalThis.ResizeObserver;
    originalIntersectionObserver = globalThis.IntersectionObserver;
    globalThis.ResizeObserver = MockResizeObserver as typeof ResizeObserver;
    globalThis.IntersectionObserver = MockIntersectionObserver as typeof IntersectionObserver;

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    flushSync(() => {
      root.unmount();
    });
    container.remove();
    globalThis.ResizeObserver = originalResizeObserver;
    globalThis.IntersectionObserver = originalIntersectionObserver;
  });

  async function tick(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  async function renderLayout(): Promise<void> {
    flushSync(() => {
      root.render(React.createElement(PanelLayout, {
        toolbar: React.createElement('div', { 'data-testid': 'toolbar' }, 'Tools'),
      }));
    });
    await tick();
  }

  function setPanels(panels: Array<{ id: string; nodeId: string }>, activePanelId: string) {
    useUIStore.setState({ panels, activePanelId });
  }

  function getNotesTrigger(): HTMLButtonElement | null {
    return container.querySelector('button[aria-haspopup="menu"]');
  }

  function getMenuRow(label: string): HTMLDivElement | undefined {
    return Array.from(container.querySelectorAll('div')).find(
      (element) =>
        typeof element.className === 'string' &&
        element.className.includes('group/menu') &&
        element.textContent?.includes(label),
    ) as HTMLDivElement | undefined;
  }

  async function openNotesMenu(): Promise<void> {
    const trigger = getNotesTrigger();
    expect(trigger).not.toBeNull();

    flushSync(() => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await tick();
  }

  it('uses a notes dropdown in narrow mode and switches the active panel from it', async () => {
    setPanels([
      { id: 'main', nodeId: 'proj_1' },
      { id: 'notes', nodeId: 'note_1' },
    ], 'main');

    await renderLayout();

    expect(getNotesTrigger()?.textContent).toContain('My Project');

    await openNotesMenu();

    const noteRow = getMenuRow('Meeting notes - Team standup');
    expect(noteRow).toBeDefined();

    flushSync(() => {
      noteRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await tick();

    expect(useUIStore.getState().activePanelId).toBe('notes');
    expect(getNotesTrigger()?.textContent).toContain('Meeting notes - Team standup');
    expect(getNotesTrigger()?.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes the notes dropdown on outside pointerdown', async () => {
    setPanels([
      { id: 'main', nodeId: 'proj_1' },
      { id: 'notes', nodeId: 'note_1' },
    ], 'main');

    await renderLayout();
    await openNotesMenu();

    expect(getNotesTrigger()?.getAttribute('aria-expanded')).toBe('true');

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await tick();

    expect(getNotesTrigger()?.getAttribute('aria-expanded')).toBe('false');
    expect(getMenuRow('Meeting notes - Team standup')).toBeUndefined();
  });

  it('closes panels from the dropdown and leaves no close action for a single panel', async () => {
    setPanels([
      { id: 'main', nodeId: 'proj_1' },
      { id: 'notes', nodeId: 'note_1' },
    ], 'main');

    await renderLayout();
    await openNotesMenu();

    const noteRow = getMenuRow('Meeting notes - Team standup');
    const closeButton = noteRow?.querySelector('button[title="Close panel"]');

    expect(closeButton).not.toBeNull();

    flushSync(() => {
      closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await tick();

    expect(useUIStore.getState().panels).toHaveLength(1);
    expect(useUIStore.getState().activePanelId).toBe('main');
    expect(getNotesTrigger()).toBeNull();
    expect(container.querySelector('button[title="Close panel"]')).toBeNull();
  });

  it('shows chat panels with a sparkles icon in the dropdown', async () => {
    setPanels([
      { id: 'main', nodeId: 'proj_1' },
      { id: 'chat', nodeId: 'chat:sess_test' },
      { id: 'notes', nodeId: 'note_1' },
    ], 'main');

    await renderLayout();
    await openNotesMenu();

    const chatRow = getMenuRow('Chat');
    expect(chatRow).toBeDefined();
    expect(chatRow?.querySelector('svg')).not.toBeNull();
  });
});

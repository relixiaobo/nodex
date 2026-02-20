import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { FloatingToolbar } from '../../src/components/editor/FloatingToolbar.js';
import type { EditorView } from 'prosemirror-view';

type SelectionKind = 'TextSelection' | 'NodeSelection';

type FakeSel = {
  from: number;
  to: number;
  empty: boolean;
  anchor: number;
  head: number;
  constructor: { name: string };
  $from: { marks: () => never[] };
};

function makeSel(from: number, to: number, kind: SelectionKind): FakeSel {
  return {
    from, to, empty: from === to, anchor: from, head: to,
    constructor: { name: kind },
    $from: { marks: () => [] },
  };
}

function createFakeView() {
  const dom = document.createElement('div');
  let sel: FakeSel = makeSel(1, 1, 'TextSelection');

  const view = {
    dom,
    isFocused: true,
    editable: true,
    get state() {
      return {
        selection: sel,
        storedMarks: null,
        doc: { nodesBetween(_f: number, _t: number, _cb: () => void) {} },
      };
    },
    hasFocus() {
      return view.isFocused;
    },
    coordsAtPos: (pos: number) => ({ top: 200, left: pos * 10, right: pos * 10 + 8 }),
    setSelection(from: number, to: number, kind: SelectionKind = 'TextSelection') {
      sel = makeSel(from, to, kind);
    },
  };

  return view;
}

describe('FloatingToolbar selection behavior', () => {
  let container: HTMLDivElement;
  let root: Root;
  let fakeView: ReturnType<typeof createFakeView>;
  let originalRaf: typeof requestAnimationFrame;

  const getToolbar = () => document.querySelector('[data-testid="floating-toolbar"]');

  /**
   * Trigger updateToolbarFromSelection by simulating mousedown + mouseup.
   * mousedown sets pointerSelectingRef = true; mouseup clears it and calls
   * updateToolbarFromSelection via RAF (mocked to synchronous in tests).
   */
  const triggerUpdate = () => {
    fakeView.dom.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
  };

  beforeEach(() => {
    originalRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    };

    fakeView = createFakeView();
    document.body.appendChild(fakeView.dom);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    flushSync(() => {
      root.render(
        React.createElement(FloatingToolbar, {
          view: fakeView as unknown as EditorView,
        }),
      );
    });
  });

  afterEach(() => {
    flushSync(() => {
      root.unmount();
    });
    window.requestAnimationFrame = originalRaf;
    fakeView.dom.remove();
    container.remove();
  });

  it('shows toolbar for focused non-empty text selection', () => {
    fakeView.setSelection(2, 8, 'TextSelection');
    flushSync(() => triggerUpdate());

    expect(getToolbar()).not.toBeNull();
  });

  it('positions by selection focus edge instead of range midpoint', () => {
    fakeView.setSelection(20, 40, 'TextSelection');
    flushSync(() => triggerUpdate());

    const toolbar = getToolbar() as HTMLDivElement;
    expect(toolbar).not.toBeNull();
    // Forward selection focuses at to-1 = 39, center = (390 + 398) / 2 = 394.
    expect(toolbar.style.left).toBe('394px');
  });

  it('hides toolbar for empty or non-text selection', () => {
    fakeView.setSelection(2, 8, 'TextSelection');
    flushSync(() => triggerUpdate());
    expect(getToolbar()).not.toBeNull();

    fakeView.setSelection(4, 4, 'TextSelection');
    flushSync(() => triggerUpdate());
    expect(getToolbar()).toBeNull();

    fakeView.setSelection(2, 8, 'NodeSelection');
    flushSync(() => triggerUpdate());
    expect(getToolbar()).toBeNull();
  });

  it('shows only after mouseup while dragging selection', () => {
    fakeView.setSelection(2, 8, 'TextSelection');
    flushSync(() => {
      fakeView.dom.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    });
    expect(getToolbar()).toBeNull();

    flushSync(() => {
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    });
    expect(getToolbar()).not.toBeNull();
  });

  it('shows on second click mouseup for double-click word selection path', () => {
    fakeView.setSelection(4, 4, 'TextSelection');
    flushSync(() => {
      fakeView.dom.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, detail: 1 }));
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, detail: 1 }));
    });
    expect(getToolbar()).toBeNull();

    fakeView.setSelection(4, 9, 'TextSelection');
    flushSync(() => {
      fakeView.dom.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, detail: 2 }));
    });
    expect(getToolbar()).toBeNull();

    flushSync(() => {
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, detail: 2 }));
    });
    expect(getToolbar()).not.toBeNull();
  });

  it('hides toolbar when view loses focus', () => {
    fakeView.setSelection(2, 8, 'TextSelection');
    flushSync(() => triggerUpdate());
    expect(getToolbar()).not.toBeNull();

    fakeView.isFocused = false;
    flushSync(() => triggerUpdate());
    expect(getToolbar()).toBeNull();
  });
});

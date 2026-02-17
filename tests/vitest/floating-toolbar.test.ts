import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { FloatingToolbar } from '../../src/components/editor/FloatingToolbar.js';

type Listener = () => void;
type SelectionKind = 'TextSelection' | 'NodeSelection';

function createSelection(from: number, to: number, kind: SelectionKind) {
  return {
    from,
    to,
    empty: from === to,
    constructor: { name: kind },
  };
}

class FakeEditor {
  private readonly listeners = new Map<string, Set<Listener>>();

  public isFocused = true;
  public isEditable = true;
  public state = {
    selection: createSelection(1, 1, 'TextSelection'),
  };
  public view = {
    dom: document.createElement('div'),
    hasFocus: () => this.isFocused,
    coordsAtPos: (pos: number) => ({
      top: 200,
      left: pos * 10,
    }),
  };

  on(event: string, callback: Listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: Listener) {
    this.listeners.get(event)?.delete(callback);
  }

  emit(event: string) {
    for (const callback of this.listeners.get(event) ?? []) {
      callback();
    }
  }

  listenerCount(event: string) {
    return this.listeners.get(event)?.size ?? 0;
  }

  setSelection(from: number, to: number, kind: SelectionKind = 'TextSelection') {
    this.state.selection = createSelection(from, to, kind);
  }

  getAttributes(_mark: string) {
    return { href: '' };
  }

  isActive(_mark: string) {
    return false;
  }

  chain() {
    const chainApi = {
      focus: () => chainApi,
      extendMarkRange: (_mark: string) => chainApi,
      setLink: (_attrs: { href: string }) => chainApi,
      unsetLink: () => chainApi,
      toggleBold: () => chainApi,
      toggleItalic: () => chainApi,
      toggleStrike: () => chainApi,
      toggleCode: () => chainApi,
      toggleHighlight: () => chainApi,
      toggleHeadingMark: () => chainApi,
      run: () => true,
    };
    return chainApi;
  }
}

describe('FloatingToolbar selection behavior', () => {
  let container: HTMLDivElement;
  let root: Root;
  let editor: FakeEditor;
  let originalRaf: typeof requestAnimationFrame;

  const getToolbar = () => document.querySelector('[data-testid="floating-toolbar"]');

  beforeEach(() => {
    originalRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    };

    editor = new FakeEditor();
    document.body.appendChild(editor.view.dom);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    flushSync(() => {
      root.render(
        React.createElement(FloatingToolbar, {
          editor: editor,
        }),
      );
    });
  });

  afterEach(() => {
    flushSync(() => {
      root.unmount();
    });
    window.requestAnimationFrame = originalRaf;
    editor.view.dom.remove();
    container.remove();
  });

  it('subscribes to selection/focus/blur/transaction events', () => {
    expect(editor.listenerCount('selectionUpdate')).toBe(1);
    expect(editor.listenerCount('transaction')).toBe(1);
    expect(editor.listenerCount('focus')).toBe(1);
    expect(editor.listenerCount('blur')).toBe(1);
  });

  it('shows toolbar for focused non-empty text selection', () => {
    editor.setSelection(2, 8, 'TextSelection');

    flushSync(() => {
      editor.emit('selectionUpdate');
    });

    expect(getToolbar()).not.toBeNull();
  });

  it('hides toolbar for empty or non-text selection', () => {
    editor.setSelection(2, 8, 'TextSelection');
    flushSync(() => {
      editor.emit('selectionUpdate');
    });
    expect(getToolbar()).not.toBeNull();

    editor.setSelection(4, 4, 'TextSelection');
    flushSync(() => {
      editor.emit('selectionUpdate');
    });
    expect(getToolbar()).toBeNull();

    editor.setSelection(2, 8, 'NodeSelection');
    flushSync(() => {
      editor.emit('selectionUpdate');
    });
    expect(getToolbar()).toBeNull();
  });

  it('shows only after mouseup while dragging selection', () => {
    editor.setSelection(2, 8, 'TextSelection');

    flushSync(() => {
      editor.view.dom.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      editor.emit('selectionUpdate');
    });
    expect(getToolbar()).toBeNull();

    flushSync(() => {
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    });
    expect(getToolbar()).not.toBeNull();
  });

  it('shows on second click mouseup for double-click word selection path', () => {
    editor.setSelection(4, 4, 'TextSelection');

    flushSync(() => {
      editor.view.dom.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, detail: 1 }));
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, detail: 1 }));
      editor.emit('selectionUpdate');
    });
    expect(getToolbar()).toBeNull();

    editor.setSelection(4, 9, 'TextSelection');
    flushSync(() => {
      editor.view.dom.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, detail: 2 }));
      editor.emit('selectionUpdate');
    });
    expect(getToolbar()).toBeNull();

    flushSync(() => {
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, detail: 2 }));
    });
    expect(getToolbar()).not.toBeNull();
  });

  it('hides toolbar when editor blurs', () => {
    editor.setSelection(2, 8, 'TextSelection');
    flushSync(() => {
      editor.emit('selectionUpdate');
    });
    expect(getToolbar()).not.toBeNull();

    editor.isFocused = false;
    flushSync(() => {
      editor.emit('blur');
    });
    expect(getToolbar()).toBeNull();
  });
});

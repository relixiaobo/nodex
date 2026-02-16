import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import type { Editor } from '@tiptap/react';

const { bubbleMenuPropHistory } = vi.hoisted(() => ({
  bubbleMenuPropHistory: [] as Array<{ shouldShow: unknown; options: unknown }>,
}));

vi.mock('@tiptap/react/menus', () => ({
  BubbleMenu: ({
    children,
    shouldShow,
    options,
  }: {
    children: React.ReactNode;
    shouldShow: unknown;
    options: unknown;
  }) => {
    bubbleMenuPropHistory.push({ shouldShow, options });
    return React.createElement('div', { 'data-testid': 'bubble-menu' }, children);
  },
}));

import { FloatingToolbar } from '../../src/components/editor/FloatingToolbar.js';

type Listener = () => void;

class FakeEditor {
  private readonly listeners = new Map<string, Set<Listener>>();

  public isFocused = true;
  public view = {
    dom: document.createElement('div'),
  };

  public state = {
    selection: {
      empty: false,
    },
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

describe('FloatingToolbar render-loop guard', () => {
  let container: HTMLDivElement;
  let root: Root;
  let editor: FakeEditor;
  const latestShouldShow = () => bubbleMenuPropHistory.at(-1)!.shouldShow as (
    args: { editor: Editor; from: number; to: number }
  ) => boolean;

  beforeEach(async () => {
    bubbleMenuPropHistory.length = 0;
    editor = new FakeEditor();
    const editorTextNode = document.createElement('span');
    editorTextNode.textContent = 'sample text';
    editor.view.dom.appendChild(editorTextNode);
    document.body.appendChild(editor.view.dom);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    flushSync(() => {
      root.render(
        React.createElement(FloatingToolbar, {
          editor: editor as unknown as Editor,
        }),
      );
    });
  });

  afterEach(() => {
    flushSync(() => {
      root.unmount();
    });
    editor.view.dom.remove();
    container.remove();
  });

  it('listens to selectionUpdate/blur only (not transaction)', () => {
    expect(editor.listenerCount('selectionUpdate')).toBe(1);
    expect(editor.listenerCount('blur')).toBe(1);
    expect(editor.listenerCount('transaction')).toBe(0);
  });

  it('keeps BubbleMenu shouldShow/options refs stable across rerenders', () => {
    const firstRender = bubbleMenuPropHistory.at(-1);
    expect(firstRender).toBeDefined();

    flushSync(() => {
      editor.emit('selectionUpdate');
    });

    const secondRender = bubbleMenuPropHistory.at(-1);
    expect(secondRender).toBeDefined();
    expect(secondRender!.shouldShow).toBe(firstRender!.shouldShow);
    expect(secondRender!.options).toBe(firstRender!.options);
  });

  it('ignores transaction events from BubbleMenu updates', () => {
    const before = bubbleMenuPropHistory.length;

    flushSync(() => {
      editor.emit('transaction');
    });

    expect(bubbleMenuPropHistory.length).toBe(before);
  });

  it('shows toolbar only after pointer selection ends (mouseup)', () => {
    const selection = { editor: editor as unknown as Editor, from: 1, to: 4 };

    const beforePointerDown = latestShouldShow();
    expect(beforePointerDown(selection)).toBe(true);

    flushSync(() => {
      editor.view.dom.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      editor.emit('selectionUpdate');
    });
    const whileSelecting = latestShouldShow();
    expect(whileSelecting).not.toBe(beforePointerDown);
    expect(whileSelecting(selection)).toBe(false);

    flushSync(() => {
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    });
    const afterPointerUp = latestShouldShow();
    expect(afterPointerUp).not.toBe(whileSelecting);
    expect(afterPointerUp(selection)).toBe(true);
  });

  it('restores toolbar visibility after double-click selection', () => {
    const selection = { editor: editor as unknown as Editor, from: 2, to: 8 };

    flushSync(() => {
      editor.view.dom.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
      editor.view.dom.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      editor.emit('selectionUpdate');
    });

    expect(latestShouldShow()(selection)).toBe(false);

    flushSync(() => {
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    });
    expect(latestShouldShow()(selection)).toBe(true);
  });
});

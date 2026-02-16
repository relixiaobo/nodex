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
  public isEditable = true;
  public view = {
    dom: document.createElement('div'),
    hasFocus: () => this.isFocused,
    input: {
      mouseDown: false as boolean | { done: () => void },
    },
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
    args: {
      editor: Editor;
      view: { hasFocus: () => boolean; input?: { mouseDown?: unknown } };
      from: number;
      to: number;
    }
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
    const selection = { editor: editor as unknown as Editor, view: editor.view, from: 1, to: 4 };
    const shouldShow = latestShouldShow();

    editor.view.input.mouseDown = { done: () => {} };
    expect(shouldShow(selection)).toBe(false);

    editor.view.input.mouseDown = false;
    expect(shouldShow(selection)).toBe(true);
  });

  it('restores toolbar visibility after double-click selection', () => {
    const selection = { editor: editor as unknown as Editor, view: editor.view, from: 2, to: 8 };
    const shouldShow = latestShouldShow();

    editor.view.input.mouseDown = { done: () => {} };
    expect(shouldShow(selection)).toBe(false);

    editor.view.input.mouseDown = false;
    expect(shouldShow(selection)).toBe(true);
  });

  it('recovers when ProseMirror mouseDown flag gets stuck', () => {
    const selection = { editor: editor as unknown as Editor, view: editor.view, from: 3, to: 9 };
    const shouldShow = latestShouldShow();
    const nowSpy = vi.spyOn(Date, 'now');

    try {
      editor.view.input.mouseDown = { done: () => {} };

      nowSpy.mockReturnValue(1000);
      expect(shouldShow(selection)).toBe(false);

      // Failsafe: stale pointer state should no longer block toolbar forever.
      nowSpy.mockReturnValue(3000);
      expect(shouldShow(selection)).toBe(true);
    } finally {
      nowSpy.mockRestore();
    }
  });
});

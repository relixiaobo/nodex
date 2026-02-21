import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import type { EditorState } from 'prosemirror-state';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { TrailingInput } from '../../src/components/editor/TrailingInput.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { useUIStore } from '../../src/stores/ui-store.js';
import { resetAndSeed } from './helpers/test-state.js';

vi.mock('prosemirror-view', async () => {
  class MockEditorView {
    dom: HTMLElement & { pmViewDesc?: { view: MockEditorView } };
    state: EditorState;
    composing = false;
    isDestroyed = false;
    private readonly dispatchTransaction: (tr: unknown) => void;

    constructor(place: HTMLElement, props: { state: EditorState; dispatchTransaction: (tr: unknown) => void }) {
      this.state = props.state;
      this.dispatchTransaction = props.dispatchTransaction;
      this.dom = document.createElement('div');
      this.dom.className = 'ProseMirror';
      this.dom.pmViewDesc = { view: this };
      place.appendChild(this.dom);
    }

    updateState(next: EditorState) {
      this.state = next;
    }

    dispatch(tr: unknown) {
      this.dispatchTransaction(tr);
    }

    focus() {}

    hasFocus() {
      return true;
    }

    destroy() {
      this.isDestroyed = true;
      this.dom.remove();
    }
  }

  return {
    EditorView: MockEditorView,
  };
});

function getEditorViewFromContainer(container: HTMLElement): {
  state: { tr: { insertText: (text: string) => unknown } };
  dispatch: (tr: unknown) => void;
  focus: () => void;
} | null {
  const direct = container.querySelector('.ProseMirror') as
    | (HTMLElement & { pmViewDesc?: { view?: unknown } })
    | null;
  if (direct?.pmViewDesc?.view) {
    return direct.pmViewDesc.view as {
      state: { tr: { insertText: (text: string) => unknown } };
      dispatch: (tr: unknown) => void;
      focus: () => void;
    };
  }

  return null;
}

describe('TrailingInput trigger focus regression', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetAndSeed();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    flushSync(() => {
      root.unmount();
    });
    container.remove();
  });

  it('typing "@" sets caret target after trigger char for created node', async () => {
    const parentId = 'note_1';
    const parentExpandKey = `${loroDoc.getParentId(parentId) ?? ''}:${parentId}`;

    flushSync(() => {
      root.render(
        React.createElement(TrailingInput, {
          parentId,
          depth: 0,
          autoFocus: true,
          parentExpandKey,
        }),
      );
    });

    let view = getEditorViewFromContainer(container);
    for (let i = 0; i < 20 && !view; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      view = getEditorViewFromContainer(container);
    }
    expect(view).toBeTruthy();

    flushSync(() => {
      view!.focus();
      view!.dispatch(view!.state.tr.insertText('@'));
    });

    const ui = useUIStore.getState();
    const newNodeId = ui.focusedNodeId;
    expect(newNodeId).toBeTruthy();
    expect(ui.focusedParentId).toBe(parentId);
    expect(ui.triggerHint).toBe('@');
    expect(ui.focusClickCoords).toEqual({
      nodeId: newNodeId,
      parentId,
      textOffset: 1,
    });

    const newNode = useNodeStore.getState().getNode(newNodeId!);
    expect(newNode?.name).toBe('@');
  });
});

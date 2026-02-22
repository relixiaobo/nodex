import { describe, expect, it } from 'vitest';
import {
  resolveRowPointerSelectAction,
  shouldClearSelectionOnFocusIn,
  shouldClearSelectionOnPointerDown,
} from '../../src/lib/row-pointer-selection.js';

describe('resolveRowPointerSelectAction', () => {
  it('prioritizes modifier-based selection actions', () => {
    expect(resolveRowPointerSelectAction({
      justDragged: false,
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      allowSingle: false,
    })).toBe('toggle');

    expect(resolveRowPointerSelectAction({
      justDragged: false,
      metaKey: false,
      ctrlKey: false,
      shiftKey: true,
      allowSingle: false,
    })).toBe('range');
  });

  it('returns single only when explicitly allowed', () => {
    expect(resolveRowPointerSelectAction({
      justDragged: false,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      allowSingle: true,
    })).toBe('single');

    expect(resolveRowPointerSelectAction({
      justDragged: false,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      allowSingle: false,
    })).toBe(null);
  });

  it('suppresses selection after drag or while editing', () => {
    expect(resolveRowPointerSelectAction({
      justDragged: true,
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      allowSingle: true,
    })).toBe(null);

    expect(resolveRowPointerSelectAction({
      justDragged: false,
      isEditing: true,
      metaKey: false,
      ctrlKey: false,
      shiftKey: true,
      allowSingle: true,
    })).toBe(null);
  });

  it('always clears selection on plain pointer interactions', () => {
    const outside = document.createElement('div');
    expect(shouldClearSelectionOnPointerDown(outside)).toBe(true);
    expect(shouldClearSelectionOnPointerDown(null)).toBe(true);

    const row = document.createElement('div');
    row.setAttribute('data-node-id', 'n1');
    row.setAttribute('data-parent-id', 'root_1');
    const rowInner = document.createElement('span');
    row.appendChild(rowInner);
    expect(shouldClearSelectionOnPointerDown(rowInner)).toBe(true);
  });

  it('keeps selection only when focus remains inside outliner rows', () => {
    const outside = document.createElement('div');
    expect(shouldClearSelectionOnFocusIn(outside)).toBe(true);

    const sidebarLikeNode = document.createElement('div');
    sidebarLikeNode.setAttribute('data-node-id', 'sidebar_node');
    expect(shouldClearSelectionOnFocusIn(sidebarLikeNode)).toBe(true);

    const scope = document.createElement('div');
    const row = document.createElement('div');
    row.setAttribute('data-node-id', 'n1');
    row.setAttribute('data-parent-id', 'root_1');
    const rowInner = document.createElement('span');
    row.appendChild(rowInner);
    scope.appendChild(row);
    expect(shouldClearSelectionOnFocusIn(rowInner)).toBe(false);

    const fieldRow = document.createElement('div');
    fieldRow.setAttribute('data-field-row', 'true');
    const fieldInner = document.createElement('span');
    fieldRow.appendChild(fieldInner);
    scope.appendChild(fieldRow);
    expect(shouldClearSelectionOnFocusIn(fieldInner)).toBe(false);

    const trailing = document.createElement('div');
    trailing.setAttribute('data-trailing-parent-id', 'root_1');
    const trailingEditor = document.createElement('div');
    trailingEditor.className = 'ProseMirror';
    trailing.appendChild(trailingEditor);
    scope.appendChild(trailing);
    expect(shouldClearSelectionOnFocusIn(trailingEditor)).toBe(true);

    const editor = document.createElement('div');
    editor.className = 'ProseMirror';
    scope.appendChild(editor);
    expect(shouldClearSelectionOnFocusIn(editor)).toBe(true);
  });
});

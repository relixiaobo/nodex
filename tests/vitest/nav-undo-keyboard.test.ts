import { shouldHandleNavUndo } from '../../src/hooks/use-nav-undo-keyboard.js';

describe('nav undo keyboard guard', () => {
  it('rejects contentEditable/input/textarea targets', () => {
    const contentEditable = document.createElement('div');
    Object.defineProperty(contentEditable, 'isContentEditable', { value: true });
    expect(shouldHandleNavUndo(contentEditable, null)).toBe(false);

    const input = document.createElement('input');
    expect(shouldHandleNavUndo(input, null)).toBe(false);

    const textarea = document.createElement('textarea');
    expect(shouldHandleNavUndo(textarea, null)).toBe(false);
  });

  it('allows non-editing targets and null active element', () => {
    const plainDiv = document.createElement('div');
    expect(shouldHandleNavUndo(plainDiv, null)).toBe(true);
    expect(shouldHandleNavUndo(null, null)).toBe(true);
  });

  it('allows global undo when focusedNodeId is set but DOM focus is not editor', () => {
    const plainDiv = document.createElement('div');
    expect(shouldHandleNavUndo(plainDiv, 'node_1')).toBe(true);
    expect(shouldHandleNavUndo(null, 'node_1')).toBe(true);
  });

  it('still rejects undo when actual DOM focus is contentEditable/input/textarea', () => {
    const contentEditable = document.createElement('div');
    Object.defineProperty(contentEditable, 'isContentEditable', { value: true });
    expect(shouldHandleNavUndo(contentEditable, 'node_1')).toBe(false);

    const input = document.createElement('input');
    expect(shouldHandleNavUndo(input, 'node_1')).toBe(false);

    const textarea = document.createElement('textarea');
    expect(shouldHandleNavUndo(textarea, 'node_1')).toBe(false);
  });
});

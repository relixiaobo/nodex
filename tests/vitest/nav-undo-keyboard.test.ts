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

  it('rejects when a node editor is focused (PM keymap handles fallthrough)', () => {
    const plainDiv = document.createElement('div');
    expect(shouldHandleNavUndo(plainDiv, 'node_1')).toBe(false);
    expect(shouldHandleNavUndo(null, 'node_1')).toBe(false);
  });
});

import { shouldHandleNavUndo } from '../../src/hooks/use-nav-undo-keyboard.js';

describe('nav undo keyboard guard', () => {
  it('rejects contentEditable/input/textarea targets', () => {
    const contentEditable = document.createElement('div');
    Object.defineProperty(contentEditable, 'isContentEditable', { value: true });
    expect(shouldHandleNavUndo(contentEditable)).toBe(false);

    const input = document.createElement('input');
    expect(shouldHandleNavUndo(input)).toBe(false);

    const textarea = document.createElement('textarea');
    expect(shouldHandleNavUndo(textarea)).toBe(false);
  });

  it('allows non-editing targets and null active element', () => {
    const plainDiv = document.createElement('div');
    expect(shouldHandleNavUndo(plainDiv)).toBe(true);
    expect(shouldHandleNavUndo(null)).toBe(true);
  });
});

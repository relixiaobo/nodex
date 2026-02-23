import { shouldHandleNavUndo } from '../../src/hooks/use-nav-undo-keyboard.js';

describe('nav undo keyboard guard', () => {
  it('rejects input/textarea targets', () => {
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

  it('allows contentEditable and focused editor (handler checks e.defaultPrevented)', () => {
    const contentEditable = document.createElement('div');
    Object.defineProperty(contentEditable, 'isContentEditable', { value: true });
    // No longer blocked — the handler falls through to timeline if PM didn't consume the event
    expect(shouldHandleNavUndo(contentEditable, null)).toBe(true);

    const plainDiv = document.createElement('div');
    expect(shouldHandleNavUndo(plainDiv, 'node_1')).toBe(true);
    expect(shouldHandleNavUndo(null, 'node_1')).toBe(true);
  });
});

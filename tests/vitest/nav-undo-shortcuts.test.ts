import { resolveNavUndoAction } from '../../src/hooks/use-nav-undo-keyboard.js';

describe('nav undo shortcut resolution', () => {
  const undoBindings = ['Mod-z', 'Ctrl-z'];
  const redoBindings = ['Mod-Shift-z', 'Ctrl-Shift-z'];

  it('resolves undo on Mod/Ctrl+z', () => {
    expect(
      resolveNavUndoAction(
        new KeyboardEvent('keydown', { key: 'z', metaKey: true }),
        undoBindings,
        redoBindings,
      ),
    ).toBe('undo');
    expect(
      resolveNavUndoAction(
        new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }),
        undoBindings,
        redoBindings,
      ),
    ).toBe('undo');
  });

  it('resolves redo on Mod/Ctrl+Shift+z', () => {
    expect(
      resolveNavUndoAction(
        new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true }),
        undoBindings,
        redoBindings,
      ),
    ).toBe('redo');
    expect(
      resolveNavUndoAction(
        new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true }),
        undoBindings,
        redoBindings,
      ),
    ).toBe('redo');
  });

  it('returns null for non-matching keys', () => {
    expect(
      resolveNavUndoAction(
        new KeyboardEvent('keydown', { key: 'y', metaKey: true }),
        undoBindings,
        redoBindings,
      ),
    ).toBeNull();
  });
});

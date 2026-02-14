import { resolveSelectedReferenceShortcut } from '../../src/lib/selected-reference-shortcuts.js';

describe('selected reference shortcut resolver', () => {
  it('maps delete and conversion shortcuts when options are closed', () => {
    expect(
      resolveSelectedReferenceShortcut(new KeyboardEvent('keydown', { key: 'Backspace' }), false),
    ).toBe('delete');
    expect(
      resolveSelectedReferenceShortcut(new KeyboardEvent('keydown', { key: 'Delete' }), false),
    ).toBe('delete');
    expect(
      resolveSelectedReferenceShortcut(new KeyboardEvent('keydown', { key: 'ArrowRight' }), false),
    ).toBe('convert_arrow_right');
    expect(
      resolveSelectedReferenceShortcut(new KeyboardEvent('keydown', { key: 'a' }), false),
    ).toBe('convert_printable');
    expect(
      resolveSelectedReferenceShortcut(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }), false),
    ).toBeNull();
  });

  it('maps options navigation shortcuts when options are open', () => {
    expect(
      resolveSelectedReferenceShortcut(new KeyboardEvent('keydown', { key: 'ArrowDown' }), true),
    ).toBe('options_down');
    expect(
      resolveSelectedReferenceShortcut(new KeyboardEvent('keydown', { key: 'ArrowUp' }), true),
    ).toBe('options_up');
    expect(
      resolveSelectedReferenceShortcut(new KeyboardEvent('keydown', { key: 'Enter' }), true),
    ).toBe('options_confirm');
    expect(
      resolveSelectedReferenceShortcut(new KeyboardEvent('keydown', { key: 'Escape' }), true),
    ).toBe('escape');
  });

  it('keeps Escape as clear-selection action when options are closed', () => {
    expect(
      resolveSelectedReferenceShortcut(new KeyboardEvent('keydown', { key: 'Escape' }), false),
    ).toBe('escape');
  });
});

/**
 * Regression test for NodeEditor isEmpty check.
 *
 * Bug #54: contentEditable may contain only \u200B (zero-width space),
 * which makes textContent non-empty but is visually empty.
 * The isEmpty check must strip \u200B before trimming.
 */

/** Replicates the isEmpty logic from NodeEditor's backspace handler */
function isEditorEmpty(textContent: string): boolean {
  return !(textContent ?? '').replace(/\u200B/g, '').trim().length;
}

describe('editor isEmpty with zero-width space', () => {
  it('treats pure \u200B as empty', () => {
    expect(isEditorEmpty('\u200B')).toBe(true);
  });

  it('treats multiple \u200B as empty', () => {
    expect(isEditorEmpty('\u200B\u200B\u200B')).toBe(true);
  });

  it('treats \u200B with whitespace as empty', () => {
    expect(isEditorEmpty('\u200B \u200B')).toBe(true);
    expect(isEditorEmpty('  \u200B  ')).toBe(true);
  });

  it('treats actual text with \u200B as non-empty', () => {
    expect(isEditorEmpty('\u200Bhello')).toBe(false);
    expect(isEditorEmpty('hello\u200B')).toBe(false);
  });

  it('treats empty string as empty', () => {
    expect(isEditorEmpty('')).toBe(true);
  });

  it('treats whitespace-only as empty', () => {
    expect(isEditorEmpty('   ')).toBe(true);
  });

  it('treats normal text as non-empty', () => {
    expect(isEditorEmpty('hello')).toBe(false);
  });
});

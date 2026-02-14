/**
 * Regression test for NodeEditor isEmpty + handleDelete isEmpty checks.
 *
 * Bug #54: contentEditable may contain only \u200B (zero-width space),
 * which makes textContent non-empty but is visually empty.
 * Both the NodeEditor isEmpty check and OutlinerItem handleDelete must
 * strip \u200B before trimming.
 */

/** Replicates the isEmpty logic from NodeEditor's backspace handler */
function isEditorEmpty(textContent: string): boolean {
  return !(textContent ?? '').replace(/\u200B/g, '').trim().length;
}

/** Replicates the textOnly extraction from OutlinerItem.handleDelete */
function isDeleteTextEmpty(htmlName: string): boolean {
  const textOnly = htmlName.replace(/<[^>]*>/g, '').replace(/\u200B/g, '').trim();
  return textOnly.length === 0;
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

describe('handleDelete isEmpty with \u200B (Bug #54)', () => {
  it('treats HTML name with only \u200B as empty → allows delete', () => {
    expect(isDeleteTextEmpty('\u200B')).toBe(true);
  });

  it('treats empty HTML as empty', () => {
    expect(isDeleteTextEmpty('')).toBe(true);
  });

  it('treats HTML with tags but only \u200B text as empty', () => {
    expect(isDeleteTextEmpty('<span>\u200B</span>')).toBe(true);
  });

  it('treats HTML with real text as non-empty → blocks delete', () => {
    expect(isDeleteTextEmpty('hello')).toBe(false);
    expect(isDeleteTextEmpty('<b>hello</b>')).toBe(false);
  });

  it('treats HTML with \u200B and real text as non-empty', () => {
    expect(isDeleteTextEmpty('\u200Bhello')).toBe(false);
  });

  it('strips \u200B before checking — plain zero-width space name should delete', () => {
    // This is the exact scenario from Bug #54: Schema child node
    // created with content '\u200B' (browser inserts zero-width space
    // in empty contentEditable). Without \u200B stripping, textOnly
    // would be '\u200B' (length 1) → handleDelete refuses to delete.
    const name = '\u200B';
    const textOnly = name.replace(/<[^>]*>/g, '').replace(/\u200B/g, '').trim();
    expect(textOnly.length).toBe(0);
  });
});

describe('hash trigger cleanup safety (Bug #53)', () => {
  it('detects remaining # trigger after failed DOM cleanup', () => {
    // Simulates the safety check in cleanupHashTagText:
    // after deleteTextRange, verify text no longer contains #trigger
    const afterText = 'hello #per';  // cleanup failed — trigger still present
    const stillHasHash = afterText.match(/#([^\s#@]*)$/u);
    expect(stillHasHash).not.toBeNull();

    const cleaned = afterText.replace(/#([^\s#@]*)$/u, '');
    expect(cleaned).toBe('hello ');
  });

  it('passes when # trigger is properly removed', () => {
    const afterText = 'hello ';  // cleanup succeeded
    const stillHasHash = afterText.match(/#([^\s#@]*)$/u);
    expect(stillHasHash).toBeNull();
  });
});

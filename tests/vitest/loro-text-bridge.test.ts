import { LoroText } from 'loro-crdt';
import { readRichTextFromLoroText, writeRichTextToLoroText } from '../../src/lib/loro-text-bridge.js';

describe('loro-text bridge', () => {
  it('round-trips text, marks and inline refs through LoroText delta', () => {
    const text = new LoroText();
    writeRichTextToLoroText(text, {
      text: 'go \uFFFC now',
      marks: [
        { start: 0, end: 2, type: 'link', attrs: { href: 'https://example.com' } },
        { start: 5, end: 8, type: 'italic' },
      ],
      inlineRefs: [{ offset: 3, targetNodeId: 'task_1', displayName: 'Task' }],
    });

    const parsed = readRichTextFromLoroText(text);
    expect(parsed.text).toBe('go \uFFFC now');
    expect(parsed.marks).toEqual([
      { start: 0, end: 2, type: 'link', attrs: { href: 'https://example.com' } },
      { start: 5, end: 8, type: 'italic' },
    ]);
    expect(parsed.inlineRefs).toEqual([{ offset: 3, targetNodeId: 'task_1', displayName: 'Task' }]);
  });

  it('ignores invalid inlineRef offsets and mark ranges when writing', () => {
    const text = new LoroText();
    writeRichTextToLoroText(text, {
      text: 'abc',
      marks: [
        { start: 1, end: 99, type: 'bold' },
        { start: 2, end: 2, type: 'italic' },
      ],
      inlineRefs: [{ offset: 9, targetNodeId: 'task_1' }],
    });

    const parsed = readRichTextFromLoroText(text);
    expect(parsed.text).toBe('abc');
    expect(parsed.marks).toEqual([{ start: 1, end: 3, type: 'bold' }]);
    expect(parsed.inlineRefs).toEqual([]);
  });
});

import { htmlToMarks, marksToHtml, mergeAdjacentMarks } from '../../src/lib/editor-marks.js';

describe('editor-marks', () => {
  it('parses plain text and decodes html entities', () => {
    expect(htmlToMarks('')).toEqual({ text: '', marks: [], inlineRefs: [] });
    expect(htmlToMarks('a &amp; b')).toEqual({ text: 'a & b', marks: [], inlineRefs: [] });
  });

  it('parses nested marks and links', () => {
    const { text, marks } = htmlToMarks('<a href="https://x.com"><strong>Hi</strong></a>');
    expect(text).toBe('Hi');
    expect(marks).toEqual(expect.arrayContaining([
      { start: 0, end: 2, type: 'link', attrs: { href: 'https://x.com' } },
      { start: 0, end: 2, type: 'bold' },
    ]));
  });

  it('parses inline refs into replacement chars and entries', () => {
    const parsed = htmlToMarks('See <span data-inlineref-node="node_1">Ref</span> now');
    expect(parsed.text).toBe('See \uFFFC now');
    expect(parsed.inlineRefs).toEqual([{ offset: 4, targetNodeId: 'node_1', displayName: 'Ref' }]);
  });

  it('renders marks model back to html', () => {
    const html = marksToHtml(
      'See \uFFFC',
      [{ start: 0, end: 3, type: 'bold' }],
      [{ offset: 4, targetNodeId: 'task_1', displayName: 'Design task' }],
    );
    expect(html).toContain('<strong>See</strong>');
    expect(html).toContain('data-inlineref-node="task_1"');
    expect(html).toContain('class="inline-ref"');
  });

  it('keeps semantic equality for html -> marks -> html', () => {
    const original = '<strong>Bold</strong> <span data-inlineref-node="x">Ref</span> <a href="https://x.com">link</a>';
    const first = htmlToMarks(original);
    const roundtrip = marksToHtml(first.text, first.marks, first.inlineRefs);
    const second = htmlToMarks(roundtrip);
    expect(second).toEqual(first);
  });

  it('merges adjacent marks with same type and attrs', () => {
    const merged = mergeAdjacentMarks([
      { start: 0, end: 3, type: 'bold' },
      { start: 3, end: 6, type: 'bold' },
      { start: 6, end: 9, type: 'link', attrs: { href: 'https://a.com' } },
      { start: 9, end: 12, type: 'link', attrs: { href: 'https://a.com' } },
    ]);
    expect(merged).toEqual([
      { start: 0, end: 6, type: 'bold' },
      { start: 6, end: 12, type: 'link', attrs: { href: 'https://a.com' } },
    ]);
  });
});

import { combineMarks, docToMarks, marksToDoc, splitMarks } from '../../src/lib/pm-doc-utils.js';
import { pmSchema } from '../../src/components/editor/pm-schema.js';

describe('pm-doc-utils', () => {
  it('converts plain text + marks into pm doc and back', () => {
    const doc = marksToDoc('Hello', [{ start: 0, end: 5, type: 'bold' }], []);
    const result = docToMarks(doc);
    expect(result).toEqual({
      text: 'Hello',
      marks: [{ start: 0, end: 5, type: 'bold' }],
      inlineRefs: [],
    });
  });

  it('keeps inline refs and link marks roundtrip', () => {
    const doc = marksToDoc(
      'Go \uFFFC now',
      [{ start: 0, end: 2, type: 'link', attrs: { href: 'https://x.com' } }],
      [{ offset: 3, targetNodeId: 'task_1', displayName: 'Task 1' }],
    );

    const result = docToMarks(doc);
    expect(result.text).toBe('Go \uFFFC now');
    expect(result.inlineRefs).toEqual([{ offset: 3, targetNodeId: 'task_1', displayName: 'Task 1' }]);
    expect(result.marks).toEqual([
      { start: 0, end: 2, type: 'link', attrs: { href: 'https://x.com' } },
    ]);
  });

  it('splits and combines marks with offset adjustment', () => {
    const [before, after] = splitMarks(
      [{ start: 0, end: 6, type: 'bold' }],
      3,
    );
    expect(before).toEqual([{ start: 0, end: 3, type: 'bold' }]);
    expect(after).toEqual([{ start: 0, end: 3, type: 'bold' }]);

    const combined = combineMarks(before, after, 3);
    expect(combined).toEqual([{ start: 0, end: 6, type: 'bold' }]);
  });

  it('converts hard_break nodes to newlines in docToMarks', () => {
    // Build a doc: "line1" + hard_break + "line2"
    const doc = pmSchema.node('doc', null, [
      pmSchema.node('paragraph', null, [
        pmSchema.text('line1'),
        pmSchema.nodes.hard_break.create(),
        pmSchema.text('line2'),
      ]),
    ]);

    const result = docToMarks(doc);
    expect(result.text).toBe('line1\nline2');
    expect(result.marks).toEqual([]);
    expect(result.inlineRefs).toEqual([]);
  });
});


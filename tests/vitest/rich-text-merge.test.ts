import { describe, expect, it } from 'vitest';
import { combineInlineRefs, mergeRichTextPayload } from '../../src/lib/rich-text-merge.js';

describe('rich-text-merge', () => {
  it('shifts second inline refs by first text length', () => {
    const merged = combineInlineRefs(
      [{ offset: 1, targetNodeId: 'a' }],
      [{ offset: 0, targetNodeId: 'b' }],
      3,
    );
    expect(merged).toEqual([
      { offset: 1, targetNodeId: 'a' },
      { offset: 3, targetNodeId: 'b' },
    ]);
  });

  it('merges text/marks/inline refs into one payload', () => {
    const merged = mergeRichTextPayload(
      {
        text: 'abc',
        marks: [{ start: 0, end: 3, type: 'bold' }],
        inlineRefs: [{ offset: 1, targetNodeId: 'a' }],
      },
      {
        text: 'x',
        marks: [{ start: 0, end: 1, type: 'italic' }],
        inlineRefs: [{ offset: 0, targetNodeId: 'b' }],
      },
    );

    expect(merged.text).toBe('abcx');
    expect(merged.marks).toEqual([
      { start: 0, end: 3, type: 'bold' },
      { start: 3, end: 4, type: 'italic' },
    ]);
    expect(merged.inlineRefs).toEqual([
      { offset: 1, targetNodeId: 'a' },
      { offset: 3, targetNodeId: 'b' },
    ]);
  });
});

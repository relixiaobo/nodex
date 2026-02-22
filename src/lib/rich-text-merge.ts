import type { InlineRefEntry, TextMark } from '../types/index.js';
import { combineMarks } from './pm-doc-utils.js';

export interface RichTextPayload {
  text: string;
  marks?: TextMark[];
  inlineRefs?: InlineRefEntry[];
}

export function combineInlineRefs(
  firstInlineRefs: InlineRefEntry[],
  secondInlineRefs: InlineRefEntry[],
  firstTextLength: number,
): InlineRefEntry[] {
  const shiftedSecond = secondInlineRefs.map((ref) => ({
    ...ref,
    offset: ref.offset + firstTextLength,
  }));

  return [...firstInlineRefs, ...shiftedSecond].sort((a, b) => a.offset - b.offset);
}

export function mergeRichTextPayload(
  first: RichTextPayload,
  second: RichTextPayload,
): RichTextPayload {
  const firstText = first.text ?? '';
  const secondText = second.text ?? '';
  const firstMarks = first.marks ?? [];
  const secondMarks = second.marks ?? [];
  const firstInlineRefs = first.inlineRefs ?? [];
  const secondInlineRefs = second.inlineRefs ?? [];

  return {
    text: `${firstText}${secondText}`,
    marks: combineMarks(firstMarks, secondMarks, firstText.length),
    inlineRefs: combineInlineRefs(firstInlineRefs, secondInlineRefs, firstText.length),
  };
}

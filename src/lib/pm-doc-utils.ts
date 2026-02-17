import type { InlineRefEntry, TextMark } from '../types/index.js';
import { mergeAdjacentMarks } from './editor-marks.js';
import { pmSchema } from '../components/editor/pm-schema.js';
import { Node as PMNode } from '@tiptap/pm/model';

const INLINE_REF_CHAR = '\uFFFC';

const SUPPORTED_MARK_TYPES = new Set<TextMark['type']>([
  'bold',
  'italic',
  'strike',
  'code',
  'highlight',
  'headingMark',
  'link',
]);

function cloneMark(mark: TextMark): TextMark {
  return {
    start: mark.start,
    end: mark.end,
    type: mark.type,
    ...(mark.attrs ? { attrs: { ...mark.attrs } } : {}),
  };
}

function createPmMark(mark: TextMark) {
  if (mark.type === 'link') {
    return pmSchema.marks.link.create(mark.attrs ?? {});
  }
  return pmSchema.marks[mark.type].create();
}

export function marksToDoc(
  text: string,
  marks: TextMark[],
  inlineRefs: InlineRefEntry[] = [],
): PMNode {
  const safeText = text ?? '';
  const safeMarks = marks ?? [];
  const safeInlineRefs = inlineRefs ?? [];

  const refByOffset = new Map<number, InlineRefEntry>();
  for (const ref of safeInlineRefs) {
    if (ref.offset >= 0 && ref.offset < safeText.length) {
      refByOffset.set(ref.offset, ref);
    }
  }

  const boundaries = new Set<number>([0, safeText.length]);
  for (const mark of safeMarks) {
    const start = Math.max(0, Math.min(mark.start, safeText.length));
    const end = Math.max(0, Math.min(mark.end, safeText.length));
    if (start < end) {
      boundaries.add(start);
      boundaries.add(end);
    }
  }
  for (const ref of safeInlineRefs) {
    if (ref.offset >= 0 && ref.offset < safeText.length) {
      boundaries.add(ref.offset);
      boundaries.add(ref.offset + 1);
    }
  }

  const sorted = [...boundaries].sort((a, b) => a - b);
  const inlineNodes: PMNode[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    const segment = safeText.slice(start, end);
    if (!segment) continue;

    if (segment === INLINE_REF_CHAR && refByOffset.has(start)) {
      const ref = refByOffset.get(start)!;
      inlineNodes.push(
        pmSchema.nodes.inlineReference.create({
          targetNodeId: ref.targetNodeId,
          displayName: ref.displayName ?? '',
        }),
      );
      continue;
    }

    const activeMarks = safeMarks
      .filter((mark) => mark.start <= start && end <= mark.end)
      .map(createPmMark);
    inlineNodes.push(pmSchema.text(segment, activeMarks));
  }

  return pmSchema.node('doc', null, [
    pmSchema.node('paragraph', null, inlineNodes),
  ]);
}

export function docToMarks(doc: PMNode): {
  text: string;
  marks: TextMark[];
  inlineRefs: InlineRefEntry[];
} {
  const paragraph = doc.firstChild;
  if (!paragraph) return { text: '', marks: [], inlineRefs: [] };

  let text = '';
  const rawMarks: TextMark[] = [];
  const inlineRefs: InlineRefEntry[] = [];

  paragraph.forEach((node) => {
    if (node.type.name === 'inlineReference') {
      inlineRefs.push({
        offset: text.length,
        targetNodeId: node.attrs.targetNodeId as string,
        ...(node.attrs.displayName ? { displayName: node.attrs.displayName as string } : {}),
      });
      text += INLINE_REF_CHAR;
      return;
    }

    if (!node.isText || !node.text) return;

    const start = text.length;
    text += node.text;
    const end = text.length;
    for (const mark of node.marks) {
      const type = mark.type.name as TextMark['type'];
      if (!SUPPORTED_MARK_TYPES.has(type)) continue;
      rawMarks.push({
        start,
        end,
        type,
        ...(mark.attrs && Object.keys(mark.attrs).length > 0
          ? { attrs: mark.attrs as Record<string, string> }
          : {}),
      });
    }
  });

  return {
    text,
    marks: mergeAdjacentMarks(rawMarks),
    inlineRefs,
  };
}

export function splitMarks(
  marks: TextMark[],
  splitPos: number,
): [TextMark[], TextMark[]] {
  const before: TextMark[] = [];
  const after: TextMark[] = [];

  for (const mark of marks) {
    if (mark.end <= splitPos) {
      before.push(cloneMark(mark));
      continue;
    }
    if (mark.start >= splitPos) {
      after.push({
        ...cloneMark(mark),
        start: mark.start - splitPos,
        end: mark.end - splitPos,
      });
      continue;
    }
    before.push({ ...cloneMark(mark), end: splitPos });
    after.push({
      ...cloneMark(mark),
      start: 0,
      end: mark.end - splitPos,
    });
  }

  return [before, after];
}

export function combineMarks(
  firstMarks: TextMark[],
  secondMarks: TextMark[],
  firstTextLength: number,
): TextMark[] {
  const shiftedSecond = secondMarks.map((mark) => ({
    ...cloneMark(mark),
    start: mark.start + firstTextLength,
    end: mark.end + firstTextLength,
  }));

  return mergeAdjacentMarks([...firstMarks.map(cloneMark), ...shiftedSecond]);
}


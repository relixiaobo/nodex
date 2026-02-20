import type { InlineRefEntry, TextMark } from '../types/index.js';
import { mergeAdjacentMarks } from './editor-marks.js';

const INLINE_REF_CHAR = '\uFFFC';
const INLINE_REF_HREF_PREFIX = 'nodex-ref:';

type LoroDeltaEntry = {
  insert: unknown;
  attributes?: Record<string, unknown>;
};

const MARK_KEYS: Array<TextMark['type']> = [
  'bold',
  'italic',
  'strike',
  'code',
  'highlight',
  'headingMark',
];

function clampRange(start: number, end: number, len: number): [number, number] | null {
  const s = Math.max(0, Math.min(start, len));
  const e = Math.max(0, Math.min(end, len));
  if (s >= e) return null;
  return [s, e];
}

function readLinkHref(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'href' in value) {
    const href = (value as { href?: unknown }).href;
    if (typeof href === 'string') return href;
  }
  return null;
}

function encodeInlineRefHref(ref: InlineRefEntry): string {
  const target = encodeURIComponent(ref.targetNodeId);
  const display = encodeURIComponent(ref.displayName ?? '');
  return `${INLINE_REF_HREF_PREFIX}${target}|${display}`;
}

function decodeInlineRefHref(href: string): { targetNodeId: string; displayName?: string } | null {
  if (!href.startsWith(INLINE_REF_HREF_PREFIX)) return null;
  const payload = href.slice(INLINE_REF_HREF_PREFIX.length);
  const [targetRaw, displayRaw = ''] = payload.split('|');
  const targetNodeId = decodeURIComponent(targetRaw || '');
  if (!targetNodeId) return null;
  const displayName = decodeURIComponent(displayRaw || '');
  return {
    targetNodeId,
    ...(displayName ? { displayName } : {}),
  };
}

export interface RichTextContentPayload {
  text: string;
  marks: TextMark[];
  inlineRefs: InlineRefEntry[];
}

export function writeRichTextToLoroText(
  loroText: { toString(): string; insert(index: number, text: string): void; delete(index: number, len: number): void; mark(range: { start: number; end: number }, key: string, value: unknown): void },
  payload: RichTextContentPayload,
): void {
  const text = payload.text ?? '';
  const marks = mergeAdjacentMarks(payload.marks ?? []);
  const inlineRefs = payload.inlineRefs ?? [];

  const current = loroText.toString();
  if (current.length > 0) {
    loroText.delete(0, current.length);
  }
  if (text.length > 0) {
    loroText.insert(0, text);
  }

  for (const mark of marks) {
    const range = clampRange(mark.start, mark.end, text.length);
    if (!range) continue;
    const [start, end] = range;
    if (mark.type === 'link') {
      const href = mark.attrs?.href;
      if (!href) continue;
      loroText.mark({ start, end }, 'link', href);
      continue;
    }
    loroText.mark({ start, end }, mark.type, true);
  }

  for (const ref of inlineRefs) {
    if (!ref?.targetNodeId) continue;
    if (ref.offset < 0 || ref.offset >= text.length) continue;
    if (text[ref.offset] !== INLINE_REF_CHAR) continue;
    const start = ref.offset;
    const end = ref.offset + 1;
    loroText.mark({ start, end }, 'link', encodeInlineRefHref(ref));
  }
}

export function readRichTextFromLoroText(
  loroText: { toDelta(): unknown },
): RichTextContentPayload {
  const delta = loroText.toDelta() as LoroDeltaEntry[];
  let text = '';
  const rawMarks: TextMark[] = [];
  const inlineRefs: InlineRefEntry[] = [];

  for (const entry of delta) {
    if (typeof entry?.insert !== 'string') continue;
    const segment = entry.insert;
    if (!segment) continue;

    const start = text.length;
    const end = start + segment.length;
    text += segment;
    const attrs = entry.attributes ?? {};

    for (const key of MARK_KEYS) {
      if (!attrs[key]) continue;
      rawMarks.push({ start, end, type: key });
    }

    const href = readLinkHref(attrs.link);
    const inlineRefPayload = href ? decodeInlineRefHref(href) : null;
    if (href && !inlineRefPayload) {
      rawMarks.push({ start, end, type: 'link', attrs: { href } });
    }

    if (inlineRefPayload) {
      for (let i = 0; i < segment.length; i++) {
        if (segment[i] !== INLINE_REF_CHAR) continue;
        inlineRefs.push({
          offset: start + i,
          targetNodeId: inlineRefPayload.targetNodeId,
          ...(inlineRefPayload.displayName ? { displayName: inlineRefPayload.displayName } : {}),
        });
      }
    }
  }

  return {
    text,
    marks: mergeAdjacentMarks(rawMarks),
    inlineRefs: inlineRefs.sort((a, b) => a.offset - b.offset),
  };
}

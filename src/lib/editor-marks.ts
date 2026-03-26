import type { InlineRefEntry, TextMark } from '../types/index.js';
import { resolveInlineReferenceTextColor } from './tag-colors.js';

const INLINE_REF_CHAR = '\uFFFC';

type MarkType = TextMark['type'];

interface ActiveMark {
  type: MarkType;
  attrs?: Record<string, string>;
}

const MARK_ORDER: Record<MarkType, number> = {
  link: 0,
  headingMark: 1,
  bold: 2,
  italic: 3,
  strike: 4,
  code: 5,
  highlight: 6,
};

function normalizeAttrs(attrs?: Record<string, string>): Record<string, string> | undefined {
  if (!attrs) return undefined;
  const keys = Object.keys(attrs).sort();
  if (keys.length === 0) return undefined;
  const normalized: Record<string, string> = {};
  for (const key of keys) {
    const value = attrs[key];
    if (value !== undefined) normalized[key] = value;
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function areAttrsEqual(a?: Record<string, string>, b?: Record<string, string>): boolean {
  const na = normalizeAttrs(a);
  const nb = normalizeAttrs(b);
  if (!na && !nb) return true;
  if (!na || !nb) return false;
  const aKeys = Object.keys(na);
  const bKeys = Object.keys(nb);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => na[key] === nb[key]);
}

function cloneMark(mark: TextMark): TextMark {
  return {
    start: mark.start,
    end: mark.end,
    type: mark.type,
    ...(mark.attrs ? { attrs: { ...mark.attrs } } : {}),
  };
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;');
}

function getElementTagMarks(el: Element): ActiveMark[] {
  const marks: ActiveMark[] = [];
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case 'strong':
    case 'b':
      marks.push({ type: 'bold' });
      break;
    case 'em':
    case 'i':
      marks.push({ type: 'italic' });
      break;
    case 's':
    case 'strike':
    case 'del':
      marks.push({ type: 'strike' });
      break;
    case 'code':
      marks.push({ type: 'code' });
      break;
    case 'mark':
      marks.push({ type: 'highlight' });
      break;
    case 'a': {
      const href = (el as HTMLAnchorElement).getAttribute('href') ?? '';
      marks.push({ type: 'link', attrs: { href } });
      break;
    }
    case 'span': {
      if (el.getAttribute('data-heading-mark') === 'true') {
        marks.push({ type: 'headingMark' });
      }
      break;
    }
  }
  return marks;
}

function isBoldStyle(fontWeight: string): boolean {
  const normalized = fontWeight.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === 'bold' || normalized === 'bolder') return true;
  const numeric = Number.parseInt(normalized, 10);
  return Number.isFinite(numeric) && numeric >= 600;
}

function getElementStyleMarks(el: Element): ActiveMark[] {
  if (!(el instanceof HTMLElement)) return [];

  const marks: ActiveMark[] = [];
  if (isBoldStyle(el.style.fontWeight)) {
    marks.push({ type: 'bold' });
  }
  if (/(italic|oblique)/i.test(el.style.fontStyle)) {
    marks.push({ type: 'italic' });
  }
  const textDecoration = `${el.style.textDecoration} ${el.style.textDecorationLine}`.toLowerCase();
  if (textDecoration.includes('line-through')) {
    marks.push({ type: 'strike' });
  }
  return marks;
}

function getElementMarks(el: Element): ActiveMark[] {
  const marks: ActiveMark[] = [];
  const seen = new Set<string>();

  const add = (mark: ActiveMark): void => {
    const key = `${mark.type}:${JSON.stringify(normalizeAttrs(mark.attrs) ?? {})}`;
    if (seen.has(key)) return;
    seen.add(key);
    marks.push(mark);
  };

  for (const mark of getElementTagMarks(el)) add(mark);
  for (const mark of getElementStyleMarks(el)) add(mark);

  return marks;
}

export function mergeAdjacentMarks(marks: TextMark[]): TextMark[] {
  if (marks.length <= 1) return marks.map(cloneMark);

  const sorted = marks
    .map(cloneMark)
    .sort((a, b) => a.start - b.start || a.end - b.end || a.type.localeCompare(b.type));

  const merged: TextMark[] = [];
  for (const mark of sorted) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.type === mark.type &&
      areAttrsEqual(prev.attrs, mark.attrs) &&
      mark.start <= prev.end
    ) {
      prev.end = Math.max(prev.end, mark.end);
      continue;
    }
    merged.push(mark);
  }
  return merged;
}

export function htmlToMarks(html: string): {
  text: string;
  marks: TextMark[];
  inlineRefs: InlineRefEntry[];
} {
  if (!html) {
    return { text: '', marks: [], inlineRefs: [] };
  }

  const container = document.createElement('div');
  container.innerHTML = html;

  let text = '';
  const rawMarks: TextMark[] = [];
  const inlineRefs: InlineRefEntry[] = [];

  function appendText(value: string, activeMarks: ActiveMark[]) {
    if (!value) return;
    const start = text.length;
    text += value;
    const end = text.length;
    for (const mark of activeMarks) {
      rawMarks.push({
        start,
        end,
        type: mark.type,
        ...(mark.attrs ? { attrs: { ...mark.attrs } } : {}),
      });
    }
  }

  function walk(node: Node, activeMarks: ActiveMark[]) {
    if (node.nodeType === Node.TEXT_NODE) {
      appendText(node.textContent ?? '', activeMarks);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;

    if (el.tagName.toLowerCase() === 'br') {
      appendText(' ', activeMarks);
      return;
    }

    const inlineRefTarget = el.getAttribute('data-inlineref-node');
    if (inlineRefTarget) {
      const offset = text.length;
      text += INLINE_REF_CHAR;
      inlineRefs.push({
        offset,
        targetNodeId: inlineRefTarget,
        ...(el.textContent ? { displayName: el.textContent } : {}),
      });
      return;
    }

    const marks = getElementMarks(el);
    const nextMarks = marks.length > 0 ? [...activeMarks, ...marks] : activeMarks;
    for (const child of Array.from(el.childNodes)) {
      walk(child, nextMarks);
    }
  }

  for (const child of Array.from(container.childNodes)) {
    walk(child, []);
  }

  return {
    text,
    marks: mergeAdjacentMarks(rawMarks),
    inlineRefs,
  };
}

function openTag(mark: TextMark): string {
  switch (mark.type) {
    case 'bold':
      return '<strong>';
    case 'italic':
      return '<em>';
    case 'strike':
      return '<s>';
    case 'code':
      return '<code>';
    case 'highlight':
      return '<mark>';
    case 'headingMark':
      return '<span data-heading-mark="true">';
    case 'link':
      return `<a href="${escapeHtml(mark.attrs?.href ?? '')}">`;
  }
}

function closeTag(mark: TextMark): string {
  switch (mark.type) {
    case 'bold':
      return '</strong>';
    case 'italic':
      return '</em>';
    case 'strike':
      return '</s>';
    case 'code':
      return '</code>';
    case 'highlight':
      return '</mark>';
    case 'headingMark':
      return '</span>';
    case 'link':
      return '</a>';
  }
}

export function marksToHtml(
  text: string,
  marks: TextMark[],
  inlineRefs: InlineRefEntry[] = [],
): string {
  if (!text) return '';

  const normalizedMarks = mergeAdjacentMarks(marks)
    .map((mark) => {
      const start = Math.max(0, Math.min(mark.start, text.length));
      const end = Math.max(0, Math.min(mark.end, text.length));
      return {
        ...mark,
        start,
        end,
      };
    })
    .filter((mark) => mark.end > mark.start);

  const refByOffset = new Map<number, InlineRefEntry>();
  for (const ref of inlineRefs) {
    if (ref.offset >= 0 && ref.offset < text.length) {
      refByOffset.set(ref.offset, ref);
    }
  }

  const boundaries = new Set<number>([0, text.length]);
  for (const mark of normalizedMarks) {
    boundaries.add(mark.start);
    boundaries.add(mark.end);
  }
  for (const ref of inlineRefs) {
    if (ref.offset >= 0 && ref.offset < text.length) {
      boundaries.add(ref.offset);
      boundaries.add(ref.offset + 1);
    }
  }
  const sorted = [...boundaries].sort((a, b) => a - b);

  let html = '';
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    const segment = text.slice(start, end);
    if (!segment) continue;

    if (segment === INLINE_REF_CHAR && refByOffset.has(start)) {
      const ref = refByOffset.get(start)!;
      const refColor = resolveInlineReferenceTextColor(ref.targetNodeId);
      html += `<span data-inlineref-node="${escapeHtml(ref.targetNodeId)}" class="inline-ref" style="color:${escapeHtml(refColor)};--inline-ref-accent:${escapeHtml(refColor)}">@${escapeHtml(ref.displayName ?? '')} </span>`;
      continue;
    }

    const activeMarks = normalizedMarks
      .filter((mark) => mark.start <= start && end <= mark.end)
      .sort((a, b) => MARK_ORDER[a.type] - MARK_ORDER[b.type]);

    let chunk = escapeHtml(segment);
    for (let idx = activeMarks.length - 1; idx >= 0; idx--) {
      const mark = activeMarks[idx];
      chunk = `${openTag(mark)}${chunk}${closeTag(mark)}`;
    }
    html += chunk;
  }

  return html;
}

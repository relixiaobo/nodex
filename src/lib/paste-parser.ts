import type { ParsedContentNode } from './html-to-nodes.js';
import { parseHtmlToNodes } from './html-to-nodes.js';
import { htmlToMarks } from './editor-marks.js';

export interface ParsedPasteField {
  name: string;
  value: string;
}

export type ParsedPasteNode = ParsedContentNode & {
  tags?: string[];
  fields?: ParsedPasteField[];
};

const LIST_LINE_RE = /^(\s*)(?:[-*+]|\d+\.)\s+(.+)$/;
const TAG_RE = /(^|\s)#([A-Za-z0-9][\w-]*)/g;
const FIELD_RE = /(^|\s)([A-Za-z0-9][\w-]*)::\s*([^#\n]+?)(?=(?:\s+[A-Za-z0-9][\w-]*::)|\s+#|$)/g;

export function parseMultiLinePaste(plain: string, html?: string): ParsedPasteNode[] {
  const rawPlain = plain ?? '';

  if (html && shouldPreferHtml(html, rawPlain)) {
    const htmlNodes = parseHtmlBlocks(html);
    if (htmlNodes.length > 0) return htmlNodes;
  }

  const lines = rawPlain.split(/\r?\n/);
  const markdownNodes = parseMarkdownList(lines);
  if (markdownNodes && markdownNodes.length > 0) {
    return markdownNodes;
  }

  return parseFlatLines(lines);
}

export function parseMarkdownList(lines: string[]): ParsedPasteNode[] | null {
  const nonEmpty = lines
    .map((line) => line.replace(/\r/g, ''))
    .filter((line) => line.trim().length > 0);

  if (nonEmpty.length < 2) return null;

  const items: Array<{ level: number; content: string }> = [];
  for (const line of nonEmpty) {
    const match = line.match(LIST_LINE_RE);
    if (!match) return null;
    const level = indentToLevel(match[1]);
    const content = match[2].trim();
    if (!content) continue;
    items.push({ level, content });
  }

  if (items.length < 2) return null;

  const roots: ParsedPasteNode[] = [];
  const stack: Array<{ level: number; node: ParsedPasteNode }> = [];

  for (const item of items) {
    let level = item.level;

    if (stack.length === 0) {
      level = 0;
    } else {
      const prevLevel = stack[stack.length - 1].level;
      if (level > prevLevel + 1) level = prevLevel + 1;
    }

    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    const node = createPlainNode(item.content);
    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].node.children.push(node);
    }

    stack.push({ level, node });
  }

  return roots;
}

export function parseHtmlBlocks(html: string): ParsedPasteNode[] {
  if (!html || !html.trim()) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const body = doc.body;
  const hasBlock = !!body?.querySelector('p,div,br,ul,ol,li,blockquote,pre,table,h1,h2,h3,h4,h5,h6');

  // Inline-only HTML (e.g. <strong>Bold</strong>) should preserve marks.
  if (body && !hasBlock) {
    const inline = htmlToMarks(body.innerHTML);
    const text = inline.text.trim();
    if (text) {
      return [enrichNodeMetadata({
        name: text,
        marks: inline.marks,
        inlineRefs: inline.inlineRefs,
        children: [],
      })].filter(isMeaningfulNode);
    }
  }

  const parsed = parseHtmlToNodes(html, { maxNodes: 500 });
  if (parsed.nodes.length > 0) {
    return parsed.nodes
      .map(enrichNodeMetadata)
      .filter(isMeaningfulNode);
  }

  const inline = htmlToMarks(html);
  const text = inline.text.trim();
  if (!text) return [];
  return [enrichNodeMetadata({
    name: text,
    marks: inline.marks,
    inlineRefs: inline.inlineRefs,
    children: [],
  })].filter(isMeaningfulNode);
}

function parseFlatLines(lines: string[]): ParsedPasteNode[] {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(createPlainNode);
}

function createPlainNode(text: string): ParsedPasteNode {
  return enrichNodeMetadata({
    name: text,
    marks: [],
    inlineRefs: [],
    children: [],
  });
}

function enrichNodeMetadata(node: ParsedContentNode): ParsedPasteNode {
  const children = node.children
    .map(enrichNodeMetadata)
    .filter(isMeaningfulNode);

  // Keep existing mark offsets safe: only strip tag/field tokens when the node
  // has plain text content (no marks / inline refs).
  if ((node.marks?.length ?? 0) > 0 || (node.inlineRefs?.length ?? 0) > 0) {
    return {
      name: node.name,
      marks: node.marks,
      inlineRefs: node.inlineRefs,
      children,
    };
  }

  const extracted = extractTagAndFields(node.name ?? '');
  return {
    name: extracted.name,
    marks: node.marks,
    inlineRefs: node.inlineRefs,
    children,
    ...(extracted.tags.length > 0 ? { tags: extracted.tags } : {}),
    ...(extracted.fields.length > 0 ? { fields: extracted.fields } : {}),
  };
}

function extractTagAndFields(text: string): {
  name: string;
  tags: string[];
  fields: ParsedPasteField[];
} {
  let working = text;
  const tags: string[] = [];
  const fields: ParsedPasteField[] = [];

  working = working.replace(TAG_RE, (_full, leading: string, tag: string) => {
    tags.push(tag);
    return leading || ' ';
  });

  working = working.replace(FIELD_RE, (_full, leading: string, fieldName: string, value: string) => {
    const normalizedValue = value.trim();
    if (normalizedValue.length > 0) {
      fields.push({ name: fieldName, value: normalizedValue });
    }
    return leading || ' ';
  });

  const dedupedTags = dedupeCaseInsensitive(tags);
  const cleanName = working.replace(/\s+/g, ' ').trim();

  return {
    name: cleanName,
    tags: dedupedTags,
    fields,
  };
}

function dedupeCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function shouldPreferHtml(html: string, plain: string): boolean {
  const trimmed = html.trim();
  if (!trimmed) return false;

  const parser = new DOMParser();
  const doc = parser.parseFromString(trimmed, 'text/html');
  const body = doc.body;
  if (!body || !(body.textContent ?? '').trim()) return false;

  const hasBlockLike = !!body.querySelector('p,div,br,ul,ol,li,blockquote,pre,table,h1,h2,h3,h4,h5,h6');
  const hasInlineFormatting = !!body.querySelector('strong,b,em,i,s,strike,del,code,a,mark');
  if (hasBlockLike || hasInlineFormatting) return true;

  const htmlText = (body.textContent ?? '').replace(/\s+/g, ' ').trim();
  const plainText = plain.replace(/\s+/g, ' ').trim();
  return htmlText.length > 0 && htmlText !== plainText;
}

function indentToLevel(indent: string): number {
  let spaces = 0;
  let tabs = 0;

  for (const ch of indent) {
    if (ch === '\t') tabs += 1;
    else if (ch === ' ') spaces += 1;
  }

  return tabs + Math.floor(spaces / 2);
}

function isMeaningfulNode(node: ParsedPasteNode): boolean {
  return (
    node.name.trim().length > 0
    || node.children.length > 0
    || (node.tags?.length ?? 0) > 0
    || (node.fields?.length ?? 0) > 0
  );
}

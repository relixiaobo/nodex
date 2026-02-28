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
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.+)$/;
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
const TAG_RE = /(^|\s)#([A-Za-z0-9][\w-]*)/g;
const FIELD_RE = /(^|\s)([A-Za-z0-9][\w-]*)::\s*([^#\n]+?)(?=(?:\s+[A-Za-z0-9][\w-]*::)|\s+#|$)/g;

export function parseMultiLinePaste(plain: string, html?: string): ParsedPasteNode[] {
  const rawPlain = plain ?? '';

  if (html && shouldPreferHtml(html, rawPlain)) {
    const htmlNodes = parseHtmlBlocks(html);
    if (htmlNodes.length > 0) return htmlNodes;
  }

  const lines = rawPlain.split(/\r?\n/);
  const markdownNodes = parseMarkdownDocument(lines) ?? parseMarkdownList(lines);
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

function parseMarkdownDocument(lines: string[]): ParsedPasteNode[] | null {
  const normalized = lines.map((line) => line.replace(/\r/g, ''));
  if (!looksLikeMarkdown(normalized)) return null;

  const roots: ParsedPasteNode[] = [];
  const headingStack: Array<{ level: number; node: ParsedPasteNode }> = [];
  const listStack: Array<{ level: number; node: ParsedPasteNode }> = [];

  const appendToCurrentSection = (node: ParsedPasteNode): void => {
    if (listStack.length > 0) {
      listStack[listStack.length - 1].node.children.push(node);
      return;
    }
    if (headingStack.length > 0) {
      headingStack[headingStack.length - 1].node.children.push(node);
      return;
    }
    roots.push(node);
  };

  for (const rawLine of normalized) {
    if (!rawLine.trim()) {
      listStack.length = 0;
      continue;
    }

    const headingMatch = rawLine.match(HEADING_RE);
    if (headingMatch) {
      listStack.length = 0;
      const level = headingMatch[1].length;
      const content = headingMatch[2].trim();
      if (!content) continue;
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }
      const headingNode = createMarkdownNode(content, true);
      if (headingStack.length === 0) {
        roots.push(headingNode);
      } else {
        headingStack[headingStack.length - 1].node.children.push(headingNode);
      }
      headingStack.push({ level, node: headingNode });
      continue;
    }

    if (TABLE_ROW_RE.test(rawLine)) {
      listStack.length = 0;
      if (TABLE_SEPARATOR_RE.test(rawLine)) continue;
      const tableText = rawLine
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim())
        .filter((cell) => cell.length > 0)
        .join(' | ');
      if (!tableText) continue;
      appendToCurrentSection(createMarkdownNode(tableText));
      continue;
    }

    const listMatch = rawLine.match(LIST_LINE_RE);
    if (listMatch) {
      const rawLevel = indentToLevel(listMatch[1]);
      const content = listMatch[2].trim();
      if (!content) continue;

      let level = rawLevel;
      if (listStack.length > 0) {
        const prevLevel = listStack[listStack.length - 1].level;
        if (level > prevLevel + 1) level = prevLevel + 1;
      } else {
        level = 0;
      }

      while (listStack.length > 0 && listStack[listStack.length - 1].level >= level) {
        listStack.pop();
      }

      const listNode = createMarkdownNode(content);
      if (listStack.length === 0) {
        if (headingStack.length > 0) {
          headingStack[headingStack.length - 1].node.children.push(listNode);
        } else {
          roots.push(listNode);
        }
      } else {
        listStack[listStack.length - 1].node.children.push(listNode);
      }
      listStack.push({ level, node: listNode });
      continue;
    }

    listStack.length = 0;
    appendToCurrentSection(createMarkdownNode(rawLine.trim()));
  }

  const meaningful = roots.filter(isMeaningfulNode);
  return meaningful.length > 0 ? meaningful : null;
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

function createMarkdownNode(content: string, asHeading = false): ParsedPasteNode {
  const inline = parseInlineMarkdown(content);
  const marks = [...inline.marks];
  if (asHeading && inline.text.length > 0) {
    marks.push({
      start: 0,
      end: inline.text.length,
      type: 'headingMark',
    });
  }
  return enrichNodeMetadata({
    name: inline.text,
    marks,
    inlineRefs: inline.inlineRefs,
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

function parseInlineMarkdown(content: string): {
  text: string;
  marks: ParsedContentNode['marks'];
  inlineRefs: ParsedContentNode['inlineRefs'];
} {
  const escaped = escapeHtml(content);
  const withLinks = escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
  const withCode = withLinks.replace(/`([^`]+)`/g, '<code>$1</code>');
  const withBold = withCode
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>');
  const withItalic = withBold
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_([^_]+)_/g, '$1<em>$2</em>');
  const withStrike = withItalic.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  return htmlToMarks(withStrike);
}

function looksLikeMarkdown(lines: string[]): boolean {
  let hintCount = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (HEADING_RE.test(trimmed)) hintCount += 1;
    else if (LIST_LINE_RE.test(line)) hintCount += 1;
    else if (TABLE_ROW_RE.test(line)) hintCount += 1;
    else if (/(\*\*[^*]+\*\*)|(`[^`]+`)|(\[[^\]]+\]\(https?:\/\/[^\s)]+\))/.test(trimmed)) hintCount += 1;
    if (hintCount >= 1) return true;
  }
  return false;
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

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;');
}

function isMeaningfulNode(node: ParsedPasteNode): boolean {
  return (
    node.name.trim().length > 0
    || node.children.length > 0
    || (node.tags?.length ?? 0) > 0
    || (node.fields?.length ?? 0) > 0
  );
}

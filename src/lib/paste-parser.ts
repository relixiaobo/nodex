import type { ParsedContentNode } from './html-to-nodes.js';
import { parseHtmlToNodes } from './html-to-nodes.js';
import { htmlToMarks } from './editor-marks.js';
import { logPasteDebug, previewMultiline, summarizePasteNodes } from './paste-debug.js';

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
const FENCED_CODE_RE = /^\s*(```+|~~~+)\s*([A-Za-z0-9_+-]*)\s*$/;
const HORIZONTAL_RULE_RE = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
const TAG_RE = /(^|\s)#([A-Za-z0-9][\w-]*)/g;
const FIELD_RE = /(^|\s)([A-Za-z0-9][\w-]*)::\s*([^#\n]+?)(?=(?:\s+[A-Za-z0-9][\w-]*::)|\s+#|$)/g;

interface ClipboardHtmlAnalysis {
  hasHtml: boolean;
  hasText: boolean;
  hasBlockLike: boolean;
  hasInlineFormatting: boolean;
  hasStyledFormatting: boolean;
  hasSemanticStructure: boolean;
  hasListStructure: boolean;
  isLikelyMarkdownShell: boolean;
  normalizedText: string;
}

export function parseMultiLinePaste(plain: string, html?: string): ParsedPasteNode[] {
  const rawPlain = plain ?? '';
  const normalizedPlain = normalizeClipboardPlain(rawPlain);
  const lines = normalizedPlain.split(/\r?\n/);
  const strongMarkdownSignals = hasStrongMarkdownSignals(normalizedPlain);
  const htmlAnalysis = analyzeClipboardHtml(html);
  const markdownNodes = parseMarkdownDocument(lines) ?? parseMarkdownList(lines);
  const hasMarkdownNodes = !!markdownNodes && markdownNodes.length > 0;
  const debugBase = {
    plainPreview: previewMultiline(rawPlain),
    normalizedPlainPreview: previewMultiline(normalizedPlain),
    htmlPreview: previewMultiline((html ?? '').replace(/\s+/g, ' ').trim(), 8),
    hasMarkdownNodes,
    strongMarkdownSignals,
    htmlSignals: {
      hasBlockLike: htmlAnalysis.hasBlockLike,
      hasInlineFormatting: htmlAnalysis.hasInlineFormatting,
      hasStyledFormatting: htmlAnalysis.hasStyledFormatting,
      hasSemanticStructure: htmlAnalysis.hasSemanticStructure,
      hasListStructure: htmlAnalysis.hasListStructure,
      isLikelyMarkdownShell: htmlAnalysis.isLikelyMarkdownShell,
    },
  };

  if (hasMarkdownNodes && shouldPreferMarkdown(strongMarkdownSignals, htmlAnalysis)) {
    logPasteDebug('parseMultiLinePaste: markdown', {
      ...debugBase,
      reason: 'strong-markdown-signals',
      nodes: summarizePasteNodes(markdownNodes!),
    });
    return markdownNodes!;
  }

  if (htmlAnalysis.hasHtml && shouldPreferHtml(htmlAnalysis, normalizedPlain, strongMarkdownSignals)) {
    const htmlNodes = parseHtmlBlocks(html ?? '');
    if (htmlNodes.length > 0) {
      logPasteDebug('parseMultiLinePaste: html', {
        ...debugBase,
        reason: 'prefer-html',
        nodes: summarizePasteNodes(htmlNodes),
      });
      return htmlNodes;
    }
  }

  if (hasMarkdownNodes) {
    logPasteDebug('parseMultiLinePaste: markdown-fallback', {
      ...debugBase,
      reason: 'html-not-selected',
      nodes: summarizePasteNodes(markdownNodes!),
    });
    return markdownNodes;
  }

  const flat = parseFlatLines(lines);
  logPasteDebug('parseMultiLinePaste: flat', {
    ...debugBase,
    reason: 'no-markdown-or-html-structure',
    nodes: summarizePasteNodes(flat),
  });
  return flat;
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

    const node = createMarkdownNode(item.content);
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
  let codeFenceState: { token: string; language?: string; lines: string[] } | null = null;

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

  const flushCodeFence = (): void => {
    if (!codeFenceState) return;
    appendToCurrentSection(createCodeBlockNode(codeFenceState.lines.join('\n'), codeFenceState.language));
    codeFenceState = null;
  };

  for (const rawLine of normalized) {
    const fenceMatch = rawLine.match(FENCED_CODE_RE);
    if (codeFenceState) {
      if (fenceMatch && isFenceTerminator(codeFenceState.token, fenceMatch[1])) {
        flushCodeFence();
      } else {
        codeFenceState.lines.push(rawLine);
      }
      continue;
    }

    if (fenceMatch) {
      listStack.length = 0;
      codeFenceState = {
        token: fenceMatch[1],
        language: normalizeCodeLanguage(fenceMatch[2]),
        lines: [],
      };
      continue;
    }

    if (!rawLine.trim()) {
      listStack.length = 0;
      continue;
    }

    if (isHorizontalRuleLine(rawLine)) {
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

  flushCodeFence();

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

  const parsed = parseHtmlToNodes(html, {
    maxNodes: 500,
    includeH1: true,
    inferStyledHeadings: true,
    inferParagraphLists: true,
  });
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
    .filter((line) => !isHorizontalRuleLine(line))
    .map((line) => (hasInlineMarkdownSyntax(line) ? createMarkdownNode(line) : createPlainNode(line)));
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

  if (node.type === 'codeBlock') {
    return {
      name: node.name,
      marks: [],
      inlineRefs: [],
      children,
      type: 'codeBlock',
      ...(node.codeLanguage ? { codeLanguage: node.codeLanguage } : {}),
    };
  }

  // Keep existing mark offsets safe: only strip tag/field tokens when the node
  // has plain text content (no marks / inline refs).
  if ((node.marks?.length ?? 0) > 0 || (node.inlineRefs?.length ?? 0) > 0) {
    return {
      name: node.name,
      marks: node.marks,
      inlineRefs: node.inlineRefs,
      children,
      ...(node.type ? { type: node.type } : {}),
      ...(node.codeLanguage ? { codeLanguage: node.codeLanguage } : {}),
    };
  }

  const extracted = extractTagAndFields(node.name ?? '');
  return {
    name: extracted.name,
    marks: node.marks,
    inlineRefs: node.inlineRefs,
    children,
    ...(node.type ? { type: node.type } : {}),
    ...(node.codeLanguage ? { codeLanguage: node.codeLanguage } : {}),
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

function createCodeBlockNode(content: string, language?: string): ParsedPasteNode {
  return {
    name: content,
    marks: [],
    inlineRefs: [],
    children: [],
    type: 'codeBlock',
    ...(language ? { codeLanguage: language } : {}),
  };
}

function looksLikeMarkdown(lines: string[]): boolean {
  let hintCount = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (HEADING_RE.test(trimmed)) hintCount += 1;
    else if (LIST_LINE_RE.test(line)) hintCount += 1;
    else if (FENCED_CODE_RE.test(line)) hintCount += 1;
    else if (HORIZONTAL_RULE_RE.test(line)) hintCount += 1;
    else if (TABLE_ROW_RE.test(line)) hintCount += 1;
    else if (hasInlineMarkdownSyntax(trimmed)) hintCount += 1;
    if (hintCount >= 1) return true;
  }
  return false;
}

function shouldPreferHtml(
  htmlAnalysis: ClipboardHtmlAnalysis,
  plain: string,
  hasStrongMarkdown: boolean,
): boolean {
  if (!htmlAnalysis.hasHtml || !htmlAnalysis.hasText) return false;

  const hasRichHtml =
    htmlAnalysis.hasInlineFormatting
    || htmlAnalysis.hasStyledFormatting
    || htmlAnalysis.hasSemanticStructure;
  if (hasRichHtml) return true;

  if (!hasStrongMarkdown && htmlAnalysis.hasBlockLike) return true;

  const plainText = plain.replace(/\s+/g, ' ').trim();
  return htmlAnalysis.normalizedText.length > 0 && htmlAnalysis.normalizedText !== plainText;
}

function shouldPreferMarkdown(
  hasStrongMarkdown: boolean,
  htmlAnalysis: ClipboardHtmlAnalysis,
): boolean {
  if (!hasStrongMarkdown) return false;
  if (!htmlAnalysis.hasHtml) return true;
  if (!htmlAnalysis.hasText) return true;
  if (htmlAnalysis.isLikelyMarkdownShell) return true;
  return false;
}

function hasStrongMarkdownSignals(text: string): boolean {
  const lines = text.split(/\r?\n/);
  let listLikeCount = 0;
  for (const line of lines) {
    if (FENCED_CODE_RE.test(line)) return true;
    if (HEADING_RE.test(line.trim())) return true;
    if (HORIZONTAL_RULE_RE.test(line)) return true;
    if (TABLE_SEPARATOR_RE.test(line) || TABLE_ROW_RE.test(line)) return true;
    if (/^\s*(?:[-*+]|\d+\.)\s+\S/.test(line)) listLikeCount += 1;
    if (hasInlineMarkdownSyntax(line)) return true;
    if (listLikeCount >= 2) return true;
  }
  return false;
}

function analyzeClipboardHtml(html?: string): ClipboardHtmlAnalysis {
  const trimmed = html?.trim() ?? '';
  if (!trimmed) {
    return {
      hasHtml: false,
      hasText: false,
      hasBlockLike: false,
      hasInlineFormatting: false,
      hasStyledFormatting: false,
      hasSemanticStructure: false,
      hasListStructure: false,
      isLikelyMarkdownShell: false,
      normalizedText: '',
    };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(trimmed, 'text/html');
  const body = doc.body;
  const normalizedText = (body?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const hasText = normalizedText.length > 0;
  const hasBlockLike = !!body?.querySelector('p,div,br,ul,ol,li,blockquote,pre,table,h1,h2,h3,h4,h5,h6');
  const hasInlineFormatting = !!body?.querySelector('strong,b,em,i,s,strike,del,code,a,mark');
  const hasStyledFormatting = !!body?.querySelector(
    '[style*="font-weight"],[style*="font-style"],[style*="text-decoration"],[style*="background"],[style*="font-family"]',
  );
  const hasSemanticStructure = !!body?.querySelector('pre,table,blockquote,h1,h2,h3,h4,h5,h6');
  const hasListStructure = !!body?.querySelector('ul,ol,li');
  const isLikelyMarkdownShell = hasListStructure && !hasInlineFormatting && !hasStyledFormatting && !hasSemanticStructure;

  return {
    hasHtml: true,
    hasText,
    hasBlockLike,
    hasInlineFormatting,
    hasStyledFormatting,
    hasSemanticStructure,
    hasListStructure,
    isLikelyMarkdownShell,
    normalizedText,
  };
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

function isFenceTerminator(openToken: string, closeToken: string): boolean {
  return closeToken[0] === openToken[0] && closeToken.length >= openToken.length;
}

function normalizeCodeLanguage(raw?: string): string | undefined {
  const normalized = raw?.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

function hasInlineMarkdownSyntax(line: string): boolean {
  return /(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)|(~~[^~]+~~)|(`[^`]+`)|(\[[^\]]+\]\(https?:\/\/[^\s)]+\))/.test(line);
}

function isHorizontalRuleLine(line: string): boolean {
  return HORIZONTAL_RULE_RE.test(line.trim());
}

function normalizeClipboardPlain(raw: string): string {
  const lines = raw.split(/\r?\n/).map((line) => line.replace(/\r/g, ''));
  const nonEmpty = lines.filter((line) => line.trim().length > 0);
  if (nonEmpty.length < 2) return lines.join('\n');

  const bulletWrappedCount = nonEmpty.filter((line) => /^\s*[•◦▪‣·]\s+/.test(line)).length;
  if (bulletWrappedCount / nonEmpty.length < 0.6) {
    return lines.join('\n');
  }

  return lines
    .map((line) => line.replace(/^(\s*)[•◦▪‣·]\s+/, '$1'))
    .join('\n');
}

function isMeaningfulNode(node: ParsedPasteNode): boolean {
  return (
    (node.type === 'codeBlock' ? node.name.length > 0 : node.name.trim().length > 0)
    || node.children.length > 0
    || (node.tags?.length ?? 0) > 0
    || (node.fields?.length ?? 0) > 0
  );
}

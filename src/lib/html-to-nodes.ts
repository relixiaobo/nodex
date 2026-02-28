/**
 * HTML → Node Tree parser for web clipping.
 *
 * Converts HTML content (from defuddle) into an intermediate tree structure
 * that can be materialized as Loro child nodes under a clip node.
 *
 * Design:
 * - parseHtmlToNodes: pure function, HTML string → intermediate tree (testable without Loro)
 * - createContentNodes: materializes intermediate tree into Loro nodes (batch + single commit)
 */

import type { TextMark, InlineRefEntry } from '../types/index.js';
import { htmlToMarks } from './editor-marks.js';
import * as loroDoc from './loro-doc.js';

// ============================================================
// Intermediate tree types
// ============================================================

export interface ParsedContentNode {
  /** Plain text content */
  name: string;
  /** Inline formatting marks (bold/italic/link etc.) */
  marks: TextMark[];
  /** Inline references extracted from content */
  inlineRefs: InlineRefEntry[];
  /** Child nodes (heading sections, list items, blockquote children) */
  children: ParsedContentNode[];
  /** Optional structural type for special block rendering. */
  type?: 'codeBlock';
  /** Optional language hint for code blocks (e.g. "ts", "python"). */
  codeLanguage?: string;
}

export interface HtmlToNodesResult {
  /** Top-level parsed nodes */
  nodes: ParsedContentNode[];
  /** Whether output was truncated due to maxNodes limit */
  truncated: boolean;
}

// ============================================================
// Constants
// ============================================================

const DEFAULT_MAX_NODES = 200;
const LIST_INDENT_STEP_PX = 24;
const LIST_MARKER_RE = /^\s*(?:[•◦▪‣·●○■\-*+]|\d+[.)])\s+(.+)$/;

// ============================================================
// parseHtmlToNodes — pure function
// ============================================================

/**
 * Parse an HTML string into an intermediate node tree.
 *
 * Heading-based hierarchy: h2–h6 elements create parent nodes,
 * subsequent block elements become their children until a same-level
 * or higher-level heading is encountered.
 */
export function parseHtmlToNodes(
  html: string,
  options?: {
    maxNodes?: number;
    includeH1?: boolean;
    inferStyledHeadings?: boolean;
    inferParagraphLists?: boolean;
  },
): HtmlToNodesResult {
  if (!html || !html.trim()) {
    return { nodes: [], truncated: false };
  }

  const maxNodes = options?.maxNodes ?? DEFAULT_MAX_NODES;
  const includeH1 = options?.includeH1 ?? false;
  const inferStyledHeadings = options?.inferStyledHeadings ?? false;
  const inferParagraphLists = options?.inferParagraphLists ?? false;
  let nodeCount = 0;
  let truncated = false;

  /** Check if we can create another node. */
  function canCreate(): boolean {
    if (nodeCount >= maxNodes) {
      truncated = true;
      return false;
    }
    return true;
  }

  /** Create a parsed node from text + marks. */
  function makeNode(
    name: string,
    marks: TextMark[] = [],
    inlineRefs: InlineRefEntry[] = [],
    children: ParsedContentNode[] = [],
    options?: { type?: ParsedContentNode['type']; codeLanguage?: string },
  ): ParsedContentNode | null {
    if (!canCreate()) return null;
    nodeCount++;
    return {
      name,
      marks,
      inlineRefs,
      children,
      ...(options?.type ? { type: options.type } : {}),
      ...(options?.codeLanguage ? { codeLanguage: options.codeLanguage } : {}),
    };
  }

  /** Extract text + marks from an element's innerHTML using htmlToMarks. */
  function extractContent(el: Element): { text: string; marks: TextMark[]; inlineRefs: InlineRefEntry[] } {
    return htmlToMarks(el.innerHTML);
  }

  /** Extract text from a text-only element (no child blocks). */
  function extractTextContent(el: Element): { text: string; marks: TextMark[]; inlineRefs: InlineRefEntry[] } {
    // If the element has only inline children, use innerHTML
    const hasBlockChild = Array.from(el.children).some(isBlockElement);
    if (!hasBlockChild) {
      return htmlToMarks(el.outerHTML);
    }
    // If it has block children, just use textContent as fallback
    return { text: el.textContent?.trim() ?? '', marks: [], inlineRefs: [] };
  }

  function trimContent(
    text: string,
    marks: TextMark[],
    inlineRefs: InlineRefEntry[],
  ): { text: string; marks: TextMark[]; inlineRefs: InlineRefEntry[] } {
    const trimmed = text.trim();
    if (!trimmed) return { text: '', marks: [], inlineRefs: [] };

    const leading = text.length - text.trimStart().length;
    const maxLen = trimmed.length;

    const adjustedMarks = marks
      .map((m) => ({
        ...m,
        start: Math.max(0, Math.min(maxLen, m.start - leading)),
        end: Math.max(0, Math.min(maxLen, m.end - leading)),
      }))
      .filter((m) => m.end > m.start);
    const adjustedRefs = inlineRefs
      .map((r) => ({
        ...r,
        offset: r.offset - leading,
      }))
      .filter((r) => r.offset >= 0 && r.offset < maxLen);

    return { text: trimmed, marks: adjustedMarks, inlineRefs: adjustedRefs };
  }

  // Parse the HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  inlineClassStylesFromStyleTags(doc);
  const body = doc.body;

  if (!body) {
    return { nodes: [], truncated: false };
  }

  // Process top-level elements with heading stack
  const result: ParsedContentNode[] = [];

  // Heading stack: each entry represents an open heading section
  // level: heading level (2-6), node: the heading's ParsedContentNode
  interface HeadingFrame {
    level: number;
    node: ParsedContentNode;
  }
  const headingStack: HeadingFrame[] = [];
  interface ListFrame {
    level: number;
    node: ParsedContentNode;
  }
  const listStack: ListFrame[] = [];
  let listBaseIndentPx: number | null = null;

  /** Get target by heading sections only (ignoring list continuation). */
  function getSectionTarget(): ParsedContentNode[] {
    if (headingStack.length === 0) return result;
    return headingStack[headingStack.length - 1].node.children;
  }

  /** Get insertion target (deepest list item first, then heading section, then top-level). */
  function getCurrentTarget(): ParsedContentNode[] {
    if (listStack.length > 0) return listStack[listStack.length - 1].node.children;
    return getSectionTarget();
  }

  function resetListContext(): void {
    listStack.length = 0;
    listBaseIndentPx = null;
  }

  function appendHeadingNode(
    level: number,
    content: { text: string; marks: TextMark[]; inlineRefs: InlineRefEntry[] },
  ): void {
    while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
      headingStack.pop();
    }
    const headingMarks = ensureHeadingMark(content.marks, content.text.length);
    const node = makeNode(content.text, headingMarks, content.inlineRefs);
    if (!node) return;
    getSectionTarget().push(node);
    headingStack.push({ level, node });
  }

  function appendParagraphNode(
    content: { text: string; marks: TextMark[]; inlineRefs: InlineRefEntry[] },
  ): void {
    const node = makeNode(content.text, content.marks, content.inlineRefs);
    if (node) getSectionTarget().push(node);
  }

  function appendListLikeParagraph(
    content: { text: string; marks: TextMark[]; inlineRefs: InlineRefEntry[]; indentPx: number },
  ): boolean {
    let level = 0;
    if (listBaseIndentPx === null) {
      listBaseIndentPx = content.indentPx;
    } else {
      level = Math.max(0, Math.round((content.indentPx - listBaseIndentPx) / LIST_INDENT_STEP_PX));
      if (listStack.length > 0) {
        const prevLevel = listStack[listStack.length - 1].level;
        if (level > prevLevel + 1) level = prevLevel + 1;
      }
    }

    while (listStack.length > 0 && listStack[listStack.length - 1].level >= level) {
      listStack.pop();
    }

    const node = makeNode(content.text, content.marks, content.inlineRefs);
    if (!node) return true;
    if (listStack.length > 0) {
      listStack[listStack.length - 1].node.children.push(node);
    } else {
      getSectionTarget().push(node);
    }
    listStack.push({ level, node });
    return true;
  }

  function processParagraphLike(el: Element): boolean {
    const raw = extractContent(el);
    const trimmed = trimContent(raw.text, raw.marks, raw.inlineRefs);
    if (!trimmed.text) return false;

    if (inferParagraphLists) {
      const listLike = stripListMarker(trimmed, extractIndentPx(el));
      if (listLike) {
        return appendListLikeParagraph(listLike);
      }
    }

    resetListContext();
    if (inferStyledHeadings) {
      const inferredLevel = inferHeadingLevelFromInlineStyle(el, trimmed.text, trimmed.marks);
      if (inferredLevel !== null) {
        appendHeadingNode(inferredLevel, trimmed);
        return true;
      }
    }

    appendParagraphNode(trimmed);
    return true;
  }

  function flushInlineFragments(inlineFragments: string[], contextEl: Element): void {
    if (inlineFragments.length === 0) return;
    const inlineHtml = inlineFragments.join('');
    inlineFragments.length = 0;

    const inline = htmlToMarks(inlineHtml);
    const trimmed = trimContent(inline.text, inline.marks, inline.inlineRefs);
    if (!trimmed.text) return;

    if (inferParagraphLists) {
      const listLike = stripListMarker(trimmed, extractIndentPx(contextEl));
      if (listLike) {
        appendListLikeParagraph(listLike);
        return;
      }
    }

    resetListContext();
    appendParagraphNode(trimmed);
  }

  function processFlowChildren(container: Element): void {
    const inlineFragments: string[] = [];
    for (const child of Array.from(container.childNodes)) {
      if (truncated) break;
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent ?? '';
        if (text.trim()) inlineFragments.push(escapeHtmlText(text));
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;

      const childEl = child as Element;
      const childTag = childEl.tagName.toLowerCase();
      if (isSkippableNonContentTag(childTag)) continue;

      if (childTag === 'br') {
        flushInlineFragments(inlineFragments, container);
        continue;
      }

      if (isBlockElement(childEl)) {
        flushInlineFragments(inlineFragments, container);
        processBlock(childEl);
        continue;
      }

      // Inline wrapper with block children (e.g. Google Docs'
      // <b style="font-weight:normal"> around <p> tags): recurse.
      const hasBlockChild = Array.from(childEl.children).some(isBlockElement);
      if (hasBlockChild) {
        flushInlineFragments(inlineFragments, container);
        processFlowChildren(childEl);
        continue;
      }

      inlineFragments.push(childEl.outerHTML);
    }

    flushInlineFragments(inlineFragments, container);
  }

  /** Process a single block element. */
  function processBlock(el: Element): void {
    if (truncated) return;
    const tag = el.tagName.toLowerCase();

    // Skip non-content tags and media placeholders
    if (isSkippableNonContentTag(tag)) return;

    // Skip hr, figure/img
    if (!includeH1 && tag === 'h1') return;
    if (tag === 'hr') return;
    if (tag === 'figure' || tag === 'img' || tag === 'picture' || tag === 'video' || tag === 'audio' || tag === 'iframe') return;

    // Headings h1–h6: create section parent
    if (/^h[1-6]$/.test(tag)) {
      resetListContext();
      const level = parseInt(tag[1], 10);
      const { text, marks, inlineRefs } = extractContent(el);
      const trimmed = trimContent(text, marks, inlineRefs);
      if (!trimmed.text) return;
      appendHeadingNode(level, trimmed);
      return;
    }

    // Paragraph
    if (tag === 'p') {
      processParagraphLike(el);
      return;
    }

    // Lists: transparent container, process <li> children
    if (tag === 'ul' || tag === 'ol') {
      resetListContext();
      processListItems(el, getSectionTarget());
      return;
    }

    // Blockquote: parent node with recursive children
    if (tag === 'blockquote') {
      resetListContext();
      processBlockquote(el);
      return;
    }

    // Pre/code: single code node
    if (tag === 'pre') {
      resetListContext();
      processPreBlock(el);
      return;
    }

    // Table: each <tr> becomes a node
    if (tag === 'table') {
      resetListContext();
      processTable(el);
      return;
    }

    // Div-like containers: treat inline-only blocks as paragraph-like, else recurse.
    if (tag === 'div' || tag === 'section' || tag === 'article' || tag === 'main' || tag === 'aside' || tag === 'header' || tag === 'footer' || tag === 'nav') {
      const hasBlockChild = Array.from(el.children).some(isBlockElement);
      if (!hasBlockChild) {
        processParagraphLike(el);
        return;
      }
      resetListContext();
      processFlowChildren(el);
      return;
    }

    // Fallback: treat as text content if it has meaningful text
    const text = el.textContent?.trim();
    if (text) {
      const hasBlockChild = Array.from(el.children).some(isBlockElement);
      if (hasBlockChild) {
        resetListContext();
        processFlowChildren(el);
        return;
      }

      const { text: t, marks, inlineRefs } = extractTextContent(el);
      const trimmed = trimContent(t, marks, inlineRefs);
      if (trimmed.text) {
        if (inferParagraphLists) {
          const listLike = stripListMarker(trimmed, extractIndentPx(el));
          if (listLike) {
            appendListLikeParagraph(listLike);
            return;
          }
        }

        resetListContext();
        if (inferStyledHeadings) {
          const inferredLevel = inferHeadingLevelFromInlineStyle(el, trimmed.text, trimmed.marks);
          if (inferredLevel !== null) {
            appendHeadingNode(inferredLevel, trimmed);
            return;
          }
        }
        appendParagraphNode(trimmed);
      }
    }
  }

  /** Process <li> items from a list, handling nested lists. */
  function processListItems(listEl: Element, target: ParsedContentNode[]): void {
    for (const li of Array.from(listEl.children)) {
      if (truncated) return;
      if (li.tagName.toLowerCase() !== 'li') continue;

      // Separate inline content from nested lists
      const nestedLists: Element[] = [];
      const inlineFragments: string[] = [];

      for (const child of Array.from(li.childNodes)) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const childEl = child as Element;
          const childTag = childEl.tagName.toLowerCase();
          if (childTag === 'ul' || childTag === 'ol') {
            nestedLists.push(childEl);
          } else {
            inlineFragments.push(childEl.outerHTML);
          }
        } else if (child.nodeType === Node.TEXT_NODE) {
          const text = child.textContent ?? '';
          if (text.trim()) inlineFragments.push(text);
        }
      }

      const inlineHtml = inlineFragments.join('');
      const { text, marks, inlineRefs } = htmlToMarks(inlineHtml);
      const trimmedText = text.trim();
      if (!trimmedText && nestedLists.length === 0) continue;

      // Adjust marks offsets if text was left-trimmed
      const leadingSpaces = text.length - text.trimStart().length;
      const adjustedMarks = leadingSpaces > 0
        ? marks.map(m => ({
            ...m,
            start: Math.max(0, m.start - leadingSpaces),
            end: Math.max(0, m.end - leadingSpaces),
          })).filter(m => m.end > m.start)
        : marks;
      const adjustedRefs = leadingSpaces > 0
        ? inlineRefs.map(r => ({ ...r, offset: r.offset - leadingSpaces })).filter(r => r.offset >= 0)
        : inlineRefs;

      const liNode = makeNode(trimmedText, adjustedMarks, adjustedRefs);
      if (!liNode) return;
      target.push(liNode);

      // Process nested lists as children of this <li> node
      for (const nestedList of nestedLists) {
        processListItems(nestedList, liNode.children);
      }
    }
  }

  /** Process a blockquote element. */
  function processBlockquote(el: Element): void {
    // Check if blockquote has only inline content (no block children)
    const hasBlockChild = Array.from(el.children).some(isBlockElement);
    if (!hasBlockChild) {
      const { text, marks, inlineRefs } = extractContent(el);
      if (!text.trim()) return;
      const node = makeNode(text, marks, inlineRefs);
      if (node) getCurrentTarget().push(node);
      return;
    }

    // Blockquote with block children: create parent node
    const bqNode = makeNode('');
    if (!bqNode) return;

    // Process block children
    let hasContent = false;
    for (const child of Array.from(el.children)) {
      if (truncated) break;
      const childTag = child.tagName.toLowerCase();
      if (childTag === 'p') {
        const { text, marks, inlineRefs } = extractContent(child);
        if (text.trim()) {
          const pNode = makeNode(text, marks, inlineRefs);
          if (pNode) {
            bqNode.children.push(pNode);
            hasContent = true;
          }
        }
      } else {
        const text = child.textContent?.trim();
        if (text) {
          const { text: t, marks, inlineRefs } = extractTextContent(child);
          if (t.trim()) {
            const node = makeNode(t, marks, inlineRefs);
            if (node) {
              bqNode.children.push(node);
              hasContent = true;
            }
          }
        }
      }
    }

    if (hasContent) {
      // Use first child text as blockquote label if empty
      if (!bqNode.name && bqNode.children.length > 0) {
        const first = bqNode.children.shift()!;
        bqNode.name = first.name;
        bqNode.marks = first.marks;
        bqNode.inlineRefs = first.inlineRefs;
      }
      getCurrentTarget().push(bqNode);
    }
  }

  /** Process a <pre> block (code block). */
  function processPreBlock(el: Element): void {
    const codeEl = el.querySelector('code');
    const text = (codeEl ?? el).textContent ?? '';
    if (!text.trim()) return;
    const codeLanguage = extractCodeLanguage(codeEl ?? el);
    const node = makeNode(text, [], [], [], {
      type: 'codeBlock',
      codeLanguage,
    });
    if (node) getCurrentTarget().push(node);
  }

  /** Process a <table> element. Each <tr> becomes a node with cells joined by |. */
  function processTable(el: Element): void {
    const rows = el.querySelectorAll('tr');
    for (const row of Array.from(rows)) {
      if (truncated) return;
      const cells = Array.from(row.querySelectorAll('td, th'))
        .map(cell => cell.textContent?.trim() ?? '')
        .filter(t => t);
      if (cells.length === 0) continue;
      const text = cells.join(' | ');
      const node = makeNode(text);
      if (node) getCurrentTarget().push(node);
    }
  }

  // Process all top-level children of body
  processFlowChildren(body);

  // If truncated, append a notice node
  if (truncated && canCreate()) {
    // We already hit max, just mark truncated
  }

  return { nodes: result, truncated };
}

// ============================================================
// createContentNodes — Loro materialization
// ============================================================

/**
 * Materialize parsed content nodes as Loro child nodes under a parent.
 *
 * Uses loroDoc.createNode() + setNodeRichTextContent() for batch creation,
 * followed by a single commitDoc().
 *
 * @param parentId - The clip node ID to create children under
 * @param nodes - Parsed intermediate tree from parseHtmlToNodes
 * @param startIndex - Optional index to insert children at (appends by default)
 * @returns Array of created top-level node IDs
 */
export function createContentNodes(
  parentId: string,
  nodes: ParsedContentNode[],
  startIndex?: number,
): string[] {
  if (nodes.length === 0) return [];

  const topIds: string[] = [];

  function createRecursive(
    parent: string,
    items: ParsedContentNode[],
    insertIndex?: number,
  ): void {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const idx = insertIndex !== undefined ? insertIndex + i : undefined;
      const nodeId = loroDoc.createNode(undefined, parent, idx);

      if (parent === parentId) {
        topIds.push(nodeId);
      }

      if (item.type || item.codeLanguage) {
        const batch: Record<string, unknown> = {};
        if (item.type) batch.type = item.type;
        if (item.codeLanguage) batch.codeLanguage = item.codeLanguage;
        loroDoc.setNodeDataBatch(nodeId, batch);
      }

      // Set content
      if (item.name || item.marks.length > 0 || item.inlineRefs.length > 0) {
        loroDoc.setNodeRichTextContent(nodeId, item.name, item.marks, item.inlineRefs);
      }

      // Recurse children
      if (item.children.length > 0) {
        createRecursive(nodeId, item.children);
      }
    }
  }

  createRecursive(parentId, nodes, startIndex);
  loroDoc.commitDoc();

  return topIds;
}

// ============================================================
// Helpers
// ============================================================

/** Check if an element is a block-level element. */
function isBlockElement(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  const semanticBlock = [
    'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'blockquote', 'pre', 'table',
    'section', 'article', 'main', 'aside', 'header', 'footer', 'nav',
    'figure', 'hr',
  ].includes(tag);
  if (semanticBlock) return true;
  return isStyledBlockElement(el);
}

function isSkippableNonContentTag(tag: string): boolean {
  return (
    tag === 'style'
    || tag === 'script'
    || tag === 'noscript'
    || tag === 'template'
    || tag === 'meta'
    || tag === 'link'
    || tag === 'head'
    || tag === 'title'
  );
}

function ensureHeadingMark(marks: TextMark[], textLength: number): TextMark[] {
  const hasFullHeadingMark = marks.some((m) => m.type === 'headingMark' && m.start <= 0 && m.end >= textLength);
  if (hasFullHeadingMark || textLength <= 0) return marks;
  return [
    ...marks,
    {
      start: 0,
      end: textLength,
      type: 'headingMark',
    },
  ];
}

function stripListMarker(
  content: { text: string; marks: TextMark[]; inlineRefs: InlineRefEntry[] },
  indentPx: number,
): { text: string; marks: TextMark[]; inlineRefs: InlineRefEntry[]; indentPx: number } | null {
  const match = content.text.match(LIST_MARKER_RE);
  if (!match) return null;
  const body = match[1]?.trim() ?? '';
  if (!body) return null;

  const prefixLength = content.text.length - body.length;
  const adjustedMarks = content.marks
    .map((m) => ({
      ...m,
      start: Math.max(0, m.start - prefixLength),
      end: Math.max(0, m.end - prefixLength),
    }))
    .filter((m) => m.end > m.start);
  const adjustedRefs = content.inlineRefs
    .map((r) => ({ ...r, offset: r.offset - prefixLength }))
    .filter((r) => r.offset >= 0 && r.offset < body.length);

  return {
    text: body,
    marks: adjustedMarks,
    inlineRefs: adjustedRefs,
    indentPx,
  };
}

function inferHeadingLevelFromInlineStyle(
  el: Element,
  text: string,
  marks: TextMark[],
): number | null {
  if (text.length === 0 || text.length > 96) return null;
  if (LIST_MARKER_RE.test(text)) return null;

  const maxFontPx = getMaxInlineFontSizePx(el);
  const fullLineBold = isFullLineBold(text.length, marks);

  if (maxFontPx >= 30) return 1;
  if (maxFontPx >= 24) return 2;
  if (maxFontPx >= 20) return 3;
  if (maxFontPx >= 17 && fullLineBold) return 4;
  return null;
}

function getMaxInlineFontSizePx(root: Element): number {
  const elements = [root, ...Array.from(root.querySelectorAll('*'))];
  let max = 0;
  for (const el of elements) {
    if (!(el instanceof HTMLElement)) continue;
    const px = parseCssLengthToPx(el.style.fontSize);
    if (px > max) max = px;
  }
  return max;
}

function isFullLineBold(textLength: number, marks: TextMark[]): boolean {
  return marks.some((m) => m.type === 'bold' && m.start <= 0 && m.end >= textLength);
}

function extractIndentPx(el: Element): number {
  if (!(el instanceof HTMLElement)) return 0;
  const style = el.style;
  const marginLeft = parseCssLengthToPx(style.marginLeft || style.marginInlineStart);
  const paddingLeft = parseCssLengthToPx(style.paddingLeft || style.paddingInlineStart);
  const textIndent = Math.max(0, parseCssLengthToPx(style.textIndent));
  return Math.max(0, marginLeft + paddingLeft + textIndent);
}

function parseCssLengthToPx(input?: string | null): number {
  if (!input) return 0;
  const raw = input.trim().toLowerCase();
  if (!raw) return 0;
  const match = raw.match(/^(-?\d+(?:\.\d+)?)(px|pt|rem|em)?$/);
  if (!match) return 0;
  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return 0;
  const unit = match[2] ?? 'px';
  switch (unit) {
    case 'pt':
      return value * (4 / 3);
    case 'rem':
    case 'em':
      return value * 16;
    case 'px':
    default:
      return value;
  }
}

function escapeHtmlText(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;');
}

function isStyledBlockElement(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const display = (el.style.display ?? '').trim().toLowerCase();
  if (display === 'block' || display === 'list-item' || display === 'table' || display === 'flex' || display === 'grid') {
    return true;
  }
  const indentPx = extractIndentPx(el);
  return indentPx > 0;
}

type CssDeclarations = Record<string, string>;

function inlineClassStylesFromStyleTags(doc: Document): void {
  const styleRules = extractClassStyleRules(doc);
  if (styleRules.size === 0) return;

  const elements = Array.from(doc.body?.querySelectorAll('[class]') ?? []);
  for (const el of elements) {
    const classAttr = el.getAttribute('class') ?? '';
    const classNames = classAttr.split(/\s+/).map((c) => c.trim()).filter(Boolean);
    if (classNames.length === 0) continue;

    const merged: CssDeclarations = {};
    for (const className of classNames) {
      const rule = styleRules.get(className);
      if (rule) Object.assign(merged, rule);
    }
    if (Object.keys(merged).length === 0) continue;

    const inline = parseCssDeclarations(el.getAttribute('style') ?? '');
    Object.assign(merged, inline);
    el.setAttribute('style', serializeCssDeclarations(merged));
  }
}

function extractClassStyleRules(doc: Document): Map<string, CssDeclarations> {
  const styleNodes = Array.from(doc.querySelectorAll('style'));
  if (styleNodes.length === 0) return new Map();

  const rules = new Map<string, CssDeclarations>();
  for (const styleNode of styleNodes) {
    const css = (styleNode.textContent ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
    const re = /([^{}]+)\{([^{}]+)\}/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(css)) !== null) {
      const selectors = match[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const decls = parseCssDeclarations(match[2]);
      if (Object.keys(decls).length === 0) continue;

      for (const selector of selectors) {
        const classMatch = selector.match(/^\.(?<name>[A-Za-z0-9_-]+)$/);
        const className = classMatch?.groups?.name;
        if (!className) continue;
        const prev = rules.get(className) ?? {};
        rules.set(className, { ...prev, ...decls });
      }
    }
  }
  return rules;
}

function parseCssDeclarations(block: string): CssDeclarations {
  const entries = block
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);

  const out: CssDeclarations = {};
  for (const entry of entries) {
    const idx = entry.indexOf(':');
    if (idx <= 0) continue;
    const key = entry.slice(0, idx).trim().toLowerCase();
    let value = entry.slice(idx + 1).trim();
    if (!key || !value) continue;
    value = value.replace(/!important/gi, '').trim();
    if (!value) continue;
    out[key] = value;
  }
  return out;
}

function serializeCssDeclarations(decls: CssDeclarations): string {
  return Object.entries(decls)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
}

function extractCodeLanguage(el: Element): string | undefined {
  const direct = el.getAttribute('data-language') ?? el.getAttribute('data-lang');
  if (direct?.trim()) return direct.trim().toLowerCase();

  const className = el.getAttribute('class') ?? '';
  const match = className.match(/(?:^|\s)(?:language|lang)-([A-Za-z0-9_+-]+)(?:\s|$)/);
  if (match?.[1]) return match[1].toLowerCase();

  return undefined;
}

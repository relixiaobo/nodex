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
  options?: { maxNodes?: number },
): HtmlToNodesResult {
  if (!html || !html.trim()) {
    return { nodes: [], truncated: false };
  }

  const maxNodes = options?.maxNodes ?? DEFAULT_MAX_NODES;
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
  ): ParsedContentNode | null {
    if (!canCreate()) return null;
    nodeCount++;
    return { name, marks, inlineRefs, children };
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
      return htmlToMarks(el.innerHTML);
    }
    // If it has block children, just use textContent as fallback
    return { text: el.textContent?.trim() ?? '', marks: [], inlineRefs: [] };
  }

  // Parse the HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
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

  /** Get the current insertion target (deepest heading section or top-level). */
  function getCurrentTarget(): ParsedContentNode[] {
    if (headingStack.length === 0) return result;
    return headingStack[headingStack.length - 1].node.children;
  }

  /** Process a single block element. */
  function processBlock(el: Element): void {
    if (truncated) return;
    const tag = el.tagName.toLowerCase();

    // Skip h1 (duplicates clip title), hr, figure/img
    if (tag === 'h1' || tag === 'hr') return;
    if (tag === 'figure' || tag === 'img' || tag === 'picture' || tag === 'video' || tag === 'audio' || tag === 'iframe') return;

    // Headings h2–h6: create section parent
    if (/^h[2-6]$/.test(tag)) {
      const level = parseInt(tag[1], 10);
      // Pop heading stack until we find a lower level (higher priority heading)
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }
      const { text, marks, inlineRefs } = extractContent(el);
      if (!text.trim()) return;
      const node = makeNode(text, marks, inlineRefs);
      if (!node) return;
      getCurrentTarget().push(node);
      headingStack.push({ level, node });
      return;
    }

    // Paragraph
    if (tag === 'p') {
      const { text, marks, inlineRefs } = extractContent(el);
      if (!text.trim()) return;
      const node = makeNode(text, marks, inlineRefs);
      if (node) getCurrentTarget().push(node);
      return;
    }

    // Lists: transparent container, process <li> children
    if (tag === 'ul' || tag === 'ol') {
      processListItems(el, getCurrentTarget());
      return;
    }

    // Blockquote: parent node with recursive children
    if (tag === 'blockquote') {
      processBlockquote(el);
      return;
    }

    // Pre/code: single code node
    if (tag === 'pre') {
      processPreBlock(el);
      return;
    }

    // Table: each <tr> becomes a node
    if (tag === 'table') {
      processTable(el);
      return;
    }

    // Div: transparent container, recurse into children
    if (tag === 'div' || tag === 'section' || tag === 'article' || tag === 'main' || tag === 'aside' || tag === 'header' || tag === 'footer' || tag === 'nav') {
      for (const child of Array.from(el.children)) {
        processBlock(child);
      }
      return;
    }

    // Fallback: treat as text content if it has meaningful text
    const text = el.textContent?.trim();
    if (text) {
      const { text: t, marks, inlineRefs } = extractTextContent(el);
      if (t.trim()) {
        const node = makeNode(t, marks, inlineRefs);
        if (node) getCurrentTarget().push(node);
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
    const node = makeNode(text, [{ start: 0, end: text.length, type: 'code' }]);
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
  for (const child of Array.from(body.children)) {
    if (truncated) break;
    processBlock(child);
  }

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
  return [
    'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'blockquote', 'pre', 'table',
    'section', 'article', 'main', 'aside', 'header', 'footer', 'nav',
    'figure', 'hr',
  ].includes(tag);
}

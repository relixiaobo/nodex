/**
 * Anchor utilities — pure functions for computing highlight anchor data.
 *
 * Generates XPath, CSS selector, text offset, and prefix/exact/suffix
 * from a DOM Range. Used by Content Script to create HighlightAnchor.
 */
import type { HighlightAnchor } from '../../lib/highlight-anchor.js';

/** Default context length for prefix/suffix (in characters). */
const CONTEXT_LENGTH = 32;

// ── XPath Generation ──

/**
 * Generate an XPath expression for a DOM node.
 * Prioritizes elements with `id` attributes for shorter, more stable paths.
 *
 * For text nodes, returns the path to the parent element + /text()[n].
 */
export function getXPath(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const parent = node.parentNode;
    if (!parent) return '';
    const parentPath = getXPath(parent);
    const textIndex = getTextNodeIndex(node);
    return `${parentPath}/text()[${textIndex}]`;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as Element;

  // ID-based shortcut (most stable)
  if (el.id) {
    return `//*[@id="${el.id}"]`;
  }

  // Build path from root
  const parent = el.parentNode;
  if (!parent || parent.nodeType === Node.DOCUMENT_NODE) {
    return `/${el.tagName.toLowerCase()}`;
  }

  const parentPath = getXPath(parent);
  const tagName = el.tagName.toLowerCase();
  const siblings = Array.from(parent.childNodes).filter(
    (n): n is Element =>
      n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName === el.tagName,
  );

  if (siblings.length === 1) {
    return `${parentPath}/${tagName}`;
  }

  const index = siblings.indexOf(el) + 1;
  return `${parentPath}/${tagName}[${index}]`;
}

/**
 * Get the 1-based index of a text node among its parent's text node children.
 */
function getTextNodeIndex(textNode: Node): number {
  let index = 0;
  let sibling: Node | null = textNode.parentNode?.firstChild ?? null;
  while (sibling) {
    if (sibling.nodeType === Node.TEXT_NODE) {
      index++;
      if (sibling === textNode) return index;
    }
    sibling = sibling.nextSibling;
  }
  return index;
}

// ── CSS Selector Generation ──

/**
 * Generate a CSS selector for an element.
 * Prioritizes id, then builds a path using tag names and nth-child.
 */
export function getCssSelector(element: Element): string {
  // ID shortcut
  if (element.id) {
    return `#${CSS.escape(element.id)}`;
  }

  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.documentElement) {
    // If we find an ancestor with id, use it as the base
    if (current.id) {
      parts.unshift(`#${CSS.escape(current.id)}`);
      break;
    }

    const tagName = current.tagName.toLowerCase();
    const parentEl: Element | null = current.parentElement;

    if (!parentEl) {
      parts.unshift(tagName);
      break;
    }

    const siblings = Array.from(parentEl.children).filter(
      (c: Element) => c.tagName === current!.tagName,
    );

    if (siblings.length === 1) {
      parts.unshift(tagName);
    } else {
      const index = Array.from(parentEl.children).indexOf(current) + 1;
      parts.unshift(`${tagName}:nth-child(${index})`);
    }

    current = parentEl;
  }

  return parts.join(' > ');
}

// ── Text Offset Calculation ──

/**
 * Calculate the character offset of a position (node + offset) relative
 * to a root element's textContent.
 *
 * Walks the DOM tree in document order, summing text node lengths
 * until reaching the target node.
 */
export function getTextOffset(
  root: Node,
  targetNode: Node,
  targetOffset: number,
): number {
  let charCount = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  let current = walker.nextNode();
  while (current) {
    if (current === targetNode) {
      return charCount + targetOffset;
    }
    charCount += (current.textContent?.length ?? 0);
    current = walker.nextNode();
  }

  // If targetNode is an element, count characters of child text nodes up to targetOffset
  if (targetNode.nodeType === Node.ELEMENT_NODE) {
    let counted = 0;
    const children = Array.from(targetNode.childNodes);
    for (let i = 0; i < Math.min(targetOffset, children.length); i++) {
      counted += (children[i].textContent?.length ?? 0);
    }
    // Walk from root to find the absolute offset to the start of targetNode
    const walker2 = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let absOffset = 0;
    let node2 = walker2.nextNode();
    while (node2) {
      if (targetNode.contains(node2)) {
        return absOffset + counted;
      }
      absOffset += (node2.textContent?.length ?? 0);
      node2 = walker2.nextNode();
    }
  }

  return charCount;
}

// ── Prefix / Exact / Suffix Extraction ──

/**
 * Extract prefix and suffix context around a selection, using the
 * page's body.textContent.
 *
 * Returns { prefix, suffix } with ~CONTEXT_LENGTH characters each.
 */
export function getTextContext(
  exact: string,
  root?: Node,
): { prefix: string; suffix: string } {
  const textContent = (root ?? document.body).textContent ?? '';
  const exactStart = textContent.indexOf(exact);

  if (exactStart === -1) {
    return { prefix: '', suffix: '' };
  }

  const prefix = textContent.slice(
    Math.max(0, exactStart - CONTEXT_LENGTH),
    exactStart,
  );
  const suffix = textContent.slice(
    exactStart + exact.length,
    exactStart + exact.length + CONTEXT_LENGTH,
  );

  return { prefix, suffix };
}

// ── Main Anchor Computation ──

/**
 * Compute a full HighlightAnchor from a DOM Range.
 *
 * Computes all three selector types (XPath, TextPosition, TextQuote)
 * plus a CSS selector for the common ancestor container.
 */
export function computeAnchor(range: Range): HighlightAnchor {
  const exact = range.toString();

  // TextQuoteSelector: prefix + exact + suffix
  const { prefix, suffix } = getTextContext(exact);

  // RangeSelector: XPath + offsets
  const rangeData = {
    startXPath: getXPath(range.startContainer),
    startOffset: range.startOffset,
    endXPath: getXPath(range.endContainer),
    endOffset: range.endOffset,
  };

  // TextPositionSelector: character offsets relative to body
  const textPosition = {
    start: getTextOffset(document.body, range.startContainer, range.startOffset),
    end: getTextOffset(document.body, range.endContainer, range.endOffset),
  };

  // CssSelector: nearest identifiable ancestor element
  const commonAncestor = range.commonAncestorContainer;
  const element =
    commonAncestor.nodeType === Node.ELEMENT_NODE
      ? (commonAncestor as Element)
      : commonAncestor.parentElement;
  const cssSelector = element ? getCssSelector(element) : undefined;

  return {
    version: 1,
    exact,
    prefix,
    suffix,
    cssSelector,
    range: rangeData,
    textPosition,
  };
}

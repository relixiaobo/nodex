/**
 * Highlight restore (echo/replay) — four-step anchor resolution
 * to re-render highlights when revisiting a page.
 *
 * Strategy (from fastest/most fragile to slowest/most reliable):
 * 1. XPath Range — reconstruct DOM Range from saved XPaths
 * 2. TextPosition — use character offsets from body.textContent
 * 3. CSS + exact search — find exact text within CSS container
 * 4. Fuzzy search — prefix + exact + suffix sliding window
 */
import type { HighlightAnchor } from '../../lib/highlight-anchor.js';
import type {
  HighlightRestoreItem,
  HighlightRestorePayload,
} from '../../lib/highlight-messaging.js';
import {
  HIGHLIGHT_UNRESOLVABLE,
  type HighlightUnresolvablePayload,
} from '../../lib/highlight-messaging.js';
import { renderHighlight } from './highlight.js';

// ── Step 1: XPath Range Resolution ──

/**
 * Resolve an XPath expression to a DOM node.
 */
function resolveXPath(xpath: string): Node | null {
  try {
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    );
    return result.singleNodeValue;
  } catch {
    return null;
  }
}

/**
 * Try to restore a Range from XPath selectors.
 * Verifies that the resolved text matches the expected exact text.
 */
function tryXPathRange(anchor: HighlightAnchor): Range | null {
  if (!anchor.range) return null;

  const startNode = resolveXPath(anchor.range.startXPath);
  const endNode = resolveXPath(anchor.range.endXPath);

  if (!startNode || !endNode) return null;

  try {
    const range = document.createRange();
    range.setStart(startNode, anchor.range.startOffset);
    range.setEnd(endNode, anchor.range.endOffset);

    // Verify text matches
    if (range.toString() === anchor.exact) {
      return range;
    }
  } catch {
    // Invalid offsets or node structure changed
  }

  return null;
}

// ── Step 2: TextPosition Resolution ──

/**
 * Try to restore a Range from character offsets in body.textContent.
 */
function tryTextPosition(anchor: HighlightAnchor): Range | null {
  if (!anchor.textPosition) return null;

  const { start, end } = anchor.textPosition;

  try {
    const range = createRangeFromTextOffsets(document.body, start, end);
    if (!range) return null;

    // Verify text matches
    if (range.toString() === anchor.exact) {
      return range;
    }
  } catch {
    // Offsets out of bounds
  }

  return null;
}

/**
 * Create a DOM Range from character offsets relative to a root element.
 */
function createRangeFromTextOffsets(
  root: Node,
  startOffset: number,
  endOffset: number,
): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let charCount = 0;
  let startNode: Text | null = null;
  let startNodeOffset = 0;
  let endNode: Text | null = null;
  let endNodeOffset = 0;

  let current = walker.nextNode() as Text | null;
  while (current) {
    const len = current.textContent?.length ?? 0;

    if (!startNode && charCount + len > startOffset) {
      startNode = current;
      startNodeOffset = startOffset - charCount;
    }

    if (charCount + len >= endOffset) {
      endNode = current;
      endNodeOffset = endOffset - charCount;
      break;
    }

    charCount += len;
    current = walker.nextNode() as Text | null;
  }

  if (!startNode || !endNode) return null;

  const range = document.createRange();
  range.setStart(startNode, startNodeOffset);
  range.setEnd(endNode, endNodeOffset);
  return range;
}

// ── Step 3: CSS + Exact Text Search ──

/**
 * Try to find exact text within a CSS-selected container element.
 */
function tryCssExactSearch(anchor: HighlightAnchor): Range | null {
  if (!anchor.cssSelector) return null;

  try {
    const container = document.querySelector(anchor.cssSelector);
    if (!container) return null;

    return findExactTextInElement(container, anchor.exact);
  } catch {
    return null;
  }
}

/**
 * Find exact text within an element and return a Range covering it.
 */
export function findExactTextInElement(
  element: Element | Node,
  exact: string,
): Range | null {
  const textContent = element.textContent ?? '';
  const index = textContent.indexOf(exact);
  if (index === -1) return null;

  return createRangeFromTextOffsets(element, index, index + exact.length);
}

// ── Step 4: Fuzzy Search (Sliding Window) ──

/**
 * Fuzzy search using prefix + exact + suffix as context.
 * Searches the full document text with a sliding window approach.
 */
function tryFuzzySearch(anchor: HighlightAnchor): Range | null {
  const bodyText = document.body.textContent ?? '';
  if (!bodyText) return null;

  const { prefix, exact, suffix } = anchor;
  const searchPattern = prefix + exact + suffix;

  if (!searchPattern) return null;

  // Try exact match of the full pattern first
  let patternIndex = bodyText.indexOf(searchPattern);
  if (patternIndex !== -1) {
    const exactStart = patternIndex + prefix.length;
    const exactEnd = exactStart + exact.length;
    return createRangeFromTextOffsets(document.body, exactStart, exactEnd);
  }

  // Sliding window: search for exact text with prefix/suffix context scoring
  const candidates: Array<{ index: number; score: number }> = [];
  let searchFrom = 0;

  while (true) {
    const idx = bodyText.indexOf(exact, searchFrom);
    if (idx === -1) break;

    let score = 0;

    // Score prefix match
    if (prefix) {
      const actualPrefix = bodyText.slice(Math.max(0, idx - prefix.length), idx);
      score += computeSimilarity(prefix, actualPrefix);
    }

    // Score suffix match
    if (suffix) {
      const actualSuffix = bodyText.slice(
        idx + exact.length,
        idx + exact.length + suffix.length,
      );
      score += computeSimilarity(suffix, actualSuffix);
    }

    candidates.push({ index: idx, score });
    searchFrom = idx + 1;
  }

  if (candidates.length === 0) return null;

  // Pick the candidate with the highest context match score
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  return createRangeFromTextOffsets(
    document.body,
    best.index,
    best.index + exact.length,
  );
}

/**
 * Simple string similarity: ratio of matching characters at each position.
 * Returns a score from 0 (no match) to 1 (exact match).
 */
export function computeSimilarity(expected: string, actual: string): number {
  if (!expected || !actual) return 0;
  const len = Math.min(expected.length, actual.length);
  if (len === 0) return 0;

  let matches = 0;
  for (let i = 0; i < len; i++) {
    if (expected[i] === actual[i]) matches++;
  }

  return matches / Math.max(expected.length, actual.length);
}

// ── Main Restore Function ──

/**
 * Attempt to restore a highlight anchor to a DOM Range.
 * Tries four strategies in order of speed/fragility.
 */
export function restoreAnchor(anchor: HighlightAnchor): Range | null {
  // Step 1: XPath Range
  const xpathRange = tryXPathRange(anchor);
  if (xpathRange) return xpathRange;

  // Step 2: TextPosition
  const textPosRange = tryTextPosition(anchor);
  if (textPosRange) return textPosRange;

  // Step 3: CSS + Exact Search
  const cssRange = tryCssExactSearch(anchor);
  if (cssRange) return cssRange;

  // Step 4: Fuzzy Search
  const fuzzyRange = tryFuzzySearch(anchor);
  if (fuzzyRange) return fuzzyRange;

  return null;
}

/**
 * Restore multiple highlights on the current page.
 * Renders successful highlights and reports unresolvable ones.
 */
export function restoreHighlights(payload: HighlightRestorePayload): void {
  const unresolvable: string[] = [];

  for (const item of payload.highlights) {
    const range = restoreAnchor(item.anchor);
    if (range) {
      renderHighlight(range, item.id, item.color);
    } else {
      unresolvable.push(item.id);
    }
  }

  // Report unresolvable highlights to Side Panel
  if (unresolvable.length > 0) {
    const msg: {
      type: typeof HIGHLIGHT_UNRESOLVABLE;
      payload: HighlightUnresolvablePayload;
    } = {
      type: HIGHLIGHT_UNRESOLVABLE,
      payload: { ids: unresolvable },
    };
    chrome.runtime.sendMessage(msg);
  }
}

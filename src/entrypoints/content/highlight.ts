/**
 * Content Script highlight core — selection listener, DOM rendering,
 * and click handling for webpage highlights.
 *
 * Listens for text selection → shows floating toolbar → on confirm,
 * wraps text in <soma-hl> custom elements and sends create message
 * to the Side Panel via background.
 */
import { computeAnchor } from './anchor-utils.js';
import { showToolbar, hideToolbar } from './highlight-toolbar.js';
import {
  HIGHLIGHT_CREATE,
  HIGHLIGHT_CLICK,
  type HighlightCreatePayload,
  type HighlightClickPayload,
} from '../../lib/highlight-messaging.js';
import { WEBCLIP_CAPTURE_ACTIVE_TAB } from '../../lib/webclip-messaging.js';

// ── Highlight Color Map ──

export const HIGHLIGHT_COLORS: Record<string, string> = {
  yellow: 'rgba(255, 235, 59, 0.35)',
  green: 'rgba(129, 199, 132, 0.35)',
  blue: 'rgba(100, 181, 246, 0.35)',
  pink: 'rgba(244, 143, 177, 0.35)',
  purple: 'rgba(186, 104, 200, 0.35)',
};

export const DEFAULT_HIGHLIGHT_COLOR = 'yellow';

// ── State ──

let currentRange: Range | null = null;
let initialized = false;

// ── Custom Element Registration ──

/**
 * Register <soma-hl> custom element if not already defined.
 * Uses inline styles only — no Shadow DOM needed for simple highlighting.
 */
function ensureCustomElement(): void {
  if (customElements.get('soma-hl')) return;

  class SomaHighlight extends HTMLElement {
    constructor() {
      super();
      // Inline element — should not break text flow
      this.style.display = 'inline';
      this.style.cursor = 'pointer';
      this.style.borderRadius = '2px';

      this.addEventListener('click', (e) => {
        e.stopPropagation();
        const highlightId = this.getAttribute('data-highlight-id');
        if (!highlightId) return;

        const msg: { type: typeof HIGHLIGHT_CLICK; payload: HighlightClickPayload } = {
          type: HIGHLIGHT_CLICK,
          payload: { id: highlightId },
        };
        chrome.runtime.sendMessage(msg);
      });
    }
  }

  customElements.define('soma-hl', SomaHighlight);
}

// ── Text Node Iteration for Cross-Element Wrapping ──

interface TextNodeSegment {
  node: Text;
  startOffset: number;
  endOffset: number;
}

/**
 * Get all text node segments within a Range.
 * Handles cross-element selections by iterating through text nodes.
 */
function getTextNodesInRange(range: Range): TextNodeSegment[] {
  const segments: TextNodeSegment[] = [];
  const walker = document.createTreeWalker(
    range.commonAncestorContainer,
    NodeFilter.SHOW_TEXT,
  );

  let node = walker.nextNode() as Text | null;
  let foundStart = false;

  while (node) {
    if (node === range.startContainer) {
      foundStart = true;
      if (node === range.endContainer) {
        // Selection within a single text node
        segments.push({
          node,
          startOffset: range.startOffset,
          endOffset: range.endOffset,
        });
        break;
      }
      segments.push({
        node,
        startOffset: range.startOffset,
        endOffset: node.length,
      });
    } else if (foundStart) {
      if (node === range.endContainer) {
        segments.push({
          node,
          startOffset: 0,
          endOffset: range.endOffset,
        });
        break;
      }
      segments.push({
        node,
        startOffset: 0,
        endOffset: node.length,
      });
    }

    node = walker.nextNode() as Text | null;
  }

  return segments;
}

// ── Highlight DOM Rendering ──

/**
 * Render a highlight by wrapping text nodes in <soma-hl> elements.
 * Handles cross-element selections by splitting text nodes.
 */
export function renderHighlight(
  range: Range,
  highlightId: string,
  color: string = DEFAULT_HIGHLIGHT_COLOR,
): void {
  ensureCustomElement();

  const bgColor = HIGHLIGHT_COLORS[color] ?? HIGHLIGHT_COLORS[DEFAULT_HIGHLIGHT_COLOR];
  const segments = getTextNodesInRange(range);

  // Process segments in reverse to maintain valid offsets
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    // Skip empty segments
    if (seg.startOffset === seg.endOffset) continue;

    const wrappedRange = document.createRange();
    wrappedRange.setStart(seg.node, seg.startOffset);
    wrappedRange.setEnd(seg.node, seg.endOffset);

    const highlightEl = document.createElement('soma-hl');
    highlightEl.setAttribute('data-highlight-id', highlightId);
    highlightEl.style.backgroundColor = bgColor;

    try {
      wrappedRange.surroundContents(highlightEl);
    } catch {
      // surroundContents fails if range crosses element boundaries on a single node.
      // Extract and re-insert as fallback.
      const fragment = wrappedRange.extractContents();
      highlightEl.appendChild(fragment);
      wrappedRange.insertNode(highlightEl);
    }
  }
}

/**
 * Remove a highlight's DOM rendering by unwrapping <soma-hl> elements.
 */
export function removeHighlightRendering(highlightId: string): void {
  const elements = document.querySelectorAll(
    `soma-hl[data-highlight-id="${highlightId}"]`,
  );
  elements.forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    // Move all children out of the highlight element
    while (el.firstChild) {
      parent.insertBefore(el.firstChild, el);
    }
    parent.removeChild(el);
    // Normalize to merge adjacent text nodes
    parent.normalize();
  });
}

// ── Flash Animation ──

/**
 * Flash a highlight to draw attention (e.g., when scrolling to it).
 */
export function flashHighlight(highlightId: string): void {
  const elements = document.querySelectorAll(
    `soma-hl[data-highlight-id="${highlightId}"]`,
  );
  elements.forEach((el) => {
    const htmlEl = el as HTMLElement;
    const originalBg = htmlEl.style.backgroundColor;
    htmlEl.style.transition = 'background-color 0.3s ease';
    htmlEl.style.backgroundColor = 'rgba(255, 165, 0, 0.6)';
    setTimeout(() => {
      htmlEl.style.backgroundColor = originalBg;
      setTimeout(() => {
        htmlEl.style.transition = '';
      }, 300);
    }, 600);
  });
}

/**
 * Scroll to a highlight element and flash it.
 */
export function scrollToHighlight(highlightId: string): void {
  const el = document.querySelector(
    `soma-hl[data-highlight-id="${highlightId}"]`,
  );
  if (!el) return;

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // Flash after scroll completes
  setTimeout(() => flashHighlight(highlightId), 400);
}

// ── Selection Handling ──

/**
 * Validate that a selection is suitable for highlighting.
 */
function isValidSelection(selection: Selection): boolean {
  if (selection.isCollapsed) return false;
  if (!selection.rangeCount) return false;

  const text = selection.toString().trim();
  if (!text) return false;

  // Don't highlight inside our own injected elements
  const anchorNode = selection.anchorNode;
  if (anchorNode) {
    const ancestor =
      anchorNode.nodeType === Node.ELEMENT_NODE
        ? (anchorNode as Element)
        : anchorNode.parentElement;
    if (ancestor?.closest('soma-toolbar, soma-hl')) return false;
  }

  return true;
}

/**
 * Handle text selection — show floating toolbar on valid selection.
 */
function handleSelectionChange(): void {
  const selection = window.getSelection();
  if (!selection || !isValidSelection(selection)) {
    hideToolbar();
    currentRange = null;
    return;
  }

  currentRange = selection.getRangeAt(0).cloneRange();
  const rect = currentRange.getBoundingClientRect();
  showToolbar(rect, handleToolbarAction);
}

// ── Toolbar Action Handling ──

/**
 * Handle actions from the floating toolbar.
 */
function handleToolbarAction(action: string): void {
  if (!currentRange) return;

  const selection = window.getSelection();

  switch (action) {
    case 'highlight':
      createHighlight(currentRange, false);
      break;
    case 'note':
      createHighlight(currentRange, true);
      break;
    case 'clip':
      // Delegate to existing webclip capture
      chrome.runtime.sendMessage({ type: WEBCLIP_CAPTURE_ACTIVE_TAB });
      break;
  }

  // Clear selection after action
  selection?.removeAllRanges();
  hideToolbar();
  currentRange = null;
}

/**
 * Create a highlight from the current range.
 * Computes anchor, renders DOM highlight, and sends message to Side Panel.
 */
function createHighlight(range: Range, withNote: boolean): void {
  const anchor = computeAnchor(range);
  const selectedText = range.toString();
  const color = DEFAULT_HIGHLIGHT_COLOR;

  // Generate a temporary ID for immediate rendering
  // The Side Panel will assign the real node ID and send it back
  const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // Render highlight immediately for instant visual feedback
  renderHighlight(range, tempId, color);

  // Send create message to Side Panel via background
  const payload: HighlightCreatePayload = {
    anchor,
    selectedText,
    pageUrl: location.href,
    pageTitle: document.title,
    color,
    withNote,
  };

  const msg: { type: typeof HIGHLIGHT_CREATE; payload: HighlightCreatePayload } = {
    type: HIGHLIGHT_CREATE,
    payload,
  };

  chrome.runtime.sendMessage(msg, (response) => {
    if (chrome.runtime.lastError) {
      // If message fails, remove the temporary highlight
      removeHighlightRendering(tempId);
      console.warn('[soma] Failed to create highlight:', chrome.runtime.lastError.message);
      return;
    }

    // Replace temp ID with real node ID from response
    if (response?.nodeId) {
      const elements = document.querySelectorAll(
        `soma-hl[data-highlight-id="${tempId}"]`,
      );
      elements.forEach((el) => {
        el.setAttribute('data-highlight-id', response.nodeId);
      });
    }
  });
}

// ── Initialization ──

/**
 * Initialize the highlight module.
 * Sets up selection listener and message handlers.
 * Safe to call multiple times (idempotent).
 */
export function initHighlight(): void {
  if (initialized) return;
  initialized = true;

  ensureCustomElement();

  // Debounced mouseup/touchend → check selection
  let selectionTimeout: ReturnType<typeof setTimeout> | null = null;

  const onSelectionEvent = () => {
    if (selectionTimeout) clearTimeout(selectionTimeout);
    selectionTimeout = setTimeout(handleSelectionChange, 10);
  };

  document.addEventListener('mouseup', onSelectionEvent);
  document.addEventListener('touchend', onSelectionEvent);

  // Dismiss toolbar on scroll/resize
  const dismissToolbar = () => {
    hideToolbar();
  };
  window.addEventListener('scroll', dismissToolbar, { passive: true });
  window.addEventListener('resize', dismissToolbar, { passive: true });
}

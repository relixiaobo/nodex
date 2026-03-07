/**
 * Content Script highlight core — selection listener, DOM rendering,
 * and dot-based note interaction for webpage highlights.
 *
 * Zero-friction highlight model:
 * - valid text selection => show floating Highlight button
 * - click button => immediately save bare #highlight + open optional note popover
 * - user writes note + saves => wrap bare highlight with #note (via reference)
 * - cancel/empty note => highlight already saved, stays as bare #highlight
 *
 * Dot marker interaction:
 * - all highlights show a small dot at the end (filled = has note, hollow = bare)
 * - dot click => open note popover inline (add/edit/delete note)
 * - highlight text clicks pass through to original elements (links, etc.)
 */
import { computeAnchor } from './anchor-utils.js';
import {
  showToolbar,
  hideToolbar,
  showNotePopover,
  hideNotePopover,
  hideAllHighlightOverlays,
  isHighlightOverlayHost,
  type ToolbarAction,
  type NoteEntry,
} from './highlight-toolbar.js';
import {
  HIGHLIGHT_CREATE,
  HIGHLIGHT_DELETE,
  HIGHLIGHT_NOTES_SAVE,
  HIGHLIGHT_NOTE_GET,
  HIGHLIGHT_CHECK_URL_REQUEST,
  type HighlightCreatePayload,
  type HighlightDeletePayload,
  type HighlightNotesSavePayload,
  type HighlightNoteGetPayload,
  type HighlightCheckUrlRequestPayload,
} from '../../lib/highlight-messaging.js';
import { WEBCLIP_CAPTURE_ACTIVE_TAB } from '../../lib/webclip-messaging.js';

// ── Default Highlight Color (Harvest Yellow from tag-colors palette) ──

/** Harvest Yellow (#8B8422) for webpage highlight underline. */
export const DEFAULT_HIGHLIGHT_BG = '#8B8422';

/** Soft Banana fill for webpage highlight background (matches side-panel <mark>). */
const HIGHLIGHT_FILL_COLOR = 'rgba(247, 236, 139, 0.6)';

const DOT_SELECTOR = '[data-soma-dot]';

interface HighlightRenderOptions {
  hasNote?: boolean;
}

interface HighlightDraft {
  tempId: string;
  payloadBase: Omit<HighlightCreatePayload, 'noteEntries'>;
  /** Real highlight node ID, assigned after SP responds. */
  finalId?: string;
}

// ── State ──

let currentRange: Range | null = null;
let initialized = false;
let lastKnownUrl = '';
let pendingNoteDraft: HighlightDraft | null = null;
let pendingExistingHighlightNoteId: string | null = null;
/** Tracks highlight ID when user's selection overlaps an existing highlight. */
let selectedExistingHighlightId: string | null = null;

/**
 * Compute the bounding box of all elements with the given highlight ID.
 */
function computeGroupBoundingRect(id: string): DOMRect | null {
  const elements = document.querySelectorAll(`soma-hl[data-highlight-id="${id}"]`);
  if (elements.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    const rects = el.getClientRects();
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (r.x < minX) minX = r.x;
      if (r.y < minY) minY = r.y;
      if (r.right > maxX) maxX = r.right;
      if (r.bottom > maxY) maxY = r.bottom;
    }
  }
  if (!isFinite(minX)) return null;
  return new DOMRect(minX, minY, maxX - minX, maxY - minY);
}

// ── Dot Click Delegation ──

let dotDelegationInstalled = false;

/**
 * Install document-level click handler for highlight dot markers.
 * Dot click → open note popover; all other clicks pass through.
 */
function ensureDotDelegation(): void {
  if (dotDelegationInstalled) return;
  dotDelegationInstalled = true;

  document.addEventListener('click', (e) => {
    const targetElement = e.target as Element | null;
    if (!targetElement?.closest(DOT_SELECTOR)) return;

    const highlightElement = targetElement.closest('soma-hl[data-highlight-id]') as HTMLElement | null;
    if (!highlightElement) return;

    e.preventDefault();
    e.stopPropagation();

    const highlightId = highlightElement.getAttribute('data-highlight-id');
    if (!highlightId) return;

    const rect = highlightElement.getBoundingClientRect();
    showNotePopoverForExistingHighlight(highlightId, rect);
  });
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
 *
 * Uses Range.intersectsNode() instead of direct container comparison,
 * which correctly handles ranges where startContainer or endContainer
 * is an Element (e.g., double-click paragraph selection where the browser
 * sets endContainer to the <p> element rather than a text node).
 */
function getTextNodesInRange(range: Range): TextNodeSegment[] {
  // Simple case: selection within a single text node
  if (
    range.startContainer === range.endContainer
    && range.startContainer.nodeType === Node.TEXT_NODE
  ) {
    return [{
      node: range.startContainer as Text,
      startOffset: range.startOffset,
      endOffset: range.endOffset,
    }];
  }

  const segments: TextNodeSegment[] = [];
  const walker = document.createTreeWalker(
    range.commonAncestorContainer,
    NodeFilter.SHOW_TEXT,
  );

  let node = walker.nextNode() as Text | null;

  while (node) {
    // Only include text nodes that actually intersect the range.
    // Previous code compared node identity against range.startContainer / endContainer,
    // which failed when those containers were Elements (not Text nodes).
    if (range.intersectsNode(node)) {
      const startOffset = (node === range.startContainer) ? range.startOffset : 0;
      const endOffset = (node === range.endContainer) ? range.endOffset : node.length;

      if (startOffset < endOffset) {
        segments.push({ node, startOffset, endOffset });
      }
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
  highlightColor: string = DEFAULT_HIGHLIGHT_BG,
  options: HighlightRenderOptions = {},
): void {
  ensureDotDelegation();
  const segments = getTextNodesInRange(range);

  // Process segments in reverse to maintain valid offsets
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    // Skip empty or whitespace-only segments (e.g., "\n" between <p> tags
    // included by double-click paragraph selection)
    if (seg.startOffset === seg.endOffset) continue;
    const segText = seg.node.textContent?.slice(seg.startOffset, seg.endOffset);
    if (!segText || !segText.trim()) continue;

    const wrappedRange = document.createRange();
    wrappedRange.setStart(seg.node, seg.startOffset);
    wrappedRange.setEnd(seg.node, seg.endOffset);

    const highlightEl = document.createElement('soma-hl');
    highlightEl.setAttribute('data-highlight-id', highlightId);
    highlightEl.style.display = 'inline';
    highlightEl.style.cursor = 'pointer';
    // Readwise-like style: transparent tint + solid bottom underline.
    highlightEl.style.borderRadius = '0';
    highlightEl.style.paddingBottom = '1px';
    highlightEl.style.backgroundColor = toHighlightFillColor(highlightColor);
    highlightEl.style.borderBottom = `2px solid ${toHighlightLineColor(highlightColor)}`;

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

  renderDot(highlightId, !!options.hasNote);
}

function toHighlightLineColor(color: string): string {
  if (color.startsWith('#')) return color;

  const rgbMatch = color.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgbMatch) return DEFAULT_HIGHLIGHT_BG;

  const parts = rgbMatch[1]
    .split(',')
    .map((part) => Number(part.trim()))
    .slice(0, 3);
  if (parts.length < 3 || parts.some((v) => Number.isNaN(v))) {
    return DEFAULT_HIGHLIGHT_BG;
  }
  return `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`;
}

function toHighlightFillColor(_color: string): string {
  // Fixed Soft Banana fill — consistent with side-panel <mark> styling.
  return HIGHLIGHT_FILL_COLOR;
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
    // Remove dot markers before unwrapping so they don't leak into the DOM
    el.querySelectorAll(DOT_SELECTOR).forEach((dot) => dot.remove());
    // Move all children out of the highlight element
    while (el.firstChild) {
      parent.insertBefore(el.firstChild, el);
    }
    parent.removeChild(el);
    // Normalize to merge adjacent text nodes
    parent.normalize();
  });
}

/**
 * Remove all rendered webpage highlights.
 */
export function clearAllHighlightRenderings(): void {
  const renderedIds = new Set<string>();
  document.querySelectorAll('soma-hl[data-highlight-id]').forEach((el) => {
    const id = el.getAttribute('data-highlight-id');
    if (id) renderedIds.add(id);
  });
  for (const id of renderedIds) {
    removeHighlightRendering(id);
  }
}

// Chat bubble SVGs (14×14) — filled for notes, outline for bare highlights
const BUBBLE_FILLED_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="#8B8422" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 5.79 2 10.5c0 2.56 1.33 4.86 3.42 6.45L4 22l4.76-2.38c1.01.25 2.1.38 3.24.38 5.52 0 10-3.79 10-8.5S17.52 2 12 2z"/></svg>`;
const BUBBLE_OUTLINE_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8B8422" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 5.79 2 10.5c0 2.56 1.33 4.86 3.42 6.45L4 22l4.76-2.38c1.01.25 2.1.38 3.24.38 5.52 0 10-3.79 10-8.5S17.52 2 12 2z"/></svg>`;
const BUBBLE_FILLED_HOVER_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="#6B6510" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 5.79 2 10.5c0 2.56 1.33 4.86 3.42 6.45L4 22l4.76-2.38c1.01.25 2.1.38 3.24.38 5.52 0 10-3.79 10-8.5S17.52 2 12 2z"/></svg>`;
const BUBBLE_OUTLINE_HOVER_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B6510" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 5.79 2 10.5c0 2.56 1.33 4.86 3.42 6.45L4 22l4.76-2.38c1.01.25 2.1.38 3.24.38 5.52 0 10-3.79 10-8.5S17.52 2 12 2z"/></svg>`;

/**
 * Render (or update) the chat bubble marker at the end of a highlight.
 * Filled bubble = has note, outline bubble = bare highlight.
 */
function renderDot(highlightId: string, hasNote: boolean): void {
  const elements = Array.from(
    document.querySelectorAll(`soma-hl[data-highlight-id="${highlightId}"]`),
  ) as HTMLElement[];
  if (elements.length === 0) return;

  // Remove existing markers
  for (const el of elements) {
    el.querySelectorAll(DOT_SELECTOR).forEach((dot) => dot.remove());
  }

  const last = elements[elements.length - 1];
  const marker = document.createElement('span');
  marker.setAttribute('data-soma-dot', hasNote ? 'filled' : 'hollow');
  marker.innerHTML = hasNote ? BUBBLE_FILLED_SVG : BUBBLE_OUTLINE_SVG;
  marker.style.display = 'inline-flex';
  marker.style.alignItems = 'center';
  marker.style.marginLeft = '3px';
  marker.style.verticalAlign = 'text-bottom';
  marker.style.cursor = 'pointer';
  marker.style.transition = 'transform 0.15s ease';
  marker.title = hasNote ? 'View note' : 'Add note';

  const normalSvg = hasNote ? BUBBLE_FILLED_SVG : BUBBLE_OUTLINE_SVG;
  const hoverSvg = hasNote ? BUBBLE_FILLED_HOVER_SVG : BUBBLE_OUTLINE_HOVER_SVG;
  marker.addEventListener('mouseenter', () => {
    marker.innerHTML = hoverSvg;
    marker.style.transform = 'scale(1.15)';
  });
  marker.addEventListener('mouseleave', () => {
    marker.innerHTML = normalSvg;
    marker.style.transform = 'scale(1)';
  });

  last.appendChild(marker);
}

function replaceRenderedHighlightId(oldId: string, newId: string): void {
  const elements = document.querySelectorAll(
    `soma-hl[data-highlight-id="${oldId}"]`,
  );
  elements.forEach((el) => {
    el.setAttribute('data-highlight-id', newId);
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

  // Don't highlight inside our own injected toolbar overlays
  const anchorNode = selection.anchorNode;
  if (anchorNode) {
    const ancestor =
      anchorNode.nodeType === Node.ELEMENT_NODE
        ? (anchorNode as Element)
        : anchorNode.parentElement;
    if (ancestor?.closest('[data-soma-highlight-overlay="true"]')) return false;
    // Note: selections inside <soma-hl> are allowed — handleSelectionChange
    // detects overlap and shows the highlight actions toolbar instead.
  }

  return true;
}

/**
 * Check if the entire selection range falls within a single existing highlight.
 * Returns the highlight ID if so, null otherwise.
 *
 * Handles two cases:
 * ① Both endpoints are text nodes inside the same <soma-hl> (normal click-drag)
 * ② One or both endpoints are Element nodes (double-click paragraph selection)
 *    — the browser may set endContainer to <p> instead of a text node inside
 *    <soma-hl>, so closest() going upward won't find it. Fallback: check if
 *    all intersecting <soma-hl> elements share the same ID and their combined
 *    text matches the selection text.
 */
export function findOverlappingHighlightId(range: Range): string | null {
  const startNode = range.startContainer;
  const endNode = range.endContainer;

  // ① Quick path: both endpoints inside the same <soma-hl>
  const startElement = startNode.nodeType === Node.TEXT_NODE
    ? startNode.parentElement
    : startNode as Element;
  const endElement = endNode.nodeType === Node.TEXT_NODE
    ? endNode.parentElement
    : endNode as Element;

  const startHL = startElement?.closest('soma-hl[data-highlight-id]');
  const endHL = endElement?.closest('soma-hl[data-highlight-id]');

  if (startHL && endHL) {
    const startId = startHL.getAttribute('data-highlight-id');
    const endId = endHL.getAttribute('data-highlight-id');
    if (startId && startId === endId) return startId;
  }

  // ② Fallback: collect all <soma-hl> elements intersecting the range.
  //    If they all belong to one highlight and cover the entire selection text,
  //    it's a full overlap (e.g. double-click on a highlighted paragraph).
  const ancestor = range.commonAncestorContainer;
  const container = ancestor.nodeType === Node.ELEMENT_NODE
    ? ancestor as Element
    : ancestor.parentElement;
  if (!container) return null;

  const highlightEls = container.querySelectorAll('soma-hl[data-highlight-id]');
  const ids = new Set<string>();
  const parts: string[] = [];

  for (const hl of highlightEls) {
    if (range.intersectsNode(hl)) {
      const id = hl.getAttribute('data-highlight-id');
      if (id) {
        ids.add(id);
        parts.push(hl.textContent ?? '');
      }
    }
  }

  if (ids.size !== 1) return null;

  const hlText = parts.join('').trim();
  const selText = range.toString().trim();
  if (selText && selText === hlText) return [...ids][0];

  return null;
}

/**
 * Handle text selection — show floating toolbar on valid selection.
 *
 * If the selection is entirely within an existing highlight, shows the
 * highlight actions toolbar (delete / add note) instead of the creation
 * toolbar, preventing duplicate highlights on the same text.
 */
function handleSelectionChange(): void {
  try {
    const selection = window.getSelection();
    if (!selection || !isValidSelection(selection)) {
      hideToolbar();
      currentRange = null;
      selectedExistingHighlightId = null;
      return;
    }

    const range = selection.getRangeAt(0).cloneRange();
    const rect = range.getBoundingClientRect();

    // Check if selection falls entirely within an existing highlight
    const existingId = findOverlappingHighlightId(range);
    if (existingId) {
      // Don't show creation toolbar for already-highlighted text
      currentRange = null;
      selectedExistingHighlightId = existingId;
      hideToolbar();
      return;
    }

    currentRange = range;
    selectedExistingHighlightId = null;
    showToolbar(rect, handleToolbarAction);
  } catch (err) {
    hideToolbar();
    currentRange = null;
    console.error('[soma] Failed to handle text selection:', err);
  }
}

function requestHighlightCheckForCurrentUrl(): void {
  const payload: HighlightCheckUrlRequestPayload = {
    url: location.href,
  };
  chrome.runtime.sendMessage({
    type: HIGHLIGHT_CHECK_URL_REQUEST,
    payload,
  }).catch(() => {});
}

function handleUrlChangeIfNeeded(): void {
  if (location.href === lastKnownUrl) return;
  lastKnownUrl = location.href;
  clearAllHighlightRenderings();
  hideAllHighlightOverlays();
  currentRange = null;
  requestHighlightCheckForCurrentUrl();
}

function setupSpaUrlChangeDetection(): void {
  const patchHistoryMethod = (method: 'pushState' | 'replaceState') => {
    const original = history[method];
    const wrapped: typeof history.pushState = function (
      this: History,
      ...args: Parameters<History['pushState']>
    ) {
      const result = original.apply(this, args);
      queueMicrotask(handleUrlChangeIfNeeded);
      return result;
    };
    history[method] = wrapped;
  };

  patchHistoryMethod('pushState');
  patchHistoryMethod('replaceState');

  window.addEventListener('popstate', handleUrlChangeIfNeeded);
  window.addEventListener('hashchange', handleUrlChangeIfNeeded);
}

// ── Toolbar Action Handling ──

/**
 * Handle actions from the floating toolbar.
 */
function handleToolbarAction(action: ToolbarAction): void {
  if (!currentRange) return;

  const range = currentRange.cloneRange();
  const selection = window.getSelection();

  switch (action) {
    case 'note':
      createHighlight(range);
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
 * Create highlight immediately and show optional note popover.
 * Highlight is saved as soon as the user clicks the toolbar button.
 * Note popover opens but is not required — Cancel leaves the highlight saved.
 */
function createHighlight(range: Range): void {
  const rect = range.getBoundingClientRect(); // Capture before DOM modification
  const draft = createHighlightDraft(range);
  pendingNoteDraft = draft;
  pendingExistingHighlightNoteId = null;

  // ① Immediately save bare #highlight (no noteEntries)
  persistHighlightImmediate(draft);

  // ② Show optional note popover
  showNotePopover(
    rect,
    {
      onSave: (entries) => {
        const nonEmpty = entries.filter((e) => e.text.trim());
        pendingNoteDraft = null;
        if (nonEmpty.length > 0) {
          // Wrap the bare highlight in a #note
          sendNotesForHighlight(draft, nonEmpty);
        }
        // Empty note → just close popover, highlight already saved
      },
      onCancel: () => {
        pendingNoteDraft = null;
        // Cancel → highlight already saved, nothing to undo
      },
    },
    {
      placeholder: 'What does this make you think?',
      initialEntries: [{ text: '', depth: 0 }],
    },
  );
}

/**
 * Resolve per-post source URL and title from a selection range.
 * On feed/timeline pages (e.g. X.com home), walks up from the selection
 * to find the enclosing post and extracts its permalink.
 * Falls back to the page-level URL and title.
 */
function resolvePostSource(range: Range): { url: string; title: string } {
  const fallback = { url: location.href, title: document.title };

  // X.com / Twitter: find the enclosing <article data-testid="tweet">
  const host = location.hostname.replace(/^www\./, '');
  if (host === 'x.com' || host === 'twitter.com') {
    const container = range.commonAncestorContainer;
    const el = container.nodeType === Node.ELEMENT_NODE
      ? container as Element
      : container.parentElement;
    const article = el?.closest('article[data-testid="tweet"]');
    if (article) {
      // Find permalink: <a href="/user/status/123"> containing <time>
      const timeLink = article.querySelector('a[href*="/status/"] time')?.parentElement as HTMLAnchorElement | null;
      const href = timeLink?.getAttribute('href');
      if (href?.includes('/status/')) {
        const postUrl = `https://x.com${href}`;
        // Build title: @author: text preview
        const authorEl = article.querySelector('[data-testid="User-Name"]');
        const handleLink = authorEl?.querySelector('a[href^="/"]');
        const handle = handleLink?.getAttribute('href')?.replace(/^\//, '');
        const textEl = article.querySelector('[data-testid="tweetText"]');
        const text = textEl?.textContent?.trim() ?? '';
        const preview = text.length > 40 ? text.slice(0, 37) + '…' : text;
        const title = handle ? `@${handle}: ${preview}` : preview || document.title;
        return { url: postUrl, title };
      }
    }
  }

  return fallback;
}

function createHighlightDraft(range: Range): HighlightDraft {
  const anchor = computeAnchor(range);
  const selectedText = range.toString();

  // Generate a temporary ID for immediate rendering
  // Side Panel will assign the real node ID and send it back.
  const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  renderHighlight(range, tempId);

  const source = resolvePostSource(range);

  return {
    tempId,
    payloadBase: {
      anchor,
      selectedText,
      pageUrl: source.url,
      pageTitle: source.title,
    },
  };
}

/**
 * Immediately save bare #highlight (no note). Updates draft.finalId on success.
 */
function persistHighlightImmediate(draft: HighlightDraft): void {
  const payload: HighlightCreatePayload = {
    ...draft.payloadBase,
    tempId: draft.tempId,
    // No noteEntries → bare #highlight
  };

  const msg: { type: typeof HIGHLIGHT_CREATE; payload: HighlightCreatePayload } = {
    type: HIGHLIGHT_CREATE,
    payload,
  };

  chrome.runtime.sendMessage(msg, (response?: { highlightNodeId?: string }) => {
    if (chrome.runtime.lastError) {
      removeHighlightRendering(draft.tempId);
      console.warn('[soma] Failed to create highlight:', chrome.runtime.lastError.message);
      return;
    }

    const finalId = response?.highlightNodeId;
    if (finalId) {
      replaceRenderedHighlightId(draft.tempId, finalId);
      draft.finalId = finalId;
    }
  });
}

/**
 * Send note entries to wrap a bare highlight in a #note (via HIGHLIGHT_NOTES_SAVE).
 * If the real highlight ID hasn't arrived yet, falls back to sending with tempId
 * (background will queue it for the pending highlight).
 */
function sendNotesForHighlight(draft: HighlightDraft, noteEntries: NoteEntry[]): void {
  const highlightId = draft.finalId ?? draft.tempId;

  chrome.runtime.sendMessage({
    type: HIGHLIGHT_NOTES_SAVE,
    payload: { id: highlightId, noteEntries },
  }, () => {
    if (chrome.runtime.lastError) {
      console.warn('[soma] Failed to save notes for highlight:', chrome.runtime.lastError.message);
      return;
    }
    renderDot(highlightId, true);
  });
}

function showNotePopoverForExistingHighlight(highlightId: string, rect: DOMRect): void {
  pendingExistingHighlightNoteId = highlightId;
  pendingNoteDraft = null;

  // Fetch existing note entries before opening the popover
  const getPayload: HighlightNoteGetPayload = { id: highlightId };
  chrome.runtime.sendMessage(
    { type: HIGHLIGHT_NOTE_GET, payload: getPayload },
    (response) => {
      const existingEntries: NoteEntry[] = response?.noteEntries ?? [];
      // Always show at least one empty item for input
      const initialEntries: NoteEntry[] = existingEntries.length > 0
        ? existingEntries
        : [{ text: '', depth: 0 }];

      showNotePopover(
        rect,
        {
          onSave: (entries) => {
            const nonEmpty = entries.filter((e) => e.text.trim());
            pendingExistingHighlightNoteId = null;

            const payload: HighlightNotesSavePayload = {
              id: highlightId,
              noteEntries: nonEmpty,
            };
            chrome.runtime.sendMessage({
              type: HIGHLIGHT_NOTES_SAVE,
              payload,
            }, () => {
              if (chrome.runtime.lastError) {
                console.warn('[soma] Failed to save highlight notes:', chrome.runtime.lastError.message);
                return;
              }
              renderDot(highlightId, nonEmpty.length > 0);
            });
          },
          onCancel: () => {
            pendingExistingHighlightNoteId = null;
          },
          onDelete: () => {
            pendingExistingHighlightNoteId = null;
            deleteHighlight(highlightId);
          },
        },
        {
          placeholder: 'What does this make you think?',
          initialEntries,
        },
      );
    },
  );
}

function deleteHighlight(highlightId: string): void {
  removeHighlightRendering(highlightId);

  const payload: HighlightDeletePayload = { id: highlightId };
  chrome.runtime.sendMessage({
    type: HIGHLIGHT_DELETE,
    payload,
  }, () => {
    if (chrome.runtime.lastError) {
      console.warn('[soma] Failed to delete highlight:', chrome.runtime.lastError.message);
    }
  });
}

function handleGlobalPointerDown(e: PointerEvent): void {
  const target = e.target;

  if (isHighlightOverlayHost(target)) return;
  if (target instanceof Element && target.closest('soma-hl[data-highlight-id]')) return;

  // Clicking outside closes the note popover but does NOT remove the highlight
  // (highlight is already saved as bare #highlight).
  pendingNoteDraft = null;
  pendingExistingHighlightNoteId = null;
  selectedExistingHighlightId = null;

  hideNotePopover();
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
  lastKnownUrl = location.href;

  ensureDotDelegation();

  // Keyboard shortcut: Cmd/Ctrl+Shift+H to open note popover directly
  document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;
    if (e.key !== 'H' && e.key !== 'h') return;

    // Case 1: New text selection → create highlight (with optional note popover)
    if (currentRange) {
      e.preventDefault();
      e.stopPropagation();
      const range = currentRange;
      window.getSelection()?.removeAllRanges();
      hideToolbar();
      currentRange = null;
      createHighlight(range);
      return;
    }

    // Case 2: Selection on existing highlight → open note for it
    if (selectedExistingHighlightId) {
      e.preventDefault();
      e.stopPropagation();
      const id = selectedExistingHighlightId;
      const rect = computeGroupBoundingRect(id);
      if (rect) {
        showNotePopoverForExistingHighlight(id, rect);
      }
    }
  });

  // Debounced selection events => check selection
  let selectionTimeout: ReturnType<typeof setTimeout> | null = null;

  const onSelectionEvent = () => {
    if (selectionTimeout) clearTimeout(selectionTimeout);
    selectionTimeout = setTimeout(handleSelectionChange, 10);
  };

  document.addEventListener('mouseup', onSelectionEvent);
  document.addEventListener('touchend', onSelectionEvent);
  document.addEventListener('selectionchange', onSelectionEvent);

  // Dismiss overlays on scroll/resize
  const dismissOverlays = () => {
    hideAllHighlightOverlays();
  };
  window.addEventListener('scroll', dismissOverlays, { passive: true });
  window.addEventListener('resize', dismissOverlays, { passive: true });

  document.addEventListener('pointerdown', handleGlobalPointerDown, true);

  setupSpaUrlChangeDetection();
}

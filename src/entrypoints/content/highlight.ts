/**
 * Content Script highlight core — selection listener, DOM rendering,
 * and hover handling for webpage highlights.
 *
 * Note-first model:
 * - valid text selection => show floating Note button
 * - click Note => render highlight preview, open note popover
 * - user writes note + saves => persist #note with #highlight
 * - cancel/empty => discard highlight preview
 *
 * Existing highlight flow:
 * - hover <soma-hl> => show contextual toolbar (delete / add note)
 * - clicks pass through to original elements (links, etc.)
 * - note icon click => open note in Side Panel
 */
import { computeAnchor } from './anchor-utils.js';
import {
  showToolbar,
  hideToolbar,
  showHighlightActionsToolbar,
  hideHighlightActionsToolbar,
  showNotePopover,
  hideNotePopover,
  hideAllHighlightOverlays,
  isHighlightOverlayHost,
  setHighlightActionsHoverCallbacks,
  type ToolbarAction,
  type NoteEntry,
} from './highlight-toolbar.js';
import {
  HIGHLIGHT_CREATE,
  HIGHLIGHT_CLICK,
  HIGHLIGHT_DELETE,
  HIGHLIGHT_NOTES_SAVE,
  HIGHLIGHT_NOTE_GET,
  HIGHLIGHT_CHECK_URL_REQUEST,
  type HighlightCreatePayload,
  type HighlightClickPayload,
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

const NOTE_ICON_SELECTOR = '[data-soma-note-icon="true"]';

interface HighlightRenderOptions {
  hasNote?: boolean;
}

interface HighlightDraft {
  tempId: string;
  payloadBase: Omit<HighlightCreatePayload, 'noteEntries'>;
}

// ── State ──

let currentRange: Range | null = null;
let initialized = false;
let lastKnownUrl = '';
let pendingNoteDraft: HighlightDraft | null = null;
let pendingExistingHighlightNoteId: string | null = null;
/** Tracks highlight ID when user's selection overlaps an existing highlight. */
let selectedExistingHighlightId: string | null = null;

// ── Highlight Hover Delegation ──

interface HighlightHoverState {
  activeId: string | null;
  cachedRects: DOMRect[] | null;
  anchorRect: DOMRect | null;
  hideTimer: ReturnType<typeof setTimeout> | null;
  rafHandle: number | null;
  overToolbar: boolean;
}

const hoverState: HighlightHoverState = {
  activeId: null,
  cachedRects: null,
  anchorRect: null,
  hideTimer: null,
  rafHandle: null,
  overToolbar: false,
};

let hoverDelegationInstalled = false;

/** Rect expansion in px (top/bottom) for line-gap tolerance. */
const RECT_EXPAND_Y = 4;

/** Delay before hiding toolbar after mouse leaves highlight + toolbar. */
const HIDE_DELAY_MS = 250;

/**
 * Collect all client rects for a highlight ID, expanding each vertically
 * by RECT_EXPAND_Y to cover line gaps in multi-line inline elements.
 */
function computeExpandedRects(id: string): DOMRect[] {
  const elements = document.querySelectorAll(`soma-hl[data-highlight-id="${id}"]`);
  const expanded: DOMRect[] = [];
  for (const el of elements) {
    const rects = el.getClientRects();
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      expanded.push(new DOMRect(r.x, r.y - RECT_EXPAND_Y, r.width, r.height + RECT_EXPAND_Y * 2));
    }
  }
  return expanded;
}

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

function pointInExpandedRects(x: number, y: number, rects: DOMRect[]): boolean {
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (x >= r.x && x <= r.right && y >= r.y && y <= r.bottom) return true;
  }
  return false;
}

function cancelHoverHideTimer(): void {
  if (hoverState.hideTimer !== null) {
    clearTimeout(hoverState.hideTimer);
    hoverState.hideTimer = null;
  }
}

function clearHoverState(): void {
  cancelHoverHideTimer();
  if (hoverState.rafHandle !== null) {
    cancelAnimationFrame(hoverState.rafHandle);
    hoverState.rafHandle = null;
  }
  hoverState.activeId = null;
  hoverState.cachedRects = null;
  hoverState.anchorRect = null;
  hoverState.overToolbar = false;
  hideHighlightActionsToolbar();
}

function scheduleHoverHide(): void {
  cancelHoverHideTimer();
  hoverState.hideTimer = setTimeout(() => {
    hoverState.hideTimer = null;
    clearHoverState();
  }, HIDE_DELAY_MS);
}

function showToolbarForHighlight(id: string): void {
  cancelHoverHideTimer();
  hoverState.activeId = id;
  hoverState.cachedRects = computeExpandedRects(id);
  hoverState.anchorRect = computeGroupBoundingRect(id);
  hoverState.overToolbar = false;

  if (!hoverState.anchorRect) return;

  showHighlightActionsToolbar(hoverState.anchorRect, {
    onOpenNote: () => {
      showNotePopoverForExistingHighlight(id, hoverState.anchorRect!);
      clearHoverState();
    },
  });
}

function onMouseMove(e: MouseEvent): void {
  // Skip if note popover is open
  if (pendingNoteDraft || pendingExistingHighlightNoteId) return;

  const target = e.target as Element | null;

  // Fast path: mouse is directly over a highlight element
  const hlEl = target?.closest?.('soma-hl[data-highlight-id]') as HTMLElement | null;
  if (hlEl) {
    const id = hlEl.getAttribute('data-highlight-id');
    if (!id) return;
    if (id === hoverState.activeId) {
      cancelHoverHideTimer();
      return;
    }
    showToolbarForHighlight(id);
    return;
  }

  // If no active highlight, nothing to do in slow path
  if (!hoverState.activeId) return;

  // Slow path: check expanded rects with rAF throttle
  if (hoverState.rafHandle !== null) return;

  const x = e.clientX;
  const y = e.clientY;

  hoverState.rafHandle = requestAnimationFrame(() => {
    hoverState.rafHandle = null;
    if (!hoverState.activeId || !hoverState.cachedRects) return;

    if (pointInExpandedRects(x, y, hoverState.cachedRects)) {
      cancelHoverHideTimer();
    } else if (!hoverState.overToolbar) {
      scheduleHoverHide();
    }
  });
}

/**
 * Install document-level hover tracking and click handler for highlights.
 * Hover triggers the actions toolbar; clicks pass through to original elements
 * (links, etc.) except for the note icon.
 */
function ensureHoverDelegation(): void {
  if (hoverDelegationInstalled) return;
  hoverDelegationInstalled = true;

  document.addEventListener('mousemove', onMouseMove, { passive: true });

  // Click handler — only intercept note icon clicks, let everything else through
  document.addEventListener('click', (e) => {
    const targetElement = e.target as Element | null;
    if (!targetElement?.closest(NOTE_ICON_SELECTOR)) return;

    const highlightElement = targetElement.closest('soma-hl[data-highlight-id]') as HTMLElement | null;
    if (!highlightElement) return;

    e.preventDefault();
    e.stopPropagation();

    const highlightId = highlightElement.getAttribute('data-highlight-id');
    if (!highlightId) return;

    const msg: { type: typeof HIGHLIGHT_CLICK; payload: HighlightClickPayload } = {
      type: HIGHLIGHT_CLICK,
      payload: { id: highlightId },
    };
    chrome.runtime.sendMessage(msg);
    clearHoverState();
  });

  // Register toolbar hover bridging callbacks
  setHighlightActionsHoverCallbacks(
    () => {
      // Mouse entered toolbar
      hoverState.overToolbar = true;
      cancelHoverHideTimer();
    },
    () => {
      // Mouse left toolbar
      hoverState.overToolbar = false;
      scheduleHoverHide();
    },
  );
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
  ensureHoverDelegation();
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

  if (options.hasNote) {
    renderNoteBadge(highlightId);
  }
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

function renderNoteBadge(highlightId: string): void {
  const elements = Array.from(
    document.querySelectorAll(`soma-hl[data-highlight-id="${highlightId}"]`),
  ) as HTMLElement[];
  if (elements.length === 0) return;

  for (const el of elements) {
    el.querySelectorAll(NOTE_ICON_SELECTOR).forEach((icon) => icon.remove());
  }

  const last = elements[elements.length - 1];
  const icon = document.createElement('span');
  icon.setAttribute('data-soma-note-icon', 'true');
  icon.textContent = '🗨';
  icon.style.display = 'inline-block';
  icon.style.marginLeft = '4px';
  icon.style.fontSize = '11px';
  icon.style.lineHeight = '1';
  icon.style.verticalAlign = 'text-top';
  icon.style.cursor = 'pointer';
  icon.title = 'Open note';
  last.appendChild(icon);
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
      // Show highlight actions (delete / add note) instead of creation toolbar
      currentRange = null;
      selectedExistingHighlightId = existingId;
      hideToolbar();
      showHighlightActionsToolbar(rect, {
        onOpenNote: () => {
          showNotePopoverForExistingHighlight(existingId, rect);
        },
      });
      return;
    }

    currentRange = range;
    selectedExistingHighlightId = null;
    showToolbar(rect, handleToolbarAction);
    hideHighlightActionsToolbar();
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
      createHighlightWithNote(range);
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
 * Create temporary highlight and collect note input before persistence.
 * Note-first model: user must write a note, highlight is persisted with the note.
 */
function createHighlightWithNote(range: Range): void {
  const rect = range.getBoundingClientRect(); // Capture before DOM modification
  const draft = createHighlightDraft(range);
  pendingNoteDraft = draft;
  pendingExistingHighlightNoteId = null;

  showNotePopover(
    rect,
    {
      onSave: (entries) => {
        const nonEmpty = entries.filter((e) => e.text.trim());
        pendingNoteDraft = null;
        if (nonEmpty.length > 0) {
          persistHighlightDraft(draft, nonEmpty);
        } else {
          // No note content → discard the draft highlight rendering
          removeHighlightRendering(draft.tempId);
        }
      },
      onCancel: () => {
        pendingNoteDraft = null;
        // Cancel → discard the draft highlight rendering (note-first: no note = no save)
        removeHighlightRendering(draft.tempId);
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

function persistHighlightDraft(
  draft: HighlightDraft,
  noteEntries: NoteEntry[],
): void {
  const payload: HighlightCreatePayload = {
    ...draft.payloadBase,
    tempId: draft.tempId,
    noteEntries,
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
      renderNoteBadge(finalId);
      return;
    }

    renderNoteBadge(draft.tempId);
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
              if (nonEmpty.length > 0) {
                renderNoteBadge(highlightId);
              }
            });
          },
          onCancel: () => {
            pendingExistingHighlightNoteId = null;
            hideHighlightActionsToolbar();
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

  if (pendingNoteDraft) {
    const draft = pendingNoteDraft;
    pendingNoteDraft = null;
    // Note-first: clicking outside without saving discards the draft
    removeHighlightRendering(draft.tempId);
  }
  pendingExistingHighlightNoteId = null;
  selectedExistingHighlightId = null;

  clearHoverState();
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

  ensureHoverDelegation();

  // Keyboard shortcut: Cmd/Ctrl+Shift+H to open note popover directly
  document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;
    if (e.key !== 'H' && e.key !== 'h') return;

    // Case 1: New text selection → create highlight with note
    if (currentRange) {
      e.preventDefault();
      e.stopPropagation();
      const range = currentRange;
      window.getSelection()?.removeAllRanges();
      hideToolbar();
      currentRange = null;
      createHighlightWithNote(range);
      return;
    }

    // Case 2: Selection on existing highlight → open note for it
    if (selectedExistingHighlightId) {
      e.preventDefault();
      e.stopPropagation();
      const id = selectedExistingHighlightId;
      const rect = computeGroupBoundingRect(id);
      if (rect) {
        hideHighlightActionsToolbar();
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
    clearHoverState();
    hideAllHighlightOverlays();
  };
  window.addEventListener('scroll', dismissOverlays, { passive: true });
  window.addEventListener('resize', dismissOverlays, { passive: true });

  document.addEventListener('pointerdown', handleGlobalPointerDown, true);

  setupSpaUrlChangeDetection();
}

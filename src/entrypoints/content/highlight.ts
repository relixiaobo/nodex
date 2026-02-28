/**
 * Content Script highlight core — selection listener, DOM rendering,
 * and click handling for webpage highlights.
 *
 * Selection flow:
 * - valid text selection => show floating icon toolbar
 * - click Highlight => render + persist highlight
 * - click Note => render highlight, open inline note popover, then persist
 *
 * Existing highlight flow:
 * - click <soma-hl> => show contextual toolbar (delete / add note)
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
  type ToolbarAction,
} from './highlight-toolbar.js';
import {
  HIGHLIGHT_CREATE,
  HIGHLIGHT_CLICK,
  HIGHLIGHT_DELETE,
  HIGHLIGHT_NOTE_UPSERT,
  HIGHLIGHT_CHECK_URL_REQUEST,
  type HighlightCreatePayload,
  type HighlightClickPayload,
  type HighlightDeletePayload,
  type HighlightNoteUpsertPayload,
  type HighlightCheckUrlRequestPayload,
} from '../../lib/highlight-messaging.js';
import { WEBCLIP_CAPTURE_ACTIVE_TAB } from '../../lib/webclip-messaging.js';

// ── Default Highlight Color (matches design-system Antique Gold) ──

/** Antique Gold (#9B7C38) for webpage highlight underline + tint. */
export const DEFAULT_HIGHLIGHT_BG = '#9B7C38';

const COMMENT_ICON_SELECTOR = '[data-soma-note-icon="true"]';

interface HighlightRenderOptions {
  hasComment?: boolean;
}

interface HighlightDraft {
  tempId: string;
  payloadBase: Omit<HighlightCreatePayload, 'withNote' | 'noteText'>;
}

// ── State ──

let currentRange: Range | null = null;
let initialized = false;
let lastKnownUrl = '';
let pendingNoteDraft: HighlightDraft | null = null;
let pendingExistingHighlightNoteId: string | null = null;

// ── Highlight Click Delegation ──

let clickDelegationInstalled = false;

/**
 * Install a single document-level click handler for all <soma-hl> elements.
 * Uses event delegation instead of Custom Elements API (unavailable in
 * Chrome content script isolated world).
 */
function ensureClickDelegation(): void {
  if (clickDelegationInstalled) return;
  clickDelegationInstalled = true;

  document.addEventListener('click', (e) => {
    const targetElement = e.target as Element | null;
    const highlightElement = targetElement?.closest?.('soma-hl[data-highlight-id]') as HTMLElement | null;
    if (!highlightElement) return;

    e.preventDefault();
    e.stopPropagation();

    const highlightId = highlightElement.getAttribute('data-highlight-id');
    if (!highlightId) return;

    if (targetElement?.closest(COMMENT_ICON_SELECTOR)) {
      const msg: { type: typeof HIGHLIGHT_CLICK; payload: HighlightClickPayload } = {
        type: HIGHLIGHT_CLICK,
        payload: { id: highlightId },
      };
      chrome.runtime.sendMessage(msg);
      hideHighlightActionsToolbar();
      return;
    }

    const rect = highlightElement.getBoundingClientRect();
    showHighlightActionsToolbar(rect, {
      onDelete: () => {
        deleteHighlight(highlightId);
      },
      onAddNote: () => {
        showNotePopoverForExistingHighlight(highlightId, rect);
      },
    });
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
 */
function getTextNodesInRange(range: Range): TextNodeSegment[] {
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
  highlightColor: string = DEFAULT_HIGHLIGHT_BG,
  options: HighlightRenderOptions = {},
): void {
  ensureClickDelegation();
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

  if (options.hasComment) {
    renderCommentBadge(highlightId);
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

function toHighlightFillColor(color: string): string {
  const lineColor = toHighlightLineColor(color);
  if (lineColor.startsWith('#')) {
    const hex = lineColor.slice(1);
    if (hex.length === 6) {
      const r = Number.parseInt(hex.slice(0, 2), 16);
      const g = Number.parseInt(hex.slice(2, 4), 16);
      const b = Number.parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, 0.22)`;
    }
  }

  const rgbMatch = lineColor.match(/^rgb\(([^)]+)\)$/i);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map((part) => Number(part.trim()));
    if (parts.length >= 3 && !parts.slice(0, 3).some((v) => Number.isNaN(v))) {
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, 0.22)`;
    }
  }

  return 'rgba(155, 124, 56, 0.22)';
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

function renderCommentBadge(highlightId: string): void {
  const elements = Array.from(
    document.querySelectorAll(`soma-hl[data-highlight-id="${highlightId}"]`),
  ) as HTMLElement[];
  if (elements.length === 0) return;

  for (const el of elements) {
    el.querySelectorAll(COMMENT_ICON_SELECTOR).forEach((icon) => icon.remove());
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

  // Don't highlight inside our own injected elements
  const anchorNode = selection.anchorNode;
  if (anchorNode) {
    const ancestor =
      anchorNode.nodeType === Node.ELEMENT_NODE
        ? (anchorNode as Element)
        : anchorNode.parentElement;
    if (ancestor?.closest('[data-soma-highlight-overlay="true"], soma-hl')) return false;
  }

  return true;
}

/**
 * Handle text selection — show floating toolbar on valid selection.
 */
function handleSelectionChange(): void {
  try {
    const selection = window.getSelection();
    if (!selection || !isValidSelection(selection)) {
      hideToolbar();
      currentRange = null;
      return;
    }

    currentRange = selection.getRangeAt(0).cloneRange();
    const rect = currentRange.getBoundingClientRect();
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
    case 'highlight':
      createHighlight(range);
      break;
    case 'note':
      createHighlightWithNote(range);
      break;
    case 'more':
      // Reserved for future action menu.
      break;
    case 'clip':
      // Delegate to existing webclip capture
      chrome.runtime.sendMessage({ type: WEBCLIP_CAPTURE_ACTIVE_TAB });
      break;
    case 'tag':
      // Reserved for future tag assignment workflow.
      break;
  }

  // Clear selection after action
  selection?.removeAllRanges();
  hideToolbar();
  currentRange = null;
}

/**
 * Create a persisted highlight from range (immediate create flow).
 */
function createHighlight(range: Range): void {
  const draft = createHighlightDraft(range);
  persistHighlightDraft(draft, { withNote: false });
}

/**
 * Create temporary highlight and collect note input before persistence.
 */
function createHighlightWithNote(range: Range): void {
  const draft = createHighlightDraft(range);
  const rect = range.getBoundingClientRect();
  pendingNoteDraft = draft;
  pendingExistingHighlightNoteId = null;

  showNotePopover(
    rect,
    {
      onSave: (text) => {
        const noteText = text.trim();
        pendingNoteDraft = null;
        persistHighlightDraft(draft, {
          withNote: noteText.length > 0,
          noteText: noteText.length > 0 ? noteText : undefined,
        });
      },
      onCancel: () => {
        pendingNoteDraft = null;
        persistHighlightDraft(draft, { withNote: false });
      },
    },
    {
      placeholder: 'Add a note...',
    },
  );
}

function createHighlightDraft(range: Range): HighlightDraft {
  const anchor = computeAnchor(range);
  const selectedText = range.toString();

  // Generate a temporary ID for immediate rendering
  // Side Panel will assign the real node ID and send it back.
  const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  renderHighlight(range, tempId);

  return {
    tempId,
    payloadBase: {
      anchor,
      selectedText,
      pageUrl: location.href,
      pageTitle: document.title,
    },
  };
}

function persistHighlightDraft(
  draft: HighlightDraft,
  options: { withNote: boolean; noteText?: string },
): void {
  const noteText = options.noteText?.trim();

  const payload: HighlightCreatePayload = {
    ...draft.payloadBase,
    withNote: options.withNote,
    noteText: noteText || undefined,
  };

  const msg: { type: typeof HIGHLIGHT_CREATE; payload: HighlightCreatePayload } = {
    type: HIGHLIGHT_CREATE,
    payload,
  };

  chrome.runtime.sendMessage(msg, (response?: { nodeId?: string }) => {
    if (chrome.runtime.lastError) {
      // If message fails, remove the temporary highlight.
      removeHighlightRendering(draft.tempId);
      console.warn('[soma] Failed to create highlight:', chrome.runtime.lastError.message);
      return;
    }

    const finalId = response?.nodeId;
    if (finalId) {
      replaceRenderedHighlightId(draft.tempId, finalId);
      if (noteText) {
        renderCommentBadge(finalId);
      }
      return;
    }

    if (noteText) {
      renderCommentBadge(draft.tempId);
    }
  });
}

function showNotePopoverForExistingHighlight(highlightId: string, rect: DOMRect): void {
  pendingExistingHighlightNoteId = highlightId;
  pendingNoteDraft = null;
  showNotePopover(
    rect,
    {
      onSave: (text) => {
        const noteText = text.trim();
        if (!noteText) return;
        pendingExistingHighlightNoteId = null;

        const payload: HighlightNoteUpsertPayload = {
          id: highlightId,
          noteText,
        };
        chrome.runtime.sendMessage({
          type: HIGHLIGHT_NOTE_UPSERT,
          payload,
        }, () => {
          if (chrome.runtime.lastError) {
            console.warn('[soma] Failed to upsert highlight note:', chrome.runtime.lastError.message);
            return;
          }
          renderCommentBadge(highlightId);
        });
      },
      onCancel: () => {
        pendingExistingHighlightNoteId = null;
        hideHighlightActionsToolbar();
      },
    },
    {
      placeholder: 'Add a note...',
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
    persistHighlightDraft(draft, { withNote: false });
  }
  pendingExistingHighlightNoteId = null;

  hideHighlightActionsToolbar();
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

  ensureClickDelegation();

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

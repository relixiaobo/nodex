/**
 * Highlight messaging protocol — constants and payload types for
 * Content Script <-> Background <-> Side Panel communication.
 */
import type { HighlightAnchor } from './highlight-anchor.js';

// ── Message Type Constants ──

/** Content Script -> Side Panel: user created a new highlight */
export const HIGHLIGHT_CREATE = 'highlight:create' as const;

/** Side Panel -> Content Script: restore existing highlights on page */
export const HIGHLIGHT_RESTORE = 'highlight:restore' as const;

/** Side Panel -> Content Script: remove a highlight rendering from page */
export const HIGHLIGHT_REMOVE = 'highlight:remove' as const;

/** Content Script -> Side Panel: delete an existing highlight node */
export const HIGHLIGHT_DELETE = 'highlight:delete' as const;

/** Side Panel -> Content Script: scroll to a specific highlight and flash */
export const HIGHLIGHT_SCROLL_TO = 'highlight:scroll-to' as const;

/** Content Script -> Side Panel: user clicked a highlight on the page */
export const HIGHLIGHT_CLICK = 'highlight:click' as const;

/** Content Script -> Side Panel: add/update note text for a highlight */
export const HIGHLIGHT_NOTE_UPSERT = 'highlight:note-upsert' as const;

/** Background -> Side Panel: check if current URL has highlight data */
export const HIGHLIGHT_CHECK_URL = 'highlight:check-url' as const;

/** Content Script -> Background: URL changed in SPA, request check + restore */
export const HIGHLIGHT_CHECK_URL_REQUEST = 'highlight:check-url-request' as const;

/** Content Script -> Side Panel: report highlights that could not be restored */
export const HIGHLIGHT_UNRESOLVABLE = 'highlight:unresolvable' as const;

// ── Payload Types ──

/** CS -> SP: Create a new highlight */
export interface HighlightCreatePayload {
  anchor: HighlightAnchor;
  selectedText: string;
  pageUrl: string;
  pageTitle: string;
  /** If true, Side Panel should focus on note input after creation */
  withNote?: boolean;
  /** Optional note text saved under the created highlight as #comment child */
  noteText?: string;
}

/** SP -> CS: Restore highlights on the page */
export interface HighlightRestorePayload {
  highlights: HighlightRestoreItem[];
}

export interface HighlightRestoreItem {
  /** soma node ID of the highlight */
  id: string;
  anchor: HighlightAnchor;
  color: string;
  /** Whether highlight currently has a #comment child */
  hasComment?: boolean;
}

/** SP -> CS: Remove a specific highlight rendering */
export interface HighlightRemovePayload {
  /** soma node ID of the highlight to remove */
  id: string;
}

/** CS -> SP: Delete a highlight node */
export interface HighlightDeletePayload {
  /** soma node ID of the highlight to delete */
  id: string;
}

/** SP -> CS: Scroll to a highlight and flash it */
export interface HighlightScrollToPayload {
  /** soma node ID of the highlight to scroll to */
  id: string;
}

/** CS -> SP: User clicked a highlight on the page */
export interface HighlightClickPayload {
  /** soma node ID of the clicked highlight */
  id: string;
}

/** CS -> SP: Add/update note text for highlight's #comment child */
export interface HighlightNoteUpsertPayload {
  /** soma node ID of the highlight */
  id: string;
  /** note content; empty string is ignored */
  noteText: string;
}

/** BG -> SP: Check if URL has highlight data */
export interface HighlightCheckUrlPayload {
  url: string;
  tabId: number;
}

/** CS -> BG: URL changed, ask Background to trigger check-url flow */
export interface HighlightCheckUrlRequestPayload {
  url: string;
}

/** CS -> SP: Highlights that could not be restored */
export interface HighlightUnresolvablePayload {
  /** soma node IDs that could not be located on the page */
  ids: string[];
}

// ── Message Wrapper Types ──

export type HighlightMessage =
  | { type: typeof HIGHLIGHT_CREATE; payload: HighlightCreatePayload }
  | { type: typeof HIGHLIGHT_RESTORE; payload: HighlightRestorePayload }
  | { type: typeof HIGHLIGHT_REMOVE; payload: HighlightRemovePayload }
  | { type: typeof HIGHLIGHT_DELETE; payload: HighlightDeletePayload }
  | { type: typeof HIGHLIGHT_SCROLL_TO; payload: HighlightScrollToPayload }
  | { type: typeof HIGHLIGHT_CLICK; payload: HighlightClickPayload }
  | { type: typeof HIGHLIGHT_NOTE_UPSERT; payload: HighlightNoteUpsertPayload }
  | { type: typeof HIGHLIGHT_CHECK_URL; payload: HighlightCheckUrlPayload }
  | { type: typeof HIGHLIGHT_CHECK_URL_REQUEST; payload: HighlightCheckUrlRequestPayload }
  | { type: typeof HIGHLIGHT_UNRESOLVABLE; payload: HighlightUnresolvablePayload };

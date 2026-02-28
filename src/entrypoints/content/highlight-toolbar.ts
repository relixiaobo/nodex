/**
 * Floating highlight overlays — Shadow DOM isolated UI elements.
 *
 * Provides:
 * 1) Selection toolbar (icon-only)
 * 2) Highlight action toolbar (delete / add note)
 * 3) Note popover (textarea + Cancel/Save)
 *
 * Uses plain DOM + Shadow DOM only (no Custom Elements API).
 */

// ── Types ──

export type ToolbarAction = 'highlight' | 'note' | 'tag' | 'more' | 'clip';
export type ToolbarActionCallback = (action: ToolbarAction) => void;

export interface HighlightActionsCallbacks {
  onDelete: () => void;
  onAddNote: () => void;
}

export interface NotePopoverCallbacks {
  onSave: (text: string) => void;
  onCancel: () => void;
}

export interface NotePopoverOptions {
  initialText?: string;
  placeholder?: string;
}

// ── State ──

const OVERLAY_ATTR = 'data-soma-highlight-overlay';

let selectionToolbarElement: HTMLDivElement | null = null;
let selectionShadowRoot: ShadowRoot | null = null;
let selectionActionCallback: ToolbarActionCallback | null = null;

let highlightActionsElement: HTMLDivElement | null = null;
let highlightActionsShadowRoot: ShadowRoot | null = null;
let highlightActionsCallbacks: HighlightActionsCallbacks | null = null;

let notePopoverElement: HTMLDivElement | null = null;
let notePopoverShadowRoot: ShadowRoot | null = null;
let notePopoverTextarea: HTMLTextAreaElement | null = null;
let notePopoverCallbacks: NotePopoverCallbacks | null = null;

// ── Shared Styles ──

const HOST_STYLE = `
:host {
  all: initial;
  position: fixed;
  z-index: 2147483647;
  pointer-events: auto;
  font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
`;

const PAPER_SHADOW = `
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.015),
    0 -1px 2px rgba(255, 255, 255, 0.6),
    0 2px 5px -1px rgba(0, 0, 0, 0.05),
    0 6px 10px -3px rgba(0, 0, 0, 0.03),
    0 12px 20px -4px rgba(0, 0, 0, 0.04);
`;

const FLOATING_BAR_STYLE = `
${HOST_STYLE}

.soma-floating-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  background: #F5F4EE;
  border-radius: 8px;
  ${PAPER_SHADOW}
  animation: soma-toolbar-in 0.12s ease-out;
}

@keyframes soma-toolbar-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

button {
  all: unset;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 7px;
  color: #1A1A1A;
  cursor: pointer;
  transition: background 0.15s ease-out;
}

button:hover {
  background: rgba(26, 26, 26, 0.06);
}

button:active {
  background: rgba(26, 26, 26, 0.1);
}

.icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
}
`;

const ACTIONS_BAR_STYLE = `
${HOST_STYLE}

.soma-highlight-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px;
  background: #F5F4EE;
  border-radius: 8px;
  ${PAPER_SHADOW}
}

button {
  all: unset;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 7px;
  color: #1A1A1A;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease-out, color 0.15s ease-out;
}

button:hover {
  background: rgba(26, 26, 26, 0.06);
}

button:active {
  background: rgba(26, 26, 26, 0.1);
}

button[data-action='delete'] {
  color: #AA5048;
}

button[data-action='delete']:hover {
  background: rgba(170, 80, 72, 0.08);
}

.icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}
`;

const NOTE_POPOVER_STYLE = `
${HOST_STYLE}

.soma-note-popover {
  width: min(340px, calc(100vw - 24px));
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  background: #F5F4EE;
  border-radius: 8px;
  ${PAPER_SHADOW}
}

textarea {
  all: unset;
  box-sizing: border-box;
  min-height: 86px;
  max-height: 180px;
  width: 100%;
  overflow: auto;
  border-radius: 8px;
  padding: 8px 9px;
  background: #FFFFFF;
  border: 1px solid rgba(0, 0, 0, 0.1);
  color: #1A1A1A;
  font-size: 13px;
  line-height: 20px;
  transition: border-color 0.15s ease-out, box-shadow 0.15s ease-out;
}

textarea:focus {
  border-color: rgba(0, 0, 0, 0.18);
  box-shadow: 0 0 0 2px rgba(94, 142, 101, 0.2);
}

textarea::placeholder {
  color: #999999;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

button {
  all: unset;
  box-sizing: border-box;
  height: 30px;
  padding: 0 10px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease-out, color 0.15s ease-out;
}

button[data-action='cancel'] {
  color: #666666;
  background: rgba(26, 26, 26, 0.06);
}

button[data-action='cancel']:hover {
  background: rgba(26, 26, 26, 0.1);
}

button[data-action='save'] {
  color: #FFFFFF;
  background: #5E8E65;
}

button[data-action='save']:hover {
  background: #4D7A54;
}
`;

// ── SVG Icons ──

const ICON_HIGHLIGHT = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>`;
const ICON_NOTE = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
const ICON_TAG = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 11 3H4v7l9.59 9.59a2 2 0 0 0 2.82 0l4.18-4.18a2 2 0 0 0 0-2.82Z"/><path d="M7 7h.01"/></svg>`;
const ICON_MORE = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`;
const ICON_DELETE = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/></svg>`;

// ── Helpers ──

function appendHostToPage(host: HTMLDivElement): void {
  const container = document.body ?? document.documentElement;
  container.appendChild(host);
}

function createShadowHost(): { host: HTMLDivElement; root: ShadowRoot } {
  const host = document.createElement('div');
  host.setAttribute(OVERLAY_ATTR, 'true');
  const root = host.attachShadow({ mode: 'closed' });
  return { host, root };
}

function createStyle(styleText: string): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = styleText;
  return style;
}

function createIconButton(action: string, icon: string, label: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.setAttribute('data-action', action);
  btn.setAttribute('title', label);
  btn.setAttribute('aria-label', label);
  btn.innerHTML = icon;
  return btn;
}

function createLabeledButton(action: string, icon: string, label: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.setAttribute('data-action', action);
  btn.innerHTML = `${icon}<span>${label}</span>`;
  return btn;
}

function getFloatingPosition(selectionRect: DOMRect): { top: number; left: number } {
  const TOOLBAR_HEIGHT = 40;
  const MARGIN = 8;

  let top = selectionRect.top - TOOLBAR_HEIGHT - MARGIN;
  if (top < 0) top = selectionRect.bottom + MARGIN;

  let left = selectionRect.left + selectionRect.width / 2;
  const viewportWidth = document.documentElement.clientWidth;
  left = Math.max(80, Math.min(left, viewportWidth - 80));

  return { top, left };
}

function getPopoverPosition(anchorRect: DOMRect): { top: number; left: number } {
  const POPUP_WIDTH = 340;
  const MARGIN = 8;
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;

  let top = anchorRect.bottom + MARGIN;
  if (top + 220 > viewportHeight) {
    top = Math.max(8, anchorRect.top - 220 - MARGIN);
  }

  let left = anchorRect.left + anchorRect.width / 2;
  const minLeft = POPUP_WIDTH / 2 + 8;
  const maxLeft = viewportWidth - POPUP_WIDTH / 2 - 8;
  left = Math.max(minLeft, Math.min(left, maxLeft));

  return { top, left };
}

// ── Selection Toolbar ──

function buildSelectionToolbar(): void {
  const { host, root } = createShadowHost();
  selectionToolbarElement = host;
  selectionShadowRoot = root;

  const bar = document.createElement('div');
  bar.className = 'soma-floating-bar';
  bar.appendChild(createIconButton('highlight', ICON_HIGHLIGHT, 'Highlight'));
  bar.appendChild(createIconButton('note', ICON_NOTE, 'Note'));
  bar.appendChild(createIconButton('tag', ICON_TAG, 'Tag'));
  bar.appendChild(createIconButton('more', ICON_MORE, 'More'));

  root.appendChild(createStyle(FLOATING_BAR_STYLE));
  root.appendChild(bar);

  bar.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  bar.addEventListener('click', (e) => {
    const target = (e.target as Element).closest('button');
    if (!target) return;
    const action = target.getAttribute('data-action') as ToolbarAction | null;
    if (action && selectionActionCallback) {
      selectionActionCallback(action);
    }
  });

  appendHostToPage(host);
}

export function showToolbar(selectionRect: DOMRect, callback: ToolbarActionCallback): void {
  try {
    selectionActionCallback = callback;
    if (!selectionToolbarElement || !selectionShadowRoot) {
      buildSelectionToolbar();
    }

    const pos = getFloatingPosition(selectionRect);
    selectionToolbarElement!.style.position = 'fixed';
    selectionToolbarElement!.style.zIndex = '2147483647';
    selectionToolbarElement!.style.top = `${pos.top}px`;
    selectionToolbarElement!.style.left = `${pos.left}px`;
    selectionToolbarElement!.style.transform = 'translateX(-50%)';
    selectionToolbarElement!.style.display = 'block';
  } catch (err) {
    console.error('[soma:hl] showToolbar error:', err);
  }
}

export function hideToolbar(): void {
  if (selectionToolbarElement) selectionToolbarElement.style.display = 'none';
  selectionActionCallback = null;
}

// ── Highlight Action Toolbar ──

function buildHighlightActionsToolbar(): void {
  const { host, root } = createShadowHost();
  highlightActionsElement = host;
  highlightActionsShadowRoot = root;

  const bar = document.createElement('div');
  bar.className = 'soma-highlight-actions';
  bar.appendChild(createLabeledButton('delete', ICON_DELETE, 'Delete'));
  bar.appendChild(createLabeledButton('add-note', ICON_NOTE, 'Add note'));

  root.appendChild(createStyle(ACTIONS_BAR_STYLE));
  root.appendChild(bar);

  bar.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  bar.addEventListener('click', (e) => {
    const target = (e.target as Element).closest('button');
    if (!target || !highlightActionsCallbacks) return;

    const action = target.getAttribute('data-action');
    if (action === 'delete') {
      highlightActionsCallbacks.onDelete();
      hideHighlightActionsToolbar();
      return;
    }
    if (action === 'add-note') {
      highlightActionsCallbacks.onAddNote();
    }
  });

  appendHostToPage(host);
}

export function showHighlightActionsToolbar(
  anchorRect: DOMRect,
  callbacks: HighlightActionsCallbacks,
): void {
  try {
    highlightActionsCallbacks = callbacks;
    if (!highlightActionsElement || !highlightActionsShadowRoot) {
      buildHighlightActionsToolbar();
    }

    const pos = getFloatingPosition(anchorRect);
    highlightActionsElement!.style.position = 'fixed';
    highlightActionsElement!.style.zIndex = '2147483647';
    highlightActionsElement!.style.top = `${pos.top}px`;
    highlightActionsElement!.style.left = `${pos.left}px`;
    highlightActionsElement!.style.transform = 'translateX(-50%)';
    highlightActionsElement!.style.display = 'block';
  } catch (err) {
    console.error('[soma:hl] showHighlightActionsToolbar error:', err);
  }
}

export function hideHighlightActionsToolbar(): void {
  if (highlightActionsElement) highlightActionsElement.style.display = 'none';
  highlightActionsCallbacks = null;
}

// ── Note Popover ──

function buildNotePopover(): void {
  const { host, root } = createShadowHost();
  notePopoverElement = host;
  notePopoverShadowRoot = root;

  const popover = document.createElement('div');
  popover.className = 'soma-note-popover';

  const textarea = document.createElement('textarea');
  notePopoverTextarea = textarea;

  const actions = document.createElement('div');
  actions.className = 'actions';

  const cancelButton = document.createElement('button');
  cancelButton.setAttribute('data-action', 'cancel');
  cancelButton.textContent = 'Cancel';

  const saveButton = document.createElement('button');
  saveButton.setAttribute('data-action', 'save');
  saveButton.textContent = 'Save';

  actions.appendChild(cancelButton);
  actions.appendChild(saveButton);

  popover.appendChild(textarea);
  popover.appendChild(actions);

  root.appendChild(createStyle(NOTE_POPOVER_STYLE));
  root.appendChild(popover);

  popover.addEventListener('mousedown', (e) => {
    e.stopPropagation();
  });

  popover.addEventListener('click', (e) => {
    const target = (e.target as Element).closest('button');
    if (!target || !notePopoverCallbacks) return;

    const action = target.getAttribute('data-action');
    if (action === 'cancel') {
      notePopoverCallbacks.onCancel();
      hideNotePopover();
      return;
    }

    if (action === 'save') {
      notePopoverCallbacks.onSave(notePopoverTextarea?.value ?? '');
      hideNotePopover();
    }
  });

  popover.addEventListener('keydown', (e) => {
    if (!notePopoverCallbacks) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      notePopoverCallbacks.onCancel();
      hideNotePopover();
      return;
    }

    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      notePopoverCallbacks.onSave(notePopoverTextarea?.value ?? '');
      hideNotePopover();
    }
  });

  appendHostToPage(host);
}

export function showNotePopover(
  anchorRect: DOMRect,
  callbacks: NotePopoverCallbacks,
  options: NotePopoverOptions = {},
): void {
  try {
    notePopoverCallbacks = callbacks;
    if (!notePopoverElement || !notePopoverShadowRoot || !notePopoverTextarea) {
      buildNotePopover();
    }

    const pos = getPopoverPosition(anchorRect);
    notePopoverElement!.style.position = 'fixed';
    notePopoverElement!.style.zIndex = '2147483647';
    notePopoverElement!.style.top = `${pos.top}px`;
    notePopoverElement!.style.left = `${pos.left}px`;
    notePopoverElement!.style.transform = 'translateX(-50%)';
    notePopoverElement!.style.display = 'block';

    notePopoverTextarea!.placeholder = options.placeholder ?? 'Add a note...';
    notePopoverTextarea!.value = options.initialText ?? '';
    notePopoverTextarea!.focus();
    notePopoverTextarea!.setSelectionRange(
      notePopoverTextarea!.value.length,
      notePopoverTextarea!.value.length,
    );
  } catch (err) {
    console.error('[soma:hl] showNotePopover error:', err);
  }
}

export function hideNotePopover(): void {
  if (notePopoverElement) notePopoverElement.style.display = 'none';
  notePopoverCallbacks = null;
}

// ── Shared Public API ──

export function hideAllHighlightOverlays(): void {
  hideToolbar();
  hideHighlightActionsToolbar();
  hideNotePopover();
}

export function isHighlightOverlayHost(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;

  if (selectionToolbarElement?.contains(target)) return true;
  if (highlightActionsElement?.contains(target)) return true;
  if (notePopoverElement?.contains(target)) return true;

  return false;
}

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

export type ToolbarAction = 'highlight' | 'note' | 'clip';
export type ToolbarActionCallback = (action: ToolbarAction) => void;

export interface HighlightActionsCallbacks {
  onDelete: () => void;
  onAddNote: () => void;
}

export interface NoteEntry {
  text: string;
  depth: number;
}

export interface NotePopoverCallbacks {
  onSave: (entries: NoteEntry[]) => void;
  onCancel: () => void;
}

export interface NotePopoverOptions {
  initialEntries?: NoteEntry[];
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
let notePopoverListElement: HTMLDivElement | null = null;
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
  width: 15px;
  height: 15px;
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

.soma-note-list {
  max-height: 200px;
  overflow-y: auto;
}

.soma-note-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 6px;
  min-height: 24px;
}

.soma-note-bullet {
  flex-shrink: 0;
  width: 15px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
}

.soma-note-bullet::after {
  content: '';
  display: block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: rgba(26, 26, 26, 0.40);
}

.soma-note-editor {
  flex: 1;
  min-height: 24px;
  outline: none;
  color: #1A1A1A;
  font-size: 15px;
  line-height: 24px;
  word-break: break-word;
  white-space: pre-wrap;
}

.soma-note-editor:empty::before {
  content: attr(data-placeholder);
  color: #999999;
  pointer-events: none;
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

kbd {
  font-family: inherit;
  font-size: 11px;
  font-weight: 400;
  opacity: 0.7;
  margin-left: 4px;
}
`;

// ── SVG Icons ──

const ICON_HIGHLIGHT = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>`;
const ICON_NOTE = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
const ICON_HIGHLIGHT_OFF = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/><line x1="2" y1="2" x2="22" y2="22"/></svg>`;

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

let hoverEnterCallback: (() => void) | null = null;
let hoverLeaveCallback: (() => void) | null = null;

/**
 * Register callbacks for toolbar hover bridging.
 * Called by highlight.ts to track when the mouse enters/leaves the toolbar.
 */
export function setHighlightActionsHoverCallbacks(
  onEnter: () => void,
  onLeave: () => void,
): void {
  hoverEnterCallback = onEnter;
  hoverLeaveCallback = onLeave;
}

function buildHighlightActionsToolbar(): void {
  const { host, root } = createShadowHost();
  highlightActionsElement = host;
  highlightActionsShadowRoot = root;

  const bar = document.createElement('div');
  bar.className = 'soma-highlight-actions';
  bar.appendChild(createIconButton('delete', ICON_HIGHLIGHT_OFF, 'Remove highlight'));
  bar.appendChild(createIconButton('add-note', ICON_NOTE, 'Add note'));

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

  // Hover bridging: toolbar ↔ highlight
  host.addEventListener('mouseenter', () => {
    hoverEnterCallback?.();
  });
  host.addEventListener('mouseleave', () => {
    hoverLeaveCallback?.();
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

// ── Note List Helpers ──

function createNoteItem(text: string, placeholder: string, depth: number = 0): HTMLDivElement {
  const item = document.createElement('div');
  item.className = 'soma-note-item';
  item.setAttribute('data-depth', String(depth));
  item.style.paddingLeft = `${depth * 28 + 6}px`;

  const bullet = document.createElement('span');
  bullet.className = 'soma-note-bullet';

  const editor = document.createElement('div');
  editor.className = 'soma-note-editor';
  editor.setAttribute('contenteditable', 'true');
  editor.setAttribute('data-placeholder', placeholder);
  if (text) editor.textContent = text;

  item.appendChild(bullet);
  item.appendChild(editor);
  return item;
}

function getItemDepth(item: HTMLDivElement): number {
  return Number.parseInt(item.getAttribute('data-depth') ?? '0', 10);
}

function setItemDepth(item: HTMLDivElement, depth: number): void {
  item.setAttribute('data-depth', String(depth));
  item.style.paddingLeft = `${depth * 28 + 6}px`;
}

function collectNoteEntries(): NoteEntry[] {
  if (!notePopoverListElement) return [];
  const items = notePopoverListElement.querySelectorAll('.soma-note-item') as NodeListOf<HTMLDivElement>;
  const entries: NoteEntry[] = [];
  items.forEach((item) => {
    const editor = item.querySelector('.soma-note-editor') as HTMLElement | null;
    entries.push({
      text: editor?.textContent ?? '',
      depth: getItemDepth(item),
    });
  });
  return entries;
}

function getNoteItems(): HTMLDivElement[] {
  if (!notePopoverListElement) return [];
  return Array.from(notePopoverListElement.querySelectorAll('.soma-note-item')) as HTMLDivElement[];
}

function focusEditorAtEnd(editor: HTMLElement): void {
  editor.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function focusEditorAtStart(editor: HTMLElement): void {
  editor.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function getCursorOffset(editor: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return -1;
  const range = sel.getRangeAt(0);
  const preRange = document.createRange();
  preRange.selectNodeContents(editor);
  preRange.setEnd(range.startContainer, range.startOffset);
  return preRange.toString().length;
}

function buildNotePopover(): void {
  const { host, root } = createShadowHost();
  notePopoverElement = host;
  notePopoverShadowRoot = root;

  const popover = document.createElement('div');
  popover.className = 'soma-note-popover';

  const noteList = document.createElement('div');
  noteList.className = 'soma-note-list';
  notePopoverListElement = noteList;

  const actions = document.createElement('div');
  actions.className = 'actions';

  const cancelButton = document.createElement('button');
  cancelButton.setAttribute('data-action', 'cancel');
  cancelButton.textContent = 'Cancel';

  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const saveButton = document.createElement('button');
  saveButton.setAttribute('data-action', 'save');
  saveButton.innerHTML = `Save<kbd>${isMac ? '⌘' : 'Ctrl+'}↵</kbd>`;

  actions.appendChild(cancelButton);
  actions.appendChild(saveButton);

  popover.appendChild(noteList);
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
      notePopoverCallbacks.onSave(collectNoteEntries());
      hideNotePopover();
    }
  });

  // Keyboard handling for the note list (Enter, Backspace, ArrowUp/Down, Cmd+Enter, Escape)
  noteList.addEventListener('keydown', (e) => {
    if (!notePopoverCallbacks) return;

    // Cmd/Ctrl+Enter → Save
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      notePopoverCallbacks.onSave(collectNoteEntries());
      hideNotePopover();
      return;
    }

    // Escape → Cancel
    if (e.key === 'Escape') {
      e.preventDefault();
      notePopoverCallbacks.onCancel();
      hideNotePopover();
      return;
    }

    const activeEditor = notePopoverShadowRoot?.activeElement as HTMLElement | null;
    if (!activeEditor?.classList.contains('soma-note-editor')) return;
    const currentItem = activeEditor.closest('.soma-note-item') as HTMLDivElement | null;
    if (!currentItem) return;

    const items = getNoteItems();
    const idx = items.indexOf(currentItem);

    // Tab → Indent (increase depth)
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const currentDepth = getItemDepth(currentItem);
      // First item cannot be indented; depth cannot exceed previous item's depth + 1
      if (idx > 0) {
        const prevDepth = getItemDepth(items[idx - 1]);
        if (currentDepth < prevDepth + 1) {
          setItemDepth(currentItem, currentDepth + 1);
        }
      }
      return;
    }

    // Shift+Tab → Outdent (decrease depth)
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      const currentDepth = getItemDepth(currentItem);
      if (currentDepth > 0) {
        setItemDepth(currentItem, currentDepth - 1);
      }
      return;
    }

    // Enter → Insert new item below (inherits current depth)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const currentDepth = getItemDepth(currentItem);
      const newItem = createNoteItem('', activeEditor.getAttribute('data-placeholder') ?? '', currentDepth);
      currentItem.after(newItem);
      const newEditor = newItem.querySelector('.soma-note-editor') as HTMLElement;
      focusEditorAtStart(newEditor);
      return;
    }

    // Backspace on empty item → remove and focus previous
    if (e.key === 'Backspace') {
      const text = activeEditor.textContent ?? '';
      const offset = getCursorOffset(activeEditor);
      if (text === '' && items.length > 1) {
        e.preventDefault();
        const prevIdx = Math.max(0, idx - 1);
        const prevEditor = items[prevIdx].querySelector('.soma-note-editor') as HTMLElement;
        currentItem.remove();
        focusEditorAtEnd(prevEditor);
        return;
      }
      // Backspace at beginning of non-empty item → merge with previous
      if (offset === 0 && idx > 0) {
        e.preventDefault();
        const prevEditor = items[idx - 1].querySelector('.soma-note-editor') as HTMLElement;
        const prevText = prevEditor.textContent ?? '';
        prevEditor.textContent = prevText + text;
        currentItem.remove();
        // Place cursor at merge point
        prevEditor.focus();
        const sel = window.getSelection();
        if (sel && prevEditor.firstChild) {
          const range = document.createRange();
          range.setStart(prevEditor.firstChild, prevText.length);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        return;
      }
    }

    // ArrowUp at beginning → focus previous item end
    if (e.key === 'ArrowUp' && idx > 0) {
      const offset = getCursorOffset(activeEditor);
      if (offset === 0) {
        e.preventDefault();
        const prevEditor = items[idx - 1].querySelector('.soma-note-editor') as HTMLElement;
        focusEditorAtEnd(prevEditor);
      }
    }

    // ArrowDown at end → focus next item start
    if (e.key === 'ArrowDown' && idx < items.length - 1) {
      const offset = getCursorOffset(activeEditor);
      const textLen = (activeEditor.textContent ?? '').length;
      if (offset === textLen) {
        e.preventDefault();
        const nextEditor = items[idx + 1].querySelector('.soma-note-editor') as HTMLElement;
        focusEditorAtStart(nextEditor);
      }
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
    if (!notePopoverElement || !notePopoverShadowRoot || !notePopoverListElement) {
      buildNotePopover();
    }

    const pos = getPopoverPosition(anchorRect);
    notePopoverElement!.style.position = 'fixed';
    notePopoverElement!.style.zIndex = '2147483647';
    notePopoverElement!.style.top = `${pos.top}px`;
    notePopoverElement!.style.left = `${pos.left}px`;
    notePopoverElement!.style.transform = 'translateX(-50%)';
    notePopoverElement!.style.display = 'block';

    const placeholder = options.placeholder ?? 'Add a note...';

    // Clear existing items
    notePopoverListElement!.innerHTML = '';

    // Populate from initialEntries (default: one empty item at depth 0)
    const entriesToRender: NoteEntry[] = options.initialEntries?.length
      ? options.initialEntries
      : [{ text: '', depth: 0 }];
    for (const entry of entriesToRender) {
      notePopoverListElement!.appendChild(createNoteItem(entry.text, placeholder, entry.depth));
    }

    // Focus the first item's editor at start (use rAF to ensure Shadow DOM rendered)
    requestAnimationFrame(() => {
      const allItems = getNoteItems();
      if (allItems.length > 0) {
        const firstEditor = allItems[0].querySelector('.soma-note-editor') as HTMLElement;
        focusEditorAtStart(firstEditor);
      }
    });
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

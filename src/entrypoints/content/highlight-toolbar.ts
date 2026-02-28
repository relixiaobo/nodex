/**
 * Floating highlight toolbar — Shadow DOM isolated element.
 *
 * Displays 3 action buttons (Highlight / Note / Clip) near the user's
 * text selection. Uses Closed Shadow DOM on a regular <div> to prevent
 * style leaking. Does NOT use Custom Elements API (unavailable in
 * Chrome content script isolated world).
 */

// ── Types ──

export type ToolbarActionCallback = (action: string) => void;

// ── State ──

let toolbarElement: HTMLDivElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let actionCallback: ToolbarActionCallback | null = null;

// ── Styles ──

const TOOLBAR_STYLES = `
:host {
  all: initial;
  position: fixed;
  z-index: 2147483647;
  pointer-events: auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.soma-floating-bar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  background: #1a1a1a;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.24), 0 0 0 1px rgba(255, 255, 255, 0.08);
  animation: soma-toolbar-in 0.12s ease-out;
}

@keyframes soma-toolbar-in {
  from {
    opacity: 0;
    transform: translateY(4px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

button {
  all: unset;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border-radius: 6px;
  color: #e0e0e0;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.1s;
}

button:hover {
  background: rgba(255, 255, 255, 0.1);
}

button:active {
  background: rgba(255, 255, 255, 0.15);
}

.icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.divider {
  width: 1px;
  height: 18px;
  background: rgba(255, 255, 255, 0.12);
  margin: 0 2px;
}
`;

// ── SVG Icons ──

const ICON_HIGHLIGHT = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>`;
const ICON_NOTE = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
const ICON_CLIP = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>`;

// ── Toolbar Construction ──

function createButton(action: string, iconSvg: string, label: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.setAttribute('data-action', action);
  btn.innerHTML = `${iconSvg}<span>${label}</span>`;
  return btn;
}

/**
 * Build the toolbar DOM: a regular <div> with a closed Shadow DOM.
 * No Custom Elements API needed.
 */
function buildToolbar(): void {
  toolbarElement = document.createElement('div');
  // Prevent page styles from leaking via closed Shadow DOM
  shadowRoot = toolbarElement.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = TOOLBAR_STYLES;

  const bar = document.createElement('div');
  bar.className = 'soma-floating-bar';

  bar.appendChild(createButton('highlight', ICON_HIGHLIGHT, 'Highlight'));
  bar.appendChild(createButton('note', ICON_NOTE, 'Note'));

  const divider = document.createElement('span');
  divider.className = 'divider';
  bar.appendChild(divider);

  bar.appendChild(createButton('clip', ICON_CLIP, 'Clip'));

  shadowRoot.appendChild(style);
  shadowRoot.appendChild(bar);

  // Prevent selection from being cleared before we process the action
  bar.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  bar.addEventListener('click', (e) => {
    const target = (e.target as Element).closest('button');
    if (!target) return;
    const action = target.getAttribute('data-action');
    if (action && actionCallback) {
      actionCallback(action);
    }
  });

  const container = document.body ?? document.documentElement;
  container.appendChild(toolbarElement);
}

// ── Toolbar Positioning ──

/**
 * Calculate toolbar position relative to the selection rect.
 * Prefers above the selection; falls back to below if not enough space.
 */
function getToolbarPosition(
  selectionRect: DOMRect,
): { top: number; left: number } {
  const TOOLBAR_HEIGHT = 40; // approximate height
  const TOOLBAR_MARGIN = 8;

  // Try above the selection
  let top = selectionRect.top - TOOLBAR_HEIGHT - TOOLBAR_MARGIN;

  // If not enough space above, place below
  if (top < 0) {
    top = selectionRect.bottom + TOOLBAR_MARGIN;
  }

  // Center horizontally on the selection
  let left = selectionRect.left + selectionRect.width / 2;

  // Clamp to viewport
  const viewportWidth = document.documentElement.clientWidth;
  left = Math.max(80, Math.min(left, viewportWidth - 80));

  return { top, left };
}

// ── Public API ──

/**
 * Show the floating toolbar near the selection.
 */
export function showToolbar(
  selectionRect: DOMRect,
  callback: ToolbarActionCallback,
): void {
  try {
    actionCallback = callback;

    if (!toolbarElement) {
      buildToolbar();
    }

    const pos = getToolbarPosition(selectionRect);
    toolbarElement!.style.position = 'fixed';
    toolbarElement!.style.zIndex = '2147483647';
    toolbarElement!.style.top = `${pos.top}px`;
    toolbarElement!.style.left = `${pos.left}px`;
    toolbarElement!.style.transform = 'translateX(-50%)';
    toolbarElement!.style.display = 'block';
  } catch (err) {
    console.error('[soma:hl] showToolbar error:', err);
  }
}

/**
 * Hide the floating toolbar.
 */
export function hideToolbar(): void {
  if (toolbarElement) {
    toolbarElement.style.display = 'none';
  }
  actionCallback = null;
}

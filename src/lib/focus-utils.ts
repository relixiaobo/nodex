/**
 * Focus utilities for undo/redo keyboard shortcut handling.
 *
 * Chrome Side Panel intercepts ⌘Z when focus is on <body>, preventing JS
 * from receiving the keydown event. The undo-shortcut-sink is a hidden
 * textarea that captures focus so ⌘Z always reaches our handler.
 */

/**
 * Focus the hidden undo-shortcut-sink textarea, creating it if needed.
 * Call after DOM-replacing operations (panel navigation, etc.) to ensure
 * ⌘Z works immediately without requiring a manual click.
 */
export function focusUndoShortcutSink(): void {
  let el = document.getElementById('undo-shortcut-sink');
  if (!(el instanceof HTMLTextAreaElement)) {
    const created = document.createElement('textarea');
    created.id = 'undo-shortcut-sink';
    created.dataset.undoShortcutSink = 'true';
    created.tabIndex = -1;
    created.readOnly = true;
    created.style.position = 'fixed';
    created.style.left = '0';
    created.style.top = '0';
    created.style.width = '1px';
    created.style.height = '1px';
    created.style.opacity = '0';
    created.style.pointerEvents = 'none';
    created.style.zIndex = '-1';
    created.setAttribute('aria-hidden', 'true');
    document.body.appendChild(created);
    el = created;
  }
  if (!(el instanceof HTMLTextAreaElement)) return;
  el.focus();
}

/**
 * Schedule a focus-to-sink check after React re-render.
 * Only steals focus if activeElement is <body> or null (i.e., nothing focused).
 */
export function ensureUndoFocusAfterNavigation(): void {
  requestAnimationFrame(() => {
    const active = document.activeElement;
    if (!active || active === document.body) {
      focusUndoShortcutSink();
    }
  });
}

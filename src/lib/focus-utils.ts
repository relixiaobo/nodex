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
 * Ensure the undo-shortcut-sink has focus after a panel navigation.
 *
 * Chrome Side Panel will revoke keyboard focus from the entire panel if no
 * DOM element holds focus during a React re-render that replaces the tree.
 * We focus the sink **synchronously** (before React unmounts the old panel)
 * so the panel retains keyboard focus, then again in rAF as a safety net
 * after the new panel renders.
 */
export function ensureUndoFocusAfterNavigation(): void {
  // Synchronous: keep the side panel keyboard-focused during DOM replacement.
  // The sink lives on document.body outside React's root, so it survives re-renders.
  focusUndoShortcutSink();
  // Post-render backup: re-focus if something stole focus during render.
  requestAnimationFrame(() => {
    const active = document.activeElement;
    if (!active || active === document.body) {
      focusUndoShortcutSink();
    }
  });
}

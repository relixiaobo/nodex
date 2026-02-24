/**
 * Global keyboard hook for navigation undo/redo.
 *
 * Cmd+Z / Cmd+Shift+Z → Loro UndoManager (single timeline)
 *
 * Does NOT intercept when a contentEditable element is focused;
 * the editor keymap handles the same Loro undo/redo path.
 */
import { useEffect } from 'react';
import { useUIStore } from '../stores/ui-store';
import { getShortcutKeys, matchesShortcutEvent } from '../lib/shortcut-registry';
import { undoDoc, redoDoc } from '../lib/loro-doc.js';

export type NavUndoAction = 'undo' | 'redo' | null;

export function shouldHandleNavUndo(activeElement: Element | null, focusedNodeId: string | null): boolean {
  // In editor mode, let the editor keymap handle undo/redo (it also uses Loro).
  // Rely on actual DOM focus, not focusedNodeId store state, because clicking row controls
  // (chevron/indent line/etc.) may keep focusedNodeId non-null while the editor lost focus.
  void focusedNodeId;
  if (activeElement instanceof HTMLTextAreaElement && activeElement.dataset.undoShortcutSink === 'true') {
    return true;
  }
  if (activeElement instanceof HTMLElement && activeElement.isContentEditable) return false;
  if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) return false;
  return true;
}

export function resolveNavUndoAction(
  e: KeyboardEvent,
  undoBindings: string[],
  redoBindings: string[],
): NavUndoAction {
  const matchesUndo = undoBindings.some((binding) => matchesShortcutEvent(e, binding));
  const matchesRedo = redoBindings.some((binding) => matchesShortcutEvent(e, binding));
  if (matchesRedo) return 'redo';
  if (matchesUndo) return 'undo';
  return null;
}

export function useNavUndoKeyboard() {
  useEffect(() => {
    const undoBindings = getShortcutKeys('global.nav_undo', ['Mod-z', 'Ctrl-z']);
    const redoBindings = getShortcutKeys('global.nav_redo', ['Mod-Shift-z', 'Ctrl-Shift-z']);

    function handler(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey) {
        const active = document.activeElement as HTMLElement | null;
        console.debug('[undo-debug] raw-keydown', {
          key: e.key,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
          shiftKey: e.shiftKey,
          activeTag: active?.tagName,
          activeClass: active?.className,
        });
      }
      const action = resolveNavUndoAction(e, undoBindings, redoBindings);
      if (!action) return;
      const active = document.activeElement as HTMLElement | null;
      console.debug('[undo-debug] nav-keydown', {
        action,
        key: e.key,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        activeTag: active?.tagName,
        activeClass: active?.className,
        focusedNodeId: useUIStore.getState().focusedNodeId,
      });

      // Don't intercept while editing (or inside text inputs/contentEditable).
      if (!shouldHandleNavUndo(document.activeElement, useUIStore.getState().focusedNodeId)) {
        console.debug('[undo-debug] nav-keydown:skip-editing');
        return;
      }

      e.preventDefault();
      console.debug('[undo-debug] nav-keydown:dispatch', { action });

      if (action === 'redo') {
        redoDoc();
      } else {
        undoDoc();
      }
    }

    // Capture phase so row-level / feature-specific document key handlers can't swallow
    // Cmd+Z before unified undo gets a chance to run.
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);
}

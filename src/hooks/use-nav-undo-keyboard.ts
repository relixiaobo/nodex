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
  if (focusedNodeId) return false;
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
      const action = resolveNavUndoAction(e, undoBindings, redoBindings);
      if (!action) return;

      // Don't intercept while editing (or inside text inputs/contentEditable).
      if (!shouldHandleNavUndo(document.activeElement, useUIStore.getState().focusedNodeId)) return;

      e.preventDefault();

      if (action === 'redo') {
        redoDoc();
      } else {
        undoDoc();
      }
    }

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
}

/**
 * Global keyboard hook for navigation undo/redo.
 *
 * Cmd+Z → navUndo(), Cmd+Shift+Z → navRedo()
 *
 * Does NOT intercept when a contentEditable element is focused
 * (lets TipTap handle its own undo/redo).
 */
import { useEffect } from 'react';
import { useUIStore } from '../stores/ui-store';
import { getShortcutKeys, matchesShortcutEvent } from '../lib/shortcut-registry';

export type NavUndoAction = 'undo' | 'redo' | null;

export function shouldHandleNavUndo(activeElement: Element | null): boolean {
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

      // Don't intercept inside contentEditable (TipTap editors)
      if (!shouldHandleNavUndo(document.activeElement)) return;

      e.preventDefault();

      if (action === 'redo') {
        useUIStore.getState().navRedo();
      } else {
        useUIStore.getState().navUndo();
      }
    }

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
}

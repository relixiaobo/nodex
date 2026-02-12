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

export function useNavUndoKeyboard() {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Only handle Cmd/Ctrl+Z combinations
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.key !== 'z' && e.key !== 'Z') return;

      // Don't intercept inside contentEditable (TipTap editors)
      const el = document.activeElement;
      if (el instanceof HTMLElement && el.isContentEditable) return;
      // Don't intercept inside input/textarea
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;

      e.preventDefault();

      if (e.shiftKey) {
        useUIStore.getState().navRedo();
      } else {
        useUIStore.getState().navUndo();
      }
    }

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
}

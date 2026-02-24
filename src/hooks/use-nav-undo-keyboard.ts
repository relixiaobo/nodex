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
      const action = resolveNavUndoAction(e, undoBindings, redoBindings);
      if (!action) return;

      // Don't intercept while editing (or inside text inputs/contentEditable).
      if (!shouldHandleNavUndo(document.activeElement, useUIStore.getState().focusedNodeId)) {
        return;
      }

      e.preventDefault();

      if (action === 'redo') {
        redoDoc();
      } else {
        undoDoc();
      }
    }

    function beforeInputHandler(e: InputEvent) {
      if (e.inputType !== 'historyUndo' && e.inputType !== 'historyRedo') return;
      const active = document.activeElement as HTMLElement | null;

      // In editor mode, keep relying on editor keymap path to avoid double-dispatch.
      // This fallback primarily targets the hidden sink textarea because macOS Side Panel
      // may swallow Cmd+Z keydown on focused text controls.
      if (!(active instanceof HTMLTextAreaElement && active.dataset.undoShortcutSink === 'true')) {
        return;
      }

      e.preventDefault();
      if (e.inputType === 'historyRedo') {
        redoDoc();
      } else {
        undoDoc();
      }
    }

    // Capture phase so row-level / feature-specific document key handlers can't swallow
    // Cmd+Z before unified undo gets a chance to run.
    window.addEventListener('keydown', handler, true);
    document.addEventListener('beforeinput', beforeInputHandler, true);
    return () => {
      window.removeEventListener('keydown', handler, true);
      document.removeEventListener('beforeinput', beforeInputHandler, true);
    };
  }, []);
}

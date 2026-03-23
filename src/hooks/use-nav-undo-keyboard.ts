/**
 * Global keyboard hook for node-view history navigation.
 *
 * Cmd+Z / Cmd+Shift+Z navigate the node-view history only when:
 * - the user is not editing text
 * - the outliner surface is available
 */
import { useEffect } from 'react';
import { getShortcutKeys, matchesShortcutEvent } from '../lib/shortcut-registry';
import { useUIStore } from '../stores/ui-store.js';

export type NavUndoAction = 'undo' | 'redo' | null;

export function shouldHandleNavUndo(activeElement: Element | null, focusedNodeId: string | null): boolean {
  void focusedNodeId;
  if (activeElement instanceof HTMLTextAreaElement && activeElement.dataset.undoShortcutSink === 'true') {
    return true;
  }
  if (activeElement instanceof HTMLElement && activeElement.isContentEditable) return false;
  if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) return false;
  return true;
}

export function resolveNavUndoAction(
  event: KeyboardEvent,
  undoBindings: string[],
  redoBindings: string[],
): NavUndoAction {
  const matchesUndo = undoBindings.some((binding) => matchesShortcutEvent(event, binding));
  const matchesRedo = redoBindings.some((binding) => matchesShortcutEvent(event, binding));
  if (matchesRedo) return 'redo';
  if (matchesUndo) return 'undo';
  return null;
}

export function useNavUndoKeyboard() {
  useEffect(() => {
    const undoBindings = getShortcutKeys('global.nav_undo', ['Mod-z', 'Ctrl-z']);
    const redoBindings = getShortcutKeys('global.nav_redo', ['Mod-Shift-z', 'Ctrl-Shift-z']);

    function handleNavigation(action: NavUndoAction) {
      if (!action) return;

      const state = useUIStore.getState();
      if (!state.currentNodeId) return;

      if (action === 'redo') {
        state.goForwardNode();
      } else {
        state.goBackNode();
      }
    }

    function handler(event: KeyboardEvent) {
      const action = resolveNavUndoAction(event, undoBindings, redoBindings);
      if (!action) return;

      if (!shouldHandleNavUndo(document.activeElement, useUIStore.getState().focusedNodeId)) {
        return;
      }

      event.preventDefault();
      handleNavigation(action);
    }

    function beforeInputHandler(event: InputEvent) {
      if (event.inputType !== 'historyUndo' && event.inputType !== 'historyRedo') return;
      const active = document.activeElement as HTMLElement | null;

      if (!(active instanceof HTMLTextAreaElement && active.dataset.undoShortcutSink === 'true')) {
        return;
      }

      event.preventDefault();
      handleNavigation(event.inputType === 'historyRedo' ? 'redo' : 'undo');
    }

    window.addEventListener('keydown', handler, true);
    document.addEventListener('beforeinput', beforeInputHandler, true);
    return () => {
      window.removeEventListener('keydown', handler, true);
      document.removeEventListener('beforeinput', beforeInputHandler, true);
    };
  }, []);
}

/**
 * Global keyboard hook for unified timeline undo/redo.
 *
 * Cmd+Z → timeline-driven undo (structural or nav, in time order)
 * Cmd+Shift+Z → timeline-driven redo
 *
 * When a ProseMirror editor is focused, the PM keymap handles Cmd+Z directly.
 * If PM has text history, it undoes text. If not, PM's Mod-z binding calls
 * performTimelineUndo() to fall through to structural/nav undo.
 * This global handler only covers the non-editor case (body/selection mode).
 */
import { useEffect } from 'react';
import { useUIStore } from '../stores/ui-store';
import { getShortcutKeys, matchesShortcutEvent } from '../lib/shortcut-registry';
import { undoDoc, redoDoc, canUndoDoc, canRedoDoc } from '../lib/loro-doc.js';
import {
  popUndoEntry,
  pushRedoEntry,
  popRedoEntry,
  pushUndoEntry,
  hasUndoEntries,
  hasRedoEntries,
} from '../lib/undo-timeline.js';

export type NavUndoAction = 'undo' | 'redo' | null;

/**
 * Returns false when the global timeline handler should NOT run:
 * - Editor focused → PM keymap handles Cmd+Z and falls through to timeline internally
 * - Text input/textarea → never intercept
 */
export function shouldHandleNavUndo(activeElement: Element | null, focusedNodeId: string | null): boolean {
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

/**
 * Timeline-driven undo: pop entries in time order, skip exhausted sub-systems.
 */
export function performTimelineUndo(): boolean {
  while (hasUndoEntries()) {
    const entry = popUndoEntry()!;
    if (entry === 'structural') {
      if (canUndoDoc()) {
        undoDoc();
        pushRedoEntry('structural');
        return true;
      }
      // Loro merged/exhausted this entry, skip to next
      continue;
    } else {
      // 'nav'
      if (useUIStore.getState().navUndoStack.length > 0) {
        useUIStore.getState().navUndo();
        pushRedoEntry('nav');
        return true;
      }
      // nav stack exhausted, skip
      continue;
    }
  }
  return false;
}

/**
 * Timeline-driven redo: symmetric to undo.
 */
export function performTimelineRedo(): boolean {
  while (hasRedoEntries()) {
    const entry = popRedoEntry()!;
    if (entry === 'structural') {
      if (canRedoDoc()) {
        redoDoc();
        // Push back to undo without clearing redo (this is a restore operation)
        pushUndoEntry('structural', false);
        return true;
      }
      continue;
    } else {
      // 'nav'
      if (useUIStore.getState().navRedoStack.length > 0) {
        useUIStore.getState().navRedo();
        pushUndoEntry('nav', false);
        return true;
      }
      continue;
    }
  }
  return false;
}

export function useNavUndoKeyboard() {
  useEffect(() => {
    const undoBindings = getShortcutKeys('global.nav_undo', ['Mod-z', 'Ctrl-z']);
    const redoBindings = getShortcutKeys('global.nav_redo', ['Mod-Shift-z', 'Ctrl-Shift-z']);

    function handler(e: KeyboardEvent) {
      const action = resolveNavUndoAction(e, undoBindings, redoBindings);
      if (!action) return;

      // When editor is focused, PM's keymap handles Cmd+Z/Shift+Z directly
      // and falls through to performTimelineUndo/Redo if PM has no text history.
      // So we only handle the non-editor case here.
      if (!shouldHandleNavUndo(document.activeElement, useUIStore.getState().focusedNodeId)) return;

      e.preventDefault();

      if (action === 'redo') {
        performTimelineRedo();
      } else {
        performTimelineUndo();
      }
    }

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
}

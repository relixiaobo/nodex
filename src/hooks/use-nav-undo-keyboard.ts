/**
 * Global keyboard hook for unified timeline undo/redo.
 *
 * Cmd+Z → timeline-driven undo (structural or nav, in time order)
 * Cmd+Shift+Z → timeline-driven redo
 *
 * When a ProseMirror editor is focused, PM gets first crack at undo/redo.
 * If PM consumed the event (e.defaultPrevented), we stop. If PM had no
 * text history to undo (e.g. newly created empty node), we fall through
 * to the structural/nav timeline.
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
 * Returns false when the timeline handler must NOT run (text inputs).
 * For editor/contentEditable, the handler uses e.defaultPrevented to decide
 * whether PM already consumed the event — see handler() below.
 */
export function shouldHandleNavUndo(activeElement: Element | null, _focusedNodeId: string | null): boolean {
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

      const focusedNodeId = useUIStore.getState().focusedNodeId;
      const activeEl = document.activeElement;

      // Text inputs / textareas — never intercept.
      if (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement) return;

      // Editor focused: let ProseMirror handle first. If PM consumed the event
      // (e.defaultPrevented), we're done. Otherwise fall through to timeline.
      if (focusedNodeId || (activeEl instanceof HTMLElement && activeEl.isContentEditable)) {
        if (e.defaultPrevented) return; // PM handled it (had text history)
        // PM didn't handle — fall through to timeline undo/redo
      }

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

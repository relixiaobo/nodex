/**
 * Pure resolver for keyboard actions in selection mode (no node focused).
 *
 * Returns the action to take, or null if the event is not handled.
 * Phase 1: single-selection basics (navigate, enter edit, type char, clear).
 * Phase 2: extend selection (Shift+Arrow), Cmd+A select all.
 * Phase 3: batch operations (delete, indent, outdent, duplicate, checkbox).
 */

import { isImeComposingEvent } from './ime-keyboard.js';

export type SelectionKeyboardAction =
  | 'navigate_up'      // ↑ → exit selection, edit prev node (cursor at end)
  | 'navigate_down'    // ↓ → exit selection, edit next node (cursor at start)
  | 'extend_up'        // Shift+↑ → extend selection upward from anchor
  | 'extend_down'      // Shift+↓ → extend selection downward from anchor
  | 'enter_edit'       // Enter → edit first selected node (cursor at end)
  | 'type_char'        // printable char → edit first selected + append char
  | 'clear_selection'  // Escape → clear all selection
  | 'select_all'       // Cmd+A → select all top-level nodes
  | 'batch_delete'     // Backspace/Delete → trash all selected nodes
  | 'batch_indent'     // Tab → indent all selected nodes
  | 'batch_outdent'    // Shift+Tab → outdent all selected nodes
  | 'batch_duplicate'  // Cmd+Shift+D → duplicate all selected nodes
  | 'batch_checkbox'   // Cmd+Enter → toggle checkbox on all selected nodes
  | 'batch_apply_tag'  // # → open tag selector for all selected nodes
  | 'batch_copy'       // Cmd+C → copy all selected nodes to clipboard
  | 'batch_cut';       // Cmd+X → cut all selected nodes to clipboard

export function resolveSelectionKeyboardAction(
  e: KeyboardEvent,
): SelectionKeyboardAction | null {
  if (isImeComposingEvent(e)) {
    return null;
  }

  // Shift+Arrow: extend selection
  if (e.shiftKey && e.key === 'ArrowUp' && !e.metaKey && !e.ctrlKey && !e.altKey) {
    return 'extend_up';
  }
  if (e.shiftKey && e.key === 'ArrowDown' && !e.metaKey && !e.ctrlKey && !e.altKey) {
    return 'extend_down';
  }

  // Cmd+A / Ctrl+A: select all
  if ((e.metaKey || e.ctrlKey) && e.key === 'a' && !e.shiftKey && !e.altKey) {
    return 'select_all';
  }

  // Cmd+Enter / Ctrl+Enter: batch checkbox toggle
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.shiftKey && !e.altKey) {
    return 'batch_checkbox';
  }

  // Cmd+Shift+D / Ctrl+Shift+D: batch duplicate
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'd' || e.key === 'D') && !e.altKey) {
    return 'batch_duplicate';
  }

  // Cmd+C / Ctrl+C: batch copy
  if ((e.metaKey || e.ctrlKey) && e.key === 'c' && !e.shiftKey && !e.altKey) {
    return 'batch_copy';
  }

  // Cmd+X / Ctrl+X: batch cut
  if ((e.metaKey || e.ctrlKey) && e.key === 'x' && !e.shiftKey && !e.altKey) {
    return 'batch_cut';
  }

  if (e.key === 'ArrowUp' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
    return 'navigate_up';
  }

  if (e.key === 'ArrowDown' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
    return 'navigate_down';
  }

  if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
    return 'enter_edit';
  }

  if (e.key === 'Escape') {
    return 'clear_selection';
  }

  // Backspace / Delete: batch delete
  if ((e.key === 'Backspace' || e.key === 'Delete') && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
    return 'batch_delete';
  }

  // Shift+Tab: batch outdent (must come before Tab check)
  if (e.key === 'Tab' && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
    return 'batch_outdent';
  }

  // Tab: batch indent
  if (e.key === 'Tab' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
    return 'batch_indent';
  }

  // # (Shift+3): batch apply tag
  if (e.key === '#' && !e.metaKey && !e.ctrlKey && !e.altKey) {
    return 'batch_apply_tag';
  }

  // Printable character: single char, no modifier keys (except Shift for uppercase)
  if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
    return 'type_char';
  }

  return null;
}

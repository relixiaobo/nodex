/**
 * Pure resolver for keyboard actions in selection mode (no node focused).
 *
 * Returns the action to take, or null if the event is not handled.
 * Phase 1: single-selection basics (navigate, enter edit, type char, clear).
 * Phase 2: extend selection (Shift+Arrow), Cmd+A select all.
 */

export type SelectionKeyboardAction =
  | 'navigate_up'      // ↑ → exit selection, edit prev node (cursor at end)
  | 'navigate_down'    // ↓ → exit selection, edit next node (cursor at start)
  | 'extend_up'        // Shift+↑ → extend selection upward from anchor
  | 'extend_down'      // Shift+↓ → extend selection downward from anchor
  | 'enter_edit'       // Enter → edit first selected node (cursor at end)
  | 'type_char'        // printable char → edit first selected + append char
  | 'clear_selection'  // Escape → clear all selection
  | 'select_all';      // Cmd+A → select all top-level nodes

export function resolveSelectionKeyboardAction(
  e: KeyboardEvent,
): SelectionKeyboardAction | null {
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

  // Printable character: single char, no modifier keys (except Shift for uppercase)
  if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
    return 'type_char';
  }

  return null;
}

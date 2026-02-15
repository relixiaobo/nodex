/**
 * Pure resolver for keyboard actions in selection mode (no node focused).
 *
 * Returns the action to take, or null if the event is not handled.
 * Phase 1: single-selection basics (navigate, enter edit, type char, clear).
 * Phase 2 will add: extend selection (Shift+Arrow), Cmd+A, batch operations.
 */

export type SelectionKeyboardAction =
  | 'navigate_up'      // ↑ → exit selection, edit prev node (cursor at end)
  | 'navigate_down'    // ↓ → exit selection, edit next node (cursor at start)
  | 'enter_edit'       // Enter → edit first selected node (cursor at end)
  | 'type_char'        // printable char → edit first selected + append char
  | 'clear_selection'; // Escape → clear all selection

export function resolveSelectionKeyboardAction(
  e: KeyboardEvent,
): SelectionKeyboardAction | null {
  // Shift+Arrow: reserved for Phase 2 (extend selection)
  if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    return null;
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

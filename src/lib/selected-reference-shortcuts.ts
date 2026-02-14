import { getShortcutKeys, matchesShortcutEvent } from './shortcut-registry.js';

export type SelectedReferenceShortcutAction =
  | 'delete'
  | 'convert_arrow_right'
  | 'convert_printable'
  | 'options_up'
  | 'options_down'
  | 'options_confirm'
  | 'escape';

function isPrintableKey(e: KeyboardEvent): boolean {
  return e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
}

export function resolveSelectedReferenceShortcut(
  e: KeyboardEvent,
  optionsOpen: boolean,
): SelectedReferenceShortcutAction | null {
  const deleteBindings = getShortcutKeys('selected_ref.delete', ['Backspace', 'Delete']);
  const convertArrowBindings = getShortcutKeys('selected_ref.convert_arrow_right', ['ArrowRight']);
  const optionsDownBindings = getShortcutKeys('selected_ref.options_down', ['ArrowDown']);
  const optionsUpBindings = getShortcutKeys('selected_ref.options_up', ['ArrowUp']);
  const optionsConfirmBindings = getShortcutKeys('selected_ref.options_confirm', ['Enter']);
  const optionsCancelBindings = getShortcutKeys('selected_ref.options_cancel', ['Escape']);
  const clearSelectionBindings = getShortcutKeys('selected_ref.clear_selection', ['Escape']);

  if (deleteBindings.some((binding) => matchesShortcutEvent(e, binding))) {
    return 'delete';
  }

  if (!optionsOpen && convertArrowBindings.some((binding) => matchesShortcutEvent(e, binding))) {
    return 'convert_arrow_right';
  }

  if (!optionsOpen && isPrintableKey(e)) {
    return 'convert_printable';
  }

  if (optionsOpen) {
    if (optionsDownBindings.some((binding) => matchesShortcutEvent(e, binding))) return 'options_down';
    if (optionsUpBindings.some((binding) => matchesShortcutEvent(e, binding))) return 'options_up';
    if (optionsConfirmBindings.some((binding) => matchesShortcutEvent(e, binding))) return 'options_confirm';
    if (optionsCancelBindings.some((binding) => matchesShortcutEvent(e, binding))) return 'escape';
    return null;
  }

  if (clearSelectionBindings.some((binding) => matchesShortcutEvent(e, binding))) return 'escape';
  return null;
}

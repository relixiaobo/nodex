export type RowPointerSelectAction = 'single' | 'toggle' | 'range' | null;

export function resolveRowPointerSelectAction(params: {
  justDragged: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  isEditing?: boolean;
  allowSingle?: boolean;
}): RowPointerSelectAction {
  if (params.justDragged) return null;
  if (params.isEditing) return null;

  if (params.metaKey || params.ctrlKey) return 'toggle';
  if (params.shiftKey) return 'range';

  return params.allowSingle ? 'single' : null;
}

export function shouldClearSelectionOnPointerDown(target: HTMLElement | null): boolean {
  // Keep selection when interacting with a batch-action popup (e.g. BatchTagSelector).
  if (target?.closest('[data-preserve-selection]')) return false;

  // Unmodified pointer interactions should always exit multi-selection mode.
  return true;
}

function isOutlinerRowTarget(target: HTMLElement | null): boolean {
  if (!target) return false;
  return !!target.closest('[data-node-id][data-parent-id], [data-field-row]');
}

export function shouldClearSelectionOnFocusIn(target: HTMLElement | null): boolean {
  // Keep selection while focus remains inside a concrete outliner row/editor.
  // Clear when focus moves to any non-row surface (sidebar, toolbar, blank chrome, etc.).
  if (isOutlinerRowTarget(target)) return false;

  // Keep selection when focus moves into a batch-action popup (e.g. BatchTagSelector).
  if (target?.closest('[data-preserve-selection]')) return false;

  return true;
}

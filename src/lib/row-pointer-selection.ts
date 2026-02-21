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
  if (!target) return true;

  if (
    target.closest('[data-node-id]') ||
    target.closest('[data-field-row]') ||
    target.closest('[data-trailing-parent-id]') ||
    target.closest('.ProseMirror')
  ) {
    return false;
  }

  return true;
}

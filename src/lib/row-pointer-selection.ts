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

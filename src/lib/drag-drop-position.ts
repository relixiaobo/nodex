export type DropHoverPosition = 'before' | 'after' | 'inside';

interface ResolveDropHoverPositionParams {
  offsetY: number;
  rowHeight: number;
}

/**
 * Split a row into 3 vertical zones:
 * top third -> before, middle third -> inside, bottom third -> after.
 */
export function resolveDropHoverPosition(
  params: ResolveDropHoverPositionParams,
): DropHoverPosition {
  const { offsetY, rowHeight } = params;
  if (rowHeight <= 0) return 'inside';

  const third = rowHeight / 3;
  if (offsetY < third) return 'before';
  if (offsetY > third * 2) return 'after';
  return 'inside';
}

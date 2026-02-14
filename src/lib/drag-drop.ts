export type DropPosition = 'before' | 'after' | 'inside' | null;

export interface ResolveDropMoveInput {
  dragNodeId: string | null;
  targetNodeId: string;
  targetParentId: string | undefined;
  targetParentKey: string;
  siblingIndex: number;
  dropPosition: DropPosition;
  targetHasChildren: boolean;
  targetIsExpanded: boolean;
}

export interface DropMoveDecision {
  newParentId: string;
  position: number;
  expandKey?: string;
}

/**
 * Resolve drag-drop semantics for an outliner row target.
 * Pure decision helper used by OutlinerItem and unit tests.
 */
export function resolveDropMove(input: ResolveDropMoveInput): DropMoveDecision | null {
  const {
    dragNodeId,
    targetNodeId,
    targetParentId,
    targetParentKey,
    siblingIndex,
    dropPosition,
    targetHasChildren,
    targetIsExpanded,
  } = input;

  if (!dragNodeId || dragNodeId === targetNodeId || !targetParentId) return null;

  if (dropPosition === 'before') {
    return {
      newParentId: targetParentId,
      position: siblingIndex,
    };
  }

  if (dropPosition === 'after') {
    if (targetHasChildren && targetIsExpanded) {
      return {
        newParentId: targetNodeId,
        position: 0,
      };
    }
    return {
      newParentId: targetParentId,
      position: siblingIndex + 1,
    };
  }

  if (dropPosition === 'inside') {
    return {
      newParentId: targetNodeId,
      position: 0,
      expandKey: targetParentKey,
    };
  }

  return null;
}

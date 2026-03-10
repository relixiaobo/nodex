import { isOutlinerContentNodeType, resolveEffectiveId } from './node-type-utils.js';
import type { NodeType } from '../types/index.js';
import { t } from '../i18n/strings.js';

export type TreeReferenceBlockReason =
  | 'missing_parent'
  | 'missing_target'
  | 'self_parent'
  | 'would_create_display_cycle';

type ReferenceRulesNode = {
  type?: NodeType;
  targetId?: string;
};

function canReachInDisplayGraph(
  fromEffectiveNodeId: string,
  targetEffectiveNodeId: string,
  opts: {
    getNode: (id: string) => ReferenceRulesNode | null;
    getChildren: (id: string) => string[];
  },
): boolean {
  const visited = new Set<string>();
  const stack = [fromEffectiveNodeId];

  while (stack.length > 0) {
    const currentId = stack.pop()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    for (const childId of opts.getChildren(currentId)) {
      const child = opts.getNode(childId);
      if (!child) continue;

      let nextEffectiveId: string | null = null;
      if (child.type === 'reference' && child.targetId) {
        nextEffectiveId = resolveEffectiveId(childId, opts.getNode);
      } else if (isOutlinerContentNodeType(child.type)) {
        nextEffectiveId = childId;
      }
      if (!nextEffectiveId) continue;

      if (nextEffectiveId === targetEffectiveNodeId) return true;
      if (!visited.has(nextEffectiveId)) stack.push(nextEffectiveId);
    }
  }

  return false;
}

export function getTreeReferenceBlockReason(
  parentId: string,
  targetNodeId: string,
  opts: {
    hasNode: (id: string) => boolean;
    getNode: (id: string) => ReferenceRulesNode | null;
    getChildren: (id: string) => string[];
  },
): TreeReferenceBlockReason | null {
  if (!parentId || !opts.hasNode(parentId)) return 'missing_parent';
  if (!targetNodeId || !opts.hasNode(targetNodeId)) return 'missing_target';
  const effectiveTargetId = resolveEffectiveId(targetNodeId, opts.getNode);
  if (!effectiveTargetId || !opts.hasNode(effectiveTargetId)) return 'missing_target';
  if (parentId === effectiveTargetId) return 'self_parent';
  if (canReachInDisplayGraph(effectiveTargetId, parentId, opts)) return 'would_create_display_cycle';
  return null;
}

export function canCreateTreeReference(
  parentId: string,
  targetNodeId: string,
  opts: {
    hasNode: (id: string) => boolean;
    getNode: (id: string) => ReferenceRulesNode | null;
    getChildren: (id: string) => string[];
  },
): boolean {
  return getTreeReferenceBlockReason(parentId, targetNodeId, opts) === null;
}

export function isReferenceDisplayCycle(
  effectiveNodeId: string,
  ancestorEffectiveNodeIds: readonly string[],
): boolean {
  return ancestorEffectiveNodeIds.includes(effectiveNodeId);
}

export function getTreeReferenceBlockMessage(reason: TreeReferenceBlockReason | null): string {
  switch (reason) {
    case 'self_parent':
      return t('reference.blocked.selfChild');
    case 'would_create_display_cycle':
      return t('reference.blocked.cycle');
    case 'missing_parent':
    case 'missing_target':
    default:
      return t('reference.blocked.unavailable');
  }
}

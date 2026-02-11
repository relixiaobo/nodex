/**
 * Shared field utilities: data type resolution and icon mapping.
 */
import type { LucideIcon } from 'lucide-react';
import { AlignLeft, Calendar, CheckSquare, Hash, Link, List, Mail } from 'lucide-react';
import { SYS_A, SYS_D } from '../types/index.js';
import type { NodexNode } from '../types/index.js';

/**
 * Resolve the data type of an attrDef by walking its children
 * for a Tuple [SYS_A02, SYS_D*].
 */
export function resolveDataType(entities: Record<string, NodexNode>, attrDefId: string): string {
  const attrDef = entities[attrDefId];
  if (!attrDef?.children) return SYS_D.PLAIN;

  for (const childId of attrDef.children) {
    const child = entities[childId];
    if (
      child?.props._docType === 'tuple' &&
      child.children?.[0] === SYS_A.TYPE_CHOICE &&
      child.children.length >= 2
    ) {
      return child.children[1];
    }
  }
  return SYS_D.PLAIN;
}

/**
 * Map a SYS_D data type constant to a lucide icon component.
 */
export function getFieldTypeIcon(dataType: string): LucideIcon {
  switch (dataType) {
    case SYS_D.DATE:
      return Calendar;
    case SYS_D.CHECKBOX:
      return CheckSquare;
    case SYS_D.OPTIONS:
      return List;
    case SYS_D.NUMBER:
    case SYS_D.INTEGER:
      return Hash;
    case SYS_D.URL:
      return Link;
    case SYS_D.EMAIL:
      return Mail;
    default:
      return AlignLeft;
  }
}

/**
 * Resolve option node IDs for an OPTIONS-type attrDef.
 * Options are direct non-tuple children of the attrDef node.
 */
export function resolveFieldOptions(
  entities: Record<string, NodexNode>,
  attrDefId: string,
): string[] {
  const attrDef = entities[attrDefId];
  if (!attrDef?.children) return [];

  return attrDef.children.filter((cid) => {
    const child = entities[cid];
    return child && child.props._docType !== 'tuple';
  });
}

/** Check if a data type is "plain" (uses outliner for values). */
export function isPlainFieldType(dataType: string): boolean {
  return dataType === SYS_D.PLAIN || !dataType;
}

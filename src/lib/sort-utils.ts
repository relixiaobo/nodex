/**
 * Sort utilities for View Toolbar — sort outliner children by field.
 */
import type { NodexNode } from '../types/node.js';

export type SortField = 'name' | 'createdAt' | string; // string = fieldDefId
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

/**
 * Get the sortable text value of a node's field entry.
 * fieldEntry.children[0] is the first value node → use its name.
 */
function getFieldSortValue(
  node: NodexNode,
  fieldDefId: string,
  getNode: (id: string) => NodexNode | null,
): string {
  for (const childId of node.children) {
    const child = getNode(childId);
    if (child?.type === 'fieldEntry' && child.fieldDefId === fieldDefId) {
      // First value node's name
      const firstValueId = child.children[0];
      if (!firstValueId) return '';
      const valueNode = getNode(firstValueId);
      return valueNode?.name ?? '';
    }
  }
  return '';
}

/**
 * Compare two nodes by the given sort config.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export function compareNodes(
  a: NodexNode,
  b: NodexNode,
  config: SortConfig,
  getNode: (id: string) => NodexNode | null,
): number {
  const dir = config.direction === 'desc' ? -1 : 1;

  let cmp: number;
  switch (config.field) {
    case 'name':
      cmp = (a.name ?? '').localeCompare(b.name ?? '');
      break;
    case 'createdAt':
      cmp = a.createdAt - b.createdAt;
      break;
    default: {
      // Sort by field value (fieldDefId)
      const va = getFieldSortValue(a, config.field, getNode);
      const vb = getFieldSortValue(b, config.field, getNode);
      cmp = va.localeCompare(vb);
      break;
    }
  }
  return cmp * dir;
}

/**
 * Sort an array of node IDs by the given config.
 * Returns a new sorted array (does not mutate input).
 */
export function sortNodeIds(
  ids: string[],
  config: SortConfig,
  getNode: (id: string) => NodexNode | null,
): string[] {
  return [...ids].sort((aId, bId) => {
    const a = getNode(aId);
    const b = getNode(bId);
    if (!a || !b) return 0;
    return compareNodes(a, b, config, getNode);
  });
}

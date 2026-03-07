/**
 * Sort utilities for View Toolbar — sort outliner children by field.
 */
import type { NodexNode } from '../types/node.js';

export type SortField = 'name' | 'createdAt' | 'updatedAt' | 'done' | 'doneTime' | 'refCount' | string;
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
 *
 * @param backlinkCounts Optional map of nodeId → backlink count (for 'refCount' sort).
 */
export function compareNodes(
  a: NodexNode,
  b: NodexNode,
  config: SortConfig,
  getNode: (id: string) => NodexNode | null,
  backlinkCounts?: Map<string, number>,
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
    case 'updatedAt':
      cmp = a.updatedAt - b.updatedAt;
      break;
    case 'done':
      // Done nodes sort after not-done (asc: not-done first, done last)
      cmp = (a.completedAt ? 1 : 0) - (b.completedAt ? 1 : 0);
      break;
    case 'doneTime':
      // Nodes without completedAt sort to end (use Infinity so they appear last in asc)
      cmp = (a.completedAt ?? Infinity) - (b.completedAt ?? Infinity);
      break;
    case 'refCount': {
      const ca = backlinkCounts?.get(a.id) ?? 0;
      const cb = backlinkCounts?.get(b.id) ?? 0;
      cmp = ca - cb;
      break;
    }
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
  backlinkCounts?: Map<string, number>,
): string[] {
  return [...ids].sort((aId, bId) => {
    const a = getNode(aId);
    const b = getNode(bId);
    if (!a || !b) return 0;
    return compareNodes(a, b, config, getNode, backlinkCounts);
  });
}

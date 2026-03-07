/**
 * Filter utilities for View Toolbar — filter outliner children by conditions.
 *
 * Each filter condition is a ViewDef child node with:
 *   filterField: 'tags' | 'done' | fieldDefId
 *   filterOp: 'all' | 'any'
 *   filterValues: string[]
 *
 * Multiple conditions are AND'd together.
 * Within a condition, filterOp controls the logic:
 *   'all' = node must match ALL values (used for Tags)
 *   'any' = node must match ANY value (used for fields, done)
 */
import type { NodexNode } from '../types/node.js';

export interface FilterCondition {
  field: string;       // 'tags' | 'done' | fieldDefId
  op: 'all' | 'any';  // logic within values
  values: string[];    // selected values
}

/**
 * Check if a node matches a single filter condition.
 */
export function matchesFilter(
  node: NodexNode,
  filter: FilterCondition,
  getNode: (id: string) => NodexNode | null,
): boolean {
  if (filter.values.length === 0) return true;

  switch (filter.field) {
    case 'tags': {
      const nodeTags = new Set(node.tags);
      if (filter.op === 'all') {
        return filter.values.every((v) => nodeTags.has(v));
      }
      return filter.values.some((v) => nodeTags.has(v));
    }
    case 'done': {
      const isDone = node.completedAt != null;
      const wantDone = filter.values.includes('true');
      const wantNotDone = filter.values.includes('false');
      if (wantDone && wantNotDone) return true;
      if (wantDone) return isDone;
      if (wantNotDone) return !isDone;
      return true;
    }
    default: {
      // Field value filter: check fieldEntry children for matching values
      const fieldValue = getFieldValue(node, filter.field, getNode);
      if (fieldValue.length === 0) return false;
      if (filter.op === 'all') {
        return filter.values.every((v) => fieldValue.includes(v));
      }
      return filter.values.some((v) => fieldValue.includes(v));
    }
  }
}

/**
 * Check if a node matches ALL filter conditions (AND).
 */
export function matchesAllFilters(
  node: NodexNode,
  filters: FilterCondition[],
  getNode: (id: string) => NodexNode | null,
): boolean {
  return filters.every((f) => matchesFilter(node, f, getNode));
}

/**
 * Get the value(s) of a field on a node.
 * Returns array of value names or targetIds.
 */
function getFieldValue(
  node: NodexNode,
  fieldDefId: string,
  getNode: (id: string) => NodexNode | null,
): string[] {
  const values: string[] = [];
  for (const childId of node.children) {
    const child = getNode(childId);
    if (child?.type === 'fieldEntry' && child.fieldDefId === fieldDefId) {
      for (const valId of child.children) {
        const valNode = getNode(valId);
        if (!valNode) continue;
        // Options fields store targetId; plain values store name
        if (valNode.targetId) {
          values.push(valNode.targetId);
        } else if (valNode.name) {
          values.push(valNode.name);
        }
      }
      break;
    }
  }
  return values;
}

/**
 * Tree traversal and manipulation utilities for the outliner.
 *
 * Works with the normalized NodexNode entities in the Zustand store.
 */
import type { NodexNode } from '../types/index.js';

/**
 * Get the visible flattened list of node IDs for the outliner.
 * Only includes nodes whose ancestors are all expanded.
 * Each item includes parentId for reference node disambiguation.
 */
export function getFlattenedVisibleNodes(
  rootChildIds: string[],
  entities: Record<string, NodexNode>,
  expandedNodes: Set<string>,
  rootParentId: string = '',
): Array<{ nodeId: string; depth: number; parentId: string }> {
  const result: Array<{ nodeId: string; depth: number; parentId: string }> = [];

  function traverse(childIds: string[], depth: number, currentParentId: string) {
    for (const childId of childIds) {
      const node = entities[childId];
      if (!node) continue;

      result.push({ nodeId: childId, depth, parentId: currentParentId });

      if (expandedNodes.has(`${currentParentId}:${childId}`) && node.children && node.children.length > 0) {
        traverse(node.children, depth + 1, childId);
      }
    }
  }

  traverse(rootChildIds, 0, rootParentId);
  return result;
}

/**
 * Find the previous visible node in the flattened list.
 * Uses parentId for disambiguation when a node appears in multiple places (references).
 */
export function getPreviousVisibleNode(
  nodeId: string,
  parentId: string,
  flatList: Array<{ nodeId: string; depth: number; parentId: string }>,
): { nodeId: string; parentId: string } | null {
  const index = flatList.findIndex((item) => item.nodeId === nodeId && item.parentId === parentId);
  if (index <= 0) return null;
  const prev = flatList[index - 1];
  return { nodeId: prev.nodeId, parentId: prev.parentId };
}

/**
 * Find the next visible node in the flattened list.
 * Uses parentId for disambiguation when a node appears in multiple places (references).
 */
export function getNextVisibleNode(
  nodeId: string,
  parentId: string,
  flatList: Array<{ nodeId: string; depth: number; parentId: string }>,
): { nodeId: string; parentId: string } | null {
  const index = flatList.findIndex((item) => item.nodeId === nodeId && item.parentId === parentId);
  if (index < 0 || index >= flatList.length - 1) return null;
  const next = flatList[index + 1];
  return { nodeId: next.nodeId, parentId: next.parentId };
}

/**
 * Find the parent node ID by looking up _ownerId.
 */
export function getParentId(
  nodeId: string,
  entities: Record<string, NodexNode>,
): string | null {
  const node = entities[nodeId];
  return node?.props._ownerId ?? null;
}

/**
 * Find the previous sibling of a node within its parent's children array.
 */
export function getPreviousSiblingId(
  nodeId: string,
  entities: Record<string, NodexNode>,
): string | null {
  const parentId = getParentId(nodeId, entities);
  if (!parentId) return null;

  const parent = entities[parentId];
  if (!parent?.children) return null;

  const index = parent.children.indexOf(nodeId);
  if (index <= 0) return null;

  return parent.children[index - 1];
}

/**
 * Find the index of a node within its parent's children array.
 */
export function getNodeIndex(
  nodeId: string,
  entities: Record<string, NodexNode>,
): number {
  const parentId = getParentId(nodeId, entities);
  if (!parentId) return -1;

  const parent = entities[parentId];
  if (!parent?.children) return -1;

  return parent.children.indexOf(nodeId);
}

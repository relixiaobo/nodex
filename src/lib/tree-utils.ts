/**
 * Tree traversal and manipulation utilities for the outliner.
 *
 * Works with the normalized NodexNode entities in the Zustand store.
 */
import type { NodexNode } from '../types/index.js';

/**
 * Get the visible flattened list of node IDs for the outliner.
 * Only includes nodes whose ancestors are all expanded.
 */
export function getFlattenedVisibleNodes(
  rootChildIds: string[],
  entities: Record<string, NodexNode>,
  expandedNodes: Set<string>,
): Array<{ nodeId: string; depth: number }> {
  const result: Array<{ nodeId: string; depth: number }> = [];

  function traverse(childIds: string[], depth: number) {
    for (const childId of childIds) {
      const node = entities[childId];
      if (!node) continue;

      result.push({ nodeId: childId, depth });

      if (expandedNodes.has(childId) && node.children && node.children.length > 0) {
        traverse(node.children, depth + 1);
      }
    }
  }

  traverse(rootChildIds, 0);
  return result;
}

/**
 * Find the previous visible node in the flattened list.
 */
export function getPreviousVisibleNodeId(
  nodeId: string,
  flatList: Array<{ nodeId: string; depth: number }>,
): string | null {
  const index = flatList.findIndex((item) => item.nodeId === nodeId);
  if (index <= 0) return null;
  return flatList[index - 1].nodeId;
}

/**
 * Find the next visible node in the flattened list.
 */
export function getNextVisibleNodeId(
  nodeId: string,
  flatList: Array<{ nodeId: string; depth: number }>,
): string | null {
  const index = flatList.findIndex((item) => item.nodeId === nodeId);
  if (index < 0 || index >= flatList.length - 1) return null;
  return flatList[index + 1].nodeId;
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

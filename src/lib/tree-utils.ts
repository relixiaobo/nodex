/**
 * Tree traversal and manipulation utilities for the outliner.
 *
 * Works with the normalized NodexNode entities in the Zustand store.
 */
import { WORKSPACE_CONTAINERS } from '../types/index.js';
import type { NodexNode } from '../types/index.js';

// ─── Workspace container detection ───

const CONTAINER_SUFFIXES = Object.values(WORKSPACE_CONTAINERS);

/** Check if a node ID is a workspace container (e.g., ws_default_LIBRARY). */
export function isWorkspaceContainer(nodeId: string): boolean {
  return CONTAINER_SUFFIXES.some(suffix => nodeId.endsWith(`_${suffix}`));
}

// ─── Ancestor chain for breadcrumb navigation ───

export interface AncestorInfo {
  id: string;
  name: string;
}

/**
 * Walk _ownerId chain from nodeId up to (but excluding) a workspace container.
 * Returns ancestors ordered root-most → immediate parent (top to bottom).
 * Excludes the current node itself and the workspace container.
 */
export function getAncestorChain(
  nodeId: string,
  entities: Record<string, NodexNode>,
): { ancestors: AncestorInfo[]; rootContainerId: string | null } {
  const chain: AncestorInfo[] = [];
  let currentId = nodeId;
  let rootContainerId: string | null = null;
  const visited = new Set<string>();

  while (true) {
    const node = entities[currentId];
    if (!node) break;

    const parentId = node.props._ownerId;
    if (!parentId || visited.has(parentId)) break;
    visited.add(parentId);

    // Stop at workspace container — record it but don't add to chain
    if (isWorkspaceContainer(parentId)) {
      rootContainerId = parentId;
      break;
    }

    // Stop at workspace root (no _ownerId or is workspace node itself)
    const parentNode = entities[parentId];
    if (!parentNode || !parentNode.props._ownerId) {
      rootContainerId = parentId;
      break;
    }

    // Add parent to chain (will be reversed later)
    const rawName = parentNode.props.name ?? '';
    const displayName = rawName.replace(/<[^>]+>/g, '') || parentId;
    chain.push({ id: parentId, name: displayName });

    currentId = parentId;
  }

  return { ancestors: chain.reverse(), rootContainerId };
}

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

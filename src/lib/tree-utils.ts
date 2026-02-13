/**
 * Tree traversal and manipulation utilities for the outliner.
 *
 * Works with the normalized NodexNode entities in the Zustand store.
 */
import { WORKSPACE_CONTAINERS } from '../types/index.js';
import type { NodexNode } from '../types/index.js';

// ─── Workspace container / root detection ───

const CONTAINER_SUFFIXES = Object.values(WORKSPACE_CONTAINERS);

/** Check if a node ID is a workspace container (e.g., ws_default_LIBRARY). */
export function isWorkspaceContainer(nodeId: string): boolean {
  return CONTAINER_SUFFIXES.some(suffix => nodeId.endsWith(`_${suffix}`));
}

/** Check if a node is a workspace root (id === workspaceId). */
export function isWorkspaceRoot(nodeId: string, entities: Record<string, NodexNode>): boolean {
  const node = entities[nodeId];
  return !!node && node.id === node.workspaceId && !node.props._ownerId;
}

// ─── Structural node detection ───

/** Structural doc types that are not meaningful navigation targets. */
const STRUCTURAL_DOC_TYPES = new Set(['tuple', 'metanode', 'associatedData']);

/** Check if a node is a structural node (tuple/metanode/associatedData). */
function isStructuralNode(node: NodexNode): boolean {
  return !!node.props._docType && STRUCTURAL_DOC_TYPES.has(node.props._docType);
}

// ─── Ancestor chain for breadcrumb navigation ───

export interface AncestorInfo {
  id: string;
  name: string;
}

/**
 * Walk _ownerId chain from nodeId up to (but excluding) the workspace root.
 * Returns ancestors ordered root-most → immediate parent (top to bottom).
 * Containers are included as normal ancestors. The workspace root is recorded
 * separately as `workspaceRootId`.
 *
 * Structural nodes (tuple, metanode, associatedData) are skipped — they are
 * not meaningful navigation targets.
 */
export function getAncestorChain(
  nodeId: string,
  entities: Record<string, NodexNode>,
): { ancestors: AncestorInfo[]; workspaceRootId: string | null } {
  const chain: AncestorInfo[] = [];
  let currentId = nodeId;
  let workspaceRootId: string | null = null;
  const visited = new Set<string>();

  while (true) {
    const node = entities[currentId];
    if (!node) break;

    const parentId = node.props._ownerId;
    if (!parentId || visited.has(parentId)) break;
    visited.add(parentId);

    // Stop at workspace root — record it but don't add to chain
    if (isWorkspaceRoot(parentId, entities)) {
      workspaceRootId = parentId;
      break;
    }

    const parentNode = entities[parentId];
    if (!parentNode) break;

    // Skip structural nodes (tuple/metanode/associatedData) — continue walking up
    if (isStructuralNode(parentNode)) {
      currentId = parentId;
      continue;
    }

    // Add parent to chain (will be reversed later) — containers included
    const rawName = parentNode.props.name ?? '';
    const displayName = rawName.replace(/<[^>]+>/g, '') || parentId;
    chain.push({ id: parentId, name: displayName });

    currentId = parentId;
  }

  return { ancestors: chain.reverse(), workspaceRootId };
}

/**
 * Find the first navigable (non-structural) parent of a node.
 * Skips tuple, metanode, and associatedData nodes.
 */
export function getNavigableParentId(
  nodeId: string,
  entities: Record<string, NodexNode>,
): string | null {
  let currentId = nodeId;
  const visited = new Set<string>();

  while (true) {
    const node = entities[currentId];
    if (!node) return null;

    const parentId = node.props._ownerId;
    if (!parentId || visited.has(parentId)) return null;
    visited.add(parentId);

    const parentNode = entities[parentId];
    if (!parentNode) return null;

    // Skip structural nodes
    if (isStructuralNode(parentNode)) {
      currentId = parentId;
      continue;
    }

    return parentId;
  }
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
 * Find the last visible node before a TrailingInput position.
 *
 * Starting from the parent's last visible content child, walks down
 * expanded descendants to find the deepest visible leaf. This is the
 * node that should receive focus on Backspace in TrailingInput.
 *
 * Returns null if the parent has no visible content children.
 */
export function getLastVisibleNode(
  parentId: string,
  entities: Record<string, NodexNode>,
  expandedNodes: Set<string>,
): { nodeId: string; parentId: string } | null {
  const parent = entities[parentId];
  if (!parent?.children?.length) return null;

  // Filter for visible content nodes (no docType = regular content)
  const visibleChildren = parent.children.filter(
    (cid) => !entities[cid]?.props._docType,
  );
  if (visibleChildren.length === 0) return null;

  // Start from the last visible child and walk down
  let currentId = visibleChildren[visibleChildren.length - 1];
  let currentParentId = parentId;

  while (true) {
    const expandKey = `${currentParentId}:${currentId}`;
    if (!expandedNodes.has(expandKey)) break;

    const node = entities[currentId];
    if (!node?.children?.length) break;

    const childVisible = node.children.filter(
      (cid) => !entities[cid]?.props._docType,
    );
    if (childVisible.length === 0) break;

    currentParentId = currentId;
    currentId = childVisible[childVisible.length - 1];
  }

  return { nodeId: currentId, parentId: currentParentId };
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
 * Check if HTML content is only a single inline reference (no additional text).
 * Empty content also returns true (treat as revertable).
 */
export function isOnlyInlineRef(html: string): boolean {
  if (!html?.trim()) return true;
  const div = document.createElement('div');
  div.innerHTML = html.trim();
  const inlineRefs = div.querySelectorAll('[data-inlineref-node]');
  if (inlineRefs.length !== 1) return false;
  const allText = div.textContent?.trim() ?? '';
  const refText = inlineRefs[0].textContent?.trim() ?? '';
  return allText === refText;
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

/**
 * Tree traversal and manipulation utilities for the outliner.
 *
 * Uses LoroDoc as the source of truth. All node lookups go through loroDoc.toNodexNode().
 */
import type { NodexNode } from '../types/index.js';
import { buildExpandedNodeKey } from './expanded-node-key.js';
import { isOutlinerContentNodeType, resolveEffectiveId } from './node-type-utils.js';
import * as loroDoc from './loro-doc.js';

// ─── Structural node detection ───

/** Structural node types that are not meaningful navigation targets. */
const STRUCTURAL_TYPES = new Set<string | undefined>(['fieldEntry', 'reference']);

/** Check if a node is a structural node (fieldEntry, reference). */
function isStructuralNode(node: NodexNode): boolean {
  return STRUCTURAL_TYPES.has(node.type);
}

// ─── Ancestor chain for breadcrumb navigation ───

export interface AncestorInfo {
  id: string;
  name: string;
}

/**
 * Walk the LoroTree parent chain from nodeId up to the root.
 * Returns ancestors ordered root-most → immediate parent (top to bottom).
 * Structural nodes (fieldEntry, reference) are skipped.
 */
export function getAncestorChain(
  nodeId: string,
): { ancestors: AncestorInfo[]; workspaceRootId: string | null } {
  const chain: AncestorInfo[] = [];
  let currentId = nodeId;
  let workspaceRootId: string | null = null;
  const visited = new Set<string>();

  while (true) {
    const parentId = loroDoc.getParentId(currentId);
    if (!parentId || visited.has(parentId)) break;
    visited.add(parentId);

    const parentNode = loroDoc.toNodexNode(parentId);
    if (!parentNode) break;
    const isWorkspaceRoot = loroDoc.getParentId(parentId) === null;
    if (isWorkspaceRoot) {
      workspaceRootId = parentId;
    }

    // Skip structural nodes — continue walking up
    if (isStructuralNode(parentNode)) {
      currentId = parentId;
      if (isWorkspaceRoot) break;
      continue;
    }

    // Add parent to chain (will be reversed later)
    const rawName = parentNode.name ?? '';
    const displayName = rawName.trim() || parentId;
    chain.push({ id: parentId, name: displayName });

    currentId = parentId;
    if (isWorkspaceRoot) break;
  }

  return { ancestors: chain.reverse(), workspaceRootId };
}

/**
 * Find the first navigable (non-structural) parent of a node.
 * Skips fieldEntry and reference nodes.
 */
export function getNavigableParentId(nodeId: string): string | null {
  let currentId = nodeId;
  const visited = new Set<string>();

  while (true) {
    const parentId = loroDoc.getParentId(currentId);
    if (!parentId || visited.has(parentId)) return null;
    visited.add(parentId);

    const parentNode = loroDoc.toNodexNode(parentId);
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
 *
 * @param getVisualChildIds Optional callback to get visual-order children
 *   (e.g. template fields first) instead of data-order `node.children`.
 *   Falls back to `node.children` when not provided.
 */
export function getFlattenedVisibleNodes(
  rootChildIds: string[],
  expandedNodes: Set<string>,
  rootParentId: string = '',
  panelId: string = 'main',
  getVisualChildIds?: (nodeId: string) => string[],
): Array<{ nodeId: string; depth: number; parentId: string }> {
  void panelId;
  const result: Array<{ nodeId: string; depth: number; parentId: string }> = [];

  function traverse(childIds: string[], depth: number, currentParentId: string) {
    for (const childId of childIds) {
      const node = loroDoc.toNodexNode(childId);
      if (!node) continue;

      result.push({ nodeId: childId, depth, parentId: currentParentId });

      if (
        expandedNodes.has(buildExpandedNodeKey(currentParentId, childId)) &&
        node.children.length > 0
      ) {
        const nextChildIds = getVisualChildIds
          ? getVisualChildIds(childId)
          : node.children;
        traverse(nextChildIds, depth + 1, childId);
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
 * expanded descendants to find the deepest visible leaf.
 */
export function getLastVisibleNode(
  parentId: string,
  expandedNodes: Set<string>,
  panelId: string = 'main',
): { nodeId: string; parentId: string } | null {
  void panelId;
  const parentChildren = loroDoc.getChildren(parentId);
  if (!parentChildren.length) return null;

  // Filter for visible content nodes (no structural type = regular content)
  const visibleChildren = parentChildren.filter((cid) => {
    const n = loroDoc.toNodexNode(cid);
    return !!n && isOutlinerContentNodeType(n.type);
  });
  if (visibleChildren.length === 0) return null;

  // Start from the last visible child and walk down
  let currentId = visibleChildren[visibleChildren.length - 1];
  let currentParentId = parentId;

  while (true) {
    const expandKey = buildExpandedNodeKey(currentParentId, currentId);
    if (!expandedNodes.has(expandKey)) break;

    const childrenIds = loroDoc.getChildren(currentId);
    if (!childrenIds.length) break;

    const childVisible = childrenIds.filter((cid) => {
      const n = loroDoc.toNodexNode(cid);
      return !!n && isOutlinerContentNodeType(n.type);
    });
    if (childVisible.length === 0) break;

    currentParentId = currentId;
    currentId = childVisible[childVisible.length - 1];
  }

  return { nodeId: currentId, parentId: currentParentId };
}

/**
 * Find the parent node ID via LoroTree.
 */
export function getParentId(nodeId: string): string | null {
  return loroDoc.getParentId(nodeId);
}

/**
 * Find the previous sibling of a node within its parent's children array.
 */
export function getPreviousSiblingId(nodeId: string): string | null {
  const parentId = loroDoc.getParentId(nodeId);
  if (!parentId) return null;

  const siblings = loroDoc.getChildren(parentId);
  const index = siblings.indexOf(nodeId);
  if (index <= 0) return null;

  return siblings[index - 1];
}

/**
 * Check if content is only a single inline reference (no additional text).
 * Empty content also returns true (treat as revertable).
 */
export function isOnlyInlineRef(content: string, inlineRefs?: Array<{ offset: number }>): boolean {
  const normalized = (content ?? '').replace(/\u200B/g, '').trim();
  if (!normalized) return true;

  return normalized === '\uFFFC' && !!inlineRefs && inlineRefs.length === 1 && inlineRefs[0]?.offset === 0;
}

/**
 * Find the index of a node within its parent's children array.
 */
export function getNodeIndex(nodeId: string): number {
  const parentId = loroDoc.getParentId(nodeId);
  if (!parentId) return -1;

  const siblings = loroDoc.getChildren(parentId);
  return siblings.indexOf(nodeId);
}

/**
 * Get the text length of a node by ID.
 * For reference nodes, returns the length of the target node's name.
 */
export function getNodeTextLengthById(nodeId: string): number {
  const effectiveId = resolveEffectiveId(nodeId);
  return (loroDoc.toNodexNode(effectiveId)?.name ?? '').length;
}

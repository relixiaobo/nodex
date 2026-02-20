/**
 * Tree traversal and manipulation utilities for the outliner.
 *
 * Uses LoroDoc as the source of truth. All node lookups go through loroDoc.toNodexNode().
 */
import { isContainerNode } from '../types/index.js';
import type { NodexNode } from '../types/index.js';
import * as loroDoc from './loro-doc.js';

// ─── Container / root detection ───

/** Check if a node ID is a workspace container (LIBRARY, INBOX, etc.). */
export function isWorkspaceContainer(nodeId: string): boolean {
  return isContainerNode(nodeId);
}

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

    // If parent is a container node, record as workspace root, add it to chain, and stop
    if (isContainerNode(parentId)) {
      workspaceRootId = parentId;
      const containerNode = loroDoc.toNodexNode(parentId);
      if (containerNode) {
        const rawName = containerNode.name ?? '';
        const displayName = rawName.replace(/<[^>]+>/g, '') || parentId;
        chain.push({ id: parentId, name: displayName });
      }
      break;
    }

    const parentNode = loroDoc.toNodexNode(parentId);
    if (!parentNode) break;

    // Skip structural nodes — continue walking up
    if (isStructuralNode(parentNode)) {
      currentId = parentId;
      continue;
    }

    // Add parent to chain (will be reversed later)
    const rawName = parentNode.name ?? '';
    const displayName = rawName.replace(/<[^>]+>/g, '') || parentId;
    chain.push({ id: parentId, name: displayName });

    currentId = parentId;
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
 */
export function getFlattenedVisibleNodes(
  rootChildIds: string[],
  expandedNodes: Set<string>,
  rootParentId: string = '',
): Array<{ nodeId: string; depth: number; parentId: string }> {
  const result: Array<{ nodeId: string; depth: number; parentId: string }> = [];

  function traverse(childIds: string[], depth: number, currentParentId: string) {
    for (const childId of childIds) {
      const node = loroDoc.toNodexNode(childId);
      if (!node) continue;

      result.push({ nodeId: childId, depth, parentId: currentParentId });

      if (
        expandedNodes.has(`${currentParentId}:${childId}`) &&
        node.children.length > 0
      ) {
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
 * expanded descendants to find the deepest visible leaf.
 */
export function getLastVisibleNode(
  parentId: string,
  expandedNodes: Set<string>,
): { nodeId: string; parentId: string } | null {
  const parentChildren = loroDoc.getChildren(parentId);
  if (!parentChildren.length) return null;

  // Filter for visible content nodes (no structural type = regular content)
  const visibleChildren = parentChildren.filter((cid) => {
    const n = loroDoc.toNodexNode(cid);
    return n && !n.type;
  });
  if (visibleChildren.length === 0) return null;

  // Start from the last visible child and walk down
  let currentId = visibleChildren[visibleChildren.length - 1];
  let currentParentId = parentId;

  while (true) {
    const expandKey = `${currentParentId}:${currentId}`;
    if (!expandedNodes.has(expandKey)) break;

    const childrenIds = loroDoc.getChildren(currentId);
    if (!childrenIds.length) break;

    const childVisible = childrenIds.filter((cid) => {
      const n = loroDoc.toNodexNode(cid);
      return n && !n.type;
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

  // New model: '\uFFFC' + one inlineRef entry at offset 0
  if (inlineRefs && inlineRefs.length > 0) {
    return normalized === '\uFFFC' && inlineRefs.length === 1 && inlineRefs[0]?.offset === 0;
  }

  // Legacy fallback: HTML inline-ref span
  if (normalized === '\uFFFC') return true;

  const div = document.createElement('div');
  div.innerHTML = normalized;
  const inlineRefEls = div.querySelectorAll('[data-inlineref-node]');
  if (inlineRefEls.length !== 1) return false;
  const allText = div.textContent?.trim() ?? '';
  const refText = inlineRefEls[0].textContent?.trim() ?? '';
  return allText === refText;
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

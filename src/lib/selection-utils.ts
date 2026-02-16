/**
 * Pure selection utilities for multi-select operations.
 *
 * Core principle: selecting a parent = implicitly selecting all descendants.
 * The selection set only stores root-level selected node IDs.
 */
import type { NodexNode } from '../types/index.js';

/**
 * Check if a node is selected — either directly or via a selected ancestor.
 * Walks up the _ownerId chain looking for any node in selectedIds.
 */
export function isNodeOrAncestorSelected(
  nodeId: string,
  selectedIds: Set<string>,
  entities: Record<string, NodexNode>,
): boolean {
  if (selectedIds.size === 0) return false;
  if (selectedIds.has(nodeId)) return true;

  let current = nodeId;
  const visited = new Set<string>();
  while (true) {
    const node = entities[current];
    if (!node) return false;
    const parentId = node.props._ownerId;
    if (!parentId || visited.has(parentId)) return false;
    visited.add(parentId);
    if (selectedIds.has(parentId)) return true;
    current = parentId;
  }
}

/**
 * Check if nodeId has a selected ancestor (not counting itself).
 */
export function hasSelectedAncestor(
  nodeId: string,
  selectedIds: Set<string>,
  entities: Record<string, NodexNode>,
): boolean {
  if (selectedIds.size === 0) return false;
  const node = entities[nodeId];
  if (!node) return false;
  const parentId = node.props._ownerId;
  if (!parentId) return false;
  return isNodeOrAncestorSelected(parentId, selectedIds, entities);
}

/**
 * Check if nodeId is an ancestor of candidateDescendant.
 */
function isAncestorOf(
  ancestorId: string,
  descendantId: string,
  entities: Record<string, NodexNode>,
): boolean {
  let current = descendantId;
  const visited = new Set<string>();
  while (true) {
    const node = entities[current];
    if (!node) return false;
    const parentId = node.props._ownerId;
    if (!parentId || visited.has(parentId)) return false;
    visited.add(parentId);
    if (parentId === ancestorId) return true;
    current = parentId;
  }
}

/**
 * Cmd+Click: toggle a node in the selection with sub-tree merge/absorb rules.
 *
 * - If node already selected → remove it
 * - If node has a selected ancestor → ignore (already covered)
 * - If node is ancestor of selected nodes → absorb: remove descendants, add ancestor
 * - Otherwise → add to selection
 */
export function toggleNodeInSelection(
  nodeId: string,
  currentSelection: Set<string>,
  entities: Record<string, NodexNode>,
): Set<string> {
  // Already directly selected → deselect
  if (currentSelection.has(nodeId)) {
    const next = new Set(currentSelection);
    next.delete(nodeId);
    return next;
  }

  // Has a selected ancestor → ignore (already implicitly selected)
  if (hasSelectedAncestor(nodeId, currentSelection, entities)) {
    return currentSelection;
  }

  // Check if this node is an ancestor of any currently selected nodes → absorb
  const next = new Set(currentSelection);
  let absorbed = false;
  for (const selectedId of currentSelection) {
    if (isAncestorOf(nodeId, selectedId, entities)) {
      next.delete(selectedId);
      absorbed = true;
    }
  }

  // Add the node (whether it absorbed descendants or is a new addition)
  next.add(nodeId);
  return next;
}

/**
 * Compute range selection between anchor and target in the visible node list.
 * Returns the set of visible node IDs between them (inclusive), filtered to root-level.
 */
export function computeRangeSelection(
  anchorId: string,
  targetId: string,
  flatList: Array<{ nodeId: string; parentId: string }>,
  entities: Record<string, NodexNode>,
): Set<string> {
  const anchorIdx = flatList.findIndex((n) => n.nodeId === anchorId);
  const targetIdx = flatList.findIndex((n) => n.nodeId === targetId);

  if (anchorIdx < 0 || targetIdx < 0) {
    return new Set([anchorId, targetId].filter(Boolean));
  }

  const start = Math.min(anchorIdx, targetIdx);
  const end = Math.max(anchorIdx, targetIdx);

  const rangeIds = new Set<string>();
  for (let i = start; i <= end; i++) {
    rangeIds.add(flatList[i].nodeId);
  }

  return filterToRootLevel(rangeIds, entities);
}

/**
 * Filter a set of node IDs to only root-level: remove any node whose ancestor
 * is also in the set. This enforces "select parent = select all descendants".
 */
export function filterToRootLevel(
  nodeIds: Set<string>,
  entities: Record<string, NodexNode>,
): Set<string> {
  const result = new Set<string>();
  for (const id of nodeIds) {
    if (!hasSelectedAncestor(id, nodeIds, entities)) {
      result.add(id);
    }
  }
  return result;
}

/**
 * Get the first selected node ID in visible order (for Enter/type-char behavior).
 */
export function getFirstSelectedInOrder(
  selectedIds: Set<string>,
  flatList: Array<{ nodeId: string; parentId: string }>,
): { nodeId: string; parentId: string } | null {
  for (const item of flatList) {
    if (selectedIds.has(item.nodeId)) return item;
  }
  return null;
}

/**
 * Get effective selection bounds including implicitly selected descendants.
 * When a parent is selected, all its visible descendants count toward the bounds.
 * Returns flat-list indices (not node references) for use in extend operations.
 */
export function getEffectiveSelectionBounds(
  selectedIds: Set<string>,
  flatList: Array<{ nodeId: string; parentId: string }>,
  entities: Record<string, NodexNode>,
): { firstIdx: number; lastIdx: number } | null {
  let firstIdx = -1;
  let lastIdx = -1;

  for (let i = 0; i < flatList.length; i++) {
    if (isNodeOrAncestorSelected(flatList[i].nodeId, selectedIds, entities)) {
      if (firstIdx < 0) firstIdx = i;
      lastIdx = i;
    }
  }

  return firstIdx >= 0 ? { firstIdx, lastIdx } : null;
}

/**
 * Get the topmost and bottommost selected nodes in visible order.
 * Used for ↑/↓ navigation from multi-select.
 */
export function getSelectionBounds(
  selectedIds: Set<string>,
  flatList: Array<{ nodeId: string; parentId: string }>,
): { first: { nodeId: string; parentId: string }; last: { nodeId: string; parentId: string } } | null {
  let first: { nodeId: string; parentId: string } | null = null;
  let last: { nodeId: string; parentId: string } | null = null;

  for (const item of flatList) {
    if (selectedIds.has(item.nodeId)) {
      if (!first) first = item;
      last = item;
    }
  }

  return first && last ? { first, last } : null;
}

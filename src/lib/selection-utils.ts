/**
 * Pure selection utilities for multi-select operations.
 *
 * Core principle: selecting a parent = implicitly selecting all descendants.
 * The selection set only stores root-level selected node IDs.
 */
import * as loroDoc from './loro-doc.js';

/**
 * Check if a node is selected — either directly or via a selected ancestor.
 * Walks up the parent chain (via loroDoc) looking for any node in selectedIds.
 */
export function isNodeOrAncestorSelected(
  nodeId: string,
  selectedIds: Set<string>,
  _entities?: unknown,
): boolean {
  if (selectedIds.size === 0) return false;
  if (selectedIds.has(nodeId)) return true;

  let current = nodeId;
  const visited = new Set<string>();
  while (true) {
    const parentId = loroDoc.getParentId(current);
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
  _entities?: unknown,
): boolean {
  if (selectedIds.size === 0) return false;
  const parentId = loroDoc.getParentId(nodeId);
  if (!parentId) return false;
  return isNodeOrAncestorSelected(parentId, selectedIds);
}

/**
 * Check if nodeId is an ancestor of candidateDescendant.
 */
function isAncestorOf(
  ancestorId: string,
  descendantId: string,
  _entities?: unknown,
): boolean {
  let current = descendantId;
  const visited = new Set<string>();
  while (true) {
    const parentId = loroDoc.getParentId(current);
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
  _entities?: unknown,
): Set<string> {
  // Already directly selected → deselect
  if (currentSelection.has(nodeId)) {
    const next = new Set(currentSelection);
    next.delete(nodeId);
    return next;
  }

  // Has a selected ancestor → ignore (already implicitly selected)
  if (hasSelectedAncestor(nodeId, currentSelection)) {
    return currentSelection;
  }

  // Check if this node is an ancestor of any currently selected nodes → absorb
  const next = new Set(currentSelection);
  for (const selectedId of currentSelection) {
    if (isAncestorOf(nodeId, selectedId)) {
      next.delete(selectedId);
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
  _entities?: unknown,
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

  return filterToRootLevel(rangeIds, undefined, flatList);
}

/**
 * Check if a node has a display-tree ancestor in the given set.
 * Walks up the flatList parentId chain (visual hierarchy) instead of _ownerId.
 */
function hasDisplayAncestorInSet(
  nodeId: string,
  nodeIds: Set<string>,
  displayParent: Map<string, string>,
): boolean {
  let current = displayParent.get(nodeId);
  const visited = new Set<string>();
  while (current) {
    if (visited.has(current)) return false;
    visited.add(current);
    if (nodeIds.has(current)) return true;
    current = displayParent.get(current);
  }
  return false;
}

/**
 * Filter a set of node IDs to only root-level: remove any node whose ancestor
 * is also in the set.
 *
 * When flatList is provided, uses display-tree hierarchy (parentId from flatList).
 */
export function filterToRootLevel(
  nodeIds: Set<string>,
  _entities?: unknown,
  flatList?: Array<{ nodeId: string; parentId: string }>,
): Set<string> {
  if (flatList) {
    const displayParent = new Map<string, string>();
    for (const item of flatList) {
      displayParent.set(item.nodeId, item.parentId);
    }
    const result = new Set<string>();
    for (const id of nodeIds) {
      if (!hasDisplayAncestorInSet(id, nodeIds, displayParent)) {
        result.add(id);
      }
    }
    return result;
  }
  const result = new Set<string>();
  for (const id of nodeIds) {
    if (!hasSelectedAncestor(id, nodeIds)) {
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
 * Check if a node is selected or has a display-ancestor that is selected.
 */
function isNodeOrDisplayAncestorSelected(
  nodeId: string,
  selectedIds: Set<string>,
  displayParent: Map<string, string>,
): boolean {
  if (selectedIds.has(nodeId)) return true;
  let current = displayParent.get(nodeId);
  const visited = new Set<string>();
  while (current) {
    if (visited.has(current)) return false;
    visited.add(current);
    if (selectedIds.has(current)) return true;
    current = displayParent.get(current);
  }
  return false;
}

/**
 * Get effective selection bounds including implicitly selected descendants.
 */
export function getEffectiveSelectionBounds(
  selectedIds: Set<string>,
  flatList: Array<{ nodeId: string; parentId: string }>,
  _entities?: unknown,
): { firstIdx: number; lastIdx: number } | null {
  const displayParent = new Map<string, string>();
  for (const item of flatList) {
    displayParent.set(item.nodeId, item.parentId);
  }

  let firstIdx = -1;
  let lastIdx = -1;

  for (let i = 0; i < flatList.length; i++) {
    if (isNodeOrDisplayAncestorSelected(flatList[i].nodeId, selectedIds, displayParent)) {
      if (firstIdx < 0) firstIdx = i;
      lastIdx = i;
    }
  }

  return firstIdx >= 0 ? { firstIdx, lastIdx } : null;
}

/**
 * Return the selected node IDs in visible (flat-list) order.
 */
export function getSelectedIdsInOrder(
  selectedIds: Set<string>,
  flatList: Array<{ nodeId: string; parentId: string }>,
): string[] {
  return flatList
    .filter((item) => selectedIds.has(item.nodeId))
    .map((item) => item.nodeId);
}

/**
 * Get the topmost and bottommost selected nodes in visible order.
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

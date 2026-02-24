/**
 * Search engine — recursive condition tree evaluation over Loro in-memory nodes.
 *
 * Evaluates a search node's query condition children against all searchable nodes.
 * Supports AND/OR/NOT logic groups and HAS_TAG leaf conditions (Phase 1).
 */
import * as loroDoc from './loro-doc.js';
import { isWorkspaceContainer } from './tree-utils.js';
import { CONTAINER_IDS } from '../types/index.js';

// ── Node types excluded from search results ──
const SKIP_TYPES = new Set<string>([
  'fieldEntry', 'fieldDef', 'tagDef', 'reference', 'queryCondition', 'search', 'viewDef',
]);

/**
 * Execute a search by evaluating the search node's condition tree
 * against all searchable nodes in the workspace.
 */
export function executeSearch(searchNodeId: string): string[] {
  const children = loroDoc.getChildren(searchNodeId);
  // Find the root condition group (first queryCondition child)
  const rootGroupId = children.find((id) => {
    const n = loroDoc.toNodexNode(id);
    return n?.type === 'queryCondition';
  });
  if (!rootGroupId) return [];

  const candidates = getAllSearchableNodes();
  return candidates.filter((id) => evaluateNode(rootGroupId, id));
}

/**
 * Recursively evaluate a condition node against a candidate node.
 */
function evaluateNode(conditionId: string, nodeId: string): boolean {
  const cond = loroDoc.toNodexNode(conditionId);
  if (!cond) return false;

  // Group node: recurse into children with logic combinator
  if (cond.queryLogic) {
    const children = loroDoc.getChildren(conditionId);
    switch (cond.queryLogic) {
      case 'AND':
        return children.every((c) => evaluateNode(c, nodeId));
      case 'OR':
        return children.some((c) => evaluateNode(c, nodeId));
      case 'NOT':
        return !children.some((c) => evaluateNode(c, nodeId));
      default:
        return false;
    }
  }

  // Leaf node: evaluate specific operator
  switch (cond.queryOp) {
    case 'HAS_TAG': {
      if (!cond.queryTargetTag) return false;
      const hierarchy = collectTagHierarchy(cond.queryTargetTag);
      const nodeTags = loroDoc.getTags(nodeId);
      return nodeTags.some((t) => hierarchy.has(t));
    }
    case 'TODO': {
      const n = loroDoc.toNodexNode(nodeId);
      return !!n?.showCheckbox && !n.completedAt;
    }
    case 'DONE': {
      const n = loroDoc.toNodexNode(nodeId);
      return !!n?.showCheckbox && !!n.completedAt;
    }
    default:
      return false;
  }
}

/**
 * Collect a tag and all its descendant tagDefs (via `extends` chain).
 * Used for polymorphic search: searching for a parent tag includes child tags.
 */
export function collectTagHierarchy(tagDefId: string): Set<string> {
  const result = new Set<string>([tagDefId]);
  const allIds = loroDoc.getAllNodeIds();

  for (const id of allIds) {
    const node = loroDoc.toNodexNode(id);
    if (node?.type !== 'tagDef') continue;
    if (isDescendantOf(id, tagDefId)) {
      result.add(id);
    }
  }
  return result;
}

/**
 * Check if a tagDef is a descendant of another via the `extends` chain.
 */
function isDescendantOf(tagDefId: string, ancestorId: string): boolean {
  const visited = new Set<string>();
  let current = tagDefId;

  while (current && !visited.has(current)) {
    visited.add(current);
    const node = loroDoc.toNodexNode(current);
    if (!node?.extends) return false;
    if (node.extends === ancestorId) return true;
    current = node.extends;
  }
  return false;
}

// ── Trash subtree cache ──

let _trashSetVersion = -1;
let _trashDescendants: Set<string> | null = null;

function getTrashDescendants(): Set<string> {
  // Simple version-based cache: rebuild when Loro data changes
  const doc = loroDoc.getLoroDoc();
  const version = doc.frontiers().length; // cheap proxy for "something changed"
  if (_trashDescendants && _trashSetVersion === version) return _trashDescendants;

  const result = new Set<string>();
  const queue = loroDoc.getChildren(CONTAINER_IDS.TRASH);
  while (queue.length > 0) {
    const id = queue.pop()!;
    result.add(id);
    queue.push(...loroDoc.getChildren(id));
  }
  _trashDescendants = result;
  _trashSetVersion = version;
  return result;
}

/**
 * Get all node IDs that are valid search candidates.
 * Excludes structural types, workspace containers, and trash descendants.
 */
export function getAllSearchableNodes(): string[] {
  const allIds = loroDoc.getAllNodeIds();
  const trashDescendants = getTrashDescendants();
  const result: string[] = [];

  for (const id of allIds) {
    if (isWorkspaceContainer(id)) continue;
    if (trashDescendants.has(id)) continue;

    const node = loroDoc.toNodexNode(id);
    if (!node) continue;
    if (node.type && SKIP_TYPES.has(node.type)) continue;

    result.push(id);
  }
  return result;
}

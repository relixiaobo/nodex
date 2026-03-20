/**
 * Search Engine — core query evaluation for Search Nodes.
 *
 * Phase 1 supports: HAS_TAG, TODO, DONE, NOT_DONE.
 * Unsupported QueryOps throw an explicit error (never silently ignored).
 *
 * @see docs/plans/search-node-design.md
 */
import { nanoid } from 'nanoid';
import * as loroDoc from './loro-doc.js';
import { SYSTEM_NODE_IDS } from '../types/index.js';
import { isLockedNode, isWorkspaceHomeNode } from './node-capabilities.js';
import type { NodexNode, NodeType, QueryOp } from '../types/node.js';

// ============================================================
// Candidate filtering — which node types can appear as results
// ============================================================

/** Node types excluded from search results (structural / schema nodes). */
const EXCLUDED_TYPES: Set<NonNullable<NodeType>> = new Set([
  'queryCondition',
  'fieldEntry',
  'reference',
  'tagDef',
  'fieldDef',
  'viewDef',
]);

/** Check if a node is inside the TRASH container. */
function isInTrash(nodeId: string): boolean {
  let cursor: string | null = nodeId;
  while (cursor) {
    if (cursor === SYSTEM_NODE_IDS.TRASH) return true;
    cursor = loroDoc.getParentId(cursor);
  }
  return false;
}

/** Determine if a node is a valid search result candidate. */
function isCandidate(node: NodexNode, excludeNodeId: string): boolean {
  // Exclude the search node itself (prevent self-reference cycle)
  if (node.id === excludeNodeId) return false;
  // Exclude structural types
  if (node.type && EXCLUDED_TYPES.has(node.type)) return false;
  if (isWorkspaceHomeNode(node.id) || isLockedNode(node.id)) return false;
  // Exclude trashed nodes
  if (isInTrash(node.id)) return false;
  return true;
}

// ============================================================
// Condition evaluation
// ============================================================

/**
 * Evaluate a single queryCondition node against a candidate node.
 * Supports group nodes (AND/OR/NOT) and leaf nodes (HAS_TAG, TODO, DONE, NOT_DONE).
 * Unsupported QueryOps throw an error.
 */
export function evaluateCondition(
  candidate: NodexNode,
  condition: NodexNode,
): boolean {
  // Group node: evaluate children recursively
  if (condition.queryLogic) {
    const childIds = condition.children;
    const childConditions = childIds
      .map((id) => loroDoc.toNodexNode(id))
      .filter((n): n is NodexNode => n !== null && n.type === 'queryCondition');

    switch (condition.queryLogic) {
      case 'AND':
        return childConditions.every((c) => evaluateCondition(candidate, c));
      case 'OR':
        return childConditions.some((c) => evaluateCondition(candidate, c));
      case 'NOT':
        // NOT group negates all its children (typically just one)
        return childConditions.length > 0 &&
          childConditions.every((c) => !evaluateCondition(candidate, c));
      default:
        throw new Error(`[search-engine] Unknown queryLogic: ${condition.queryLogic}`);
    }
  }

  // Leaf node: evaluate the specific operator
  if (!condition.queryOp) {
    console.warn('[search-engine] queryCondition has neither queryLogic nor queryOp:', condition.id);
    return false;
  }

  return evaluateOp(candidate, condition.queryOp, condition);
}

/**
 * Evaluate a leaf-level QueryOp against a candidate node.
 */
function evaluateOp(
  candidate: NodexNode,
  op: QueryOp,
  condition: NodexNode,
): boolean {
  switch (op) {
    case 'HAS_TAG': {
      const tagDefId = condition.queryTagDefId;
      if (!tagDefId) return false;
      return candidate.tags.includes(tagDefId);
    }

    case 'TODO':
      // Node has a checkbox (via showCheckbox on any applied tag)
      return hasCheckbox(candidate);

    case 'DONE':
      return candidate.completedAt != null && candidate.completedAt > 0;

    case 'NOT_DONE':
      return hasCheckbox(candidate) &&
        (candidate.completedAt == null || candidate.completedAt === 0);

    // All other ops: explicitly throw "not supported"
    default:
      throw new Error(`[search-engine] QueryOp "${op}" is not supported yet`);
  }
}

/**
 * Check if a node has a checkbox.
 * A node has a checkbox if any of its applied tags has showCheckbox=true.
 */
function hasCheckbox(node: NodexNode): boolean {
  for (const tagId of node.tags) {
    const tagDef = loroDoc.toNodexNode(tagId);
    if (tagDef?.showCheckbox) return true;
  }
  return false;
}

// ============================================================
// High-level search API
// ============================================================

/**
 * Run the search query defined by a search node, returning matched node IDs.
 *
 * Reads the queryCondition children of the search node, evaluates them
 * against all candidate nodes, and returns matching IDs.
 *
 * @param searchNodeId - The ID of the search node
 * @returns Set of matching node IDs
 */
export function runSearch(searchNodeId: string): Set<string> {
  const searchNode = loroDoc.toNodexNode(searchNodeId);
  if (!searchNode || searchNode.type !== 'search') {
    return new Set();
  }

  // Find the root queryCondition(s) — direct children with type 'queryCondition'
  const rootConditions = searchNode.children
    .map((id) => loroDoc.toNodexNode(id))
    .filter((n): n is NodexNode => n !== null && n.type === 'queryCondition');

  if (rootConditions.length === 0) {
    return new Set();
  }

  // Iterate all nodes and check against conditions
  const allIds = loroDoc.getAllNodeIds();
  const matched = new Set<string>();

  for (const id of allIds) {
    const node = loroDoc.toNodexNode(id);
    if (!node) continue;
    if (!isCandidate(node, searchNodeId)) continue;

    // All root conditions must match (implicit AND at the search node level)
    const allMatch = rootConditions.every((cond) => evaluateCondition(node, cond));
    if (allMatch) {
      matched.add(id);
    }
  }

  return matched;
}

/**
 * Materialize a search node's live result set as reference children.
 *
 * Keeps queryCondition children intact, removes stale result references,
 * adds new ones, updates lastRefreshedAt, and commits with system:refresh.
 */
export function materializeSearchResults(searchNodeId: string): void {
  const searchNode = loroDoc.toNodexNode(searchNodeId);
  if (!searchNode || searchNode.type !== 'search') return;

  const matchedIds = runSearch(searchNodeId);

  // Build map of existing references, deduplicating along the way.
  // Sync + local bootstrap can create duplicate references with the same targetId
  // but different node IDs. Keep the first, delete the rest.
  const existingRefs = new Map<string, string>();
  for (const childId of searchNode.children) {
    const child = loroDoc.toNodexNode(childId);
    if (child?.type === 'reference' && child.targetId) {
      if (existingRefs.has(child.targetId)) {
        loroDoc.deleteNode(childId);
      } else {
        existingRefs.set(child.targetId, childId);
      }
    }
  }

  for (const [targetId, refNodeId] of existingRefs) {
    if (!matchedIds.has(targetId)) {
      loroDoc.deleteNode(refNodeId);
    }
  }

  for (const targetId of matchedIds) {
    if (existingRefs.has(targetId)) continue;
    const refId = nanoid();
    loroDoc.createNode(refId, searchNodeId);
    loroDoc.setNodeDataBatch(refId, {
      type: 'reference',
      targetId,
    });
  }

  loroDoc.setNodeData(searchNodeId, 'lastRefreshedAt', Date.now());
  loroDoc.commitDoc('system:refresh');
}

/**
 * Find all nodes that have a specific tag applied.
 * Convenience wrapper for the most common search pattern (L0).
 *
 * @param tagDefId - The tag definition ID to search for
 * @returns Array of matching node IDs
 */
export function findNodesByTag(tagDefId: string): string[] {
  const allIds = loroDoc.getAllNodeIds();
  const results: string[] = [];

  for (const id of allIds) {
    const node = loroDoc.toNodexNode(id);
    if (!node) continue;
    // Use empty string as excludeNodeId since there's no search node context
    if (!isCandidate(node, '')) continue;
    if (node.tags.includes(tagDefId)) {
      results.push(id);
    }
  }

  return results;
}

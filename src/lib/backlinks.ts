/**
 * Backlinks query utilities.
 *
 * Pure functions that scan the LoroDoc to find all nodes referencing a target node.
 * Three reference types are detected:
 *   1. Tree reference: node.type === 'reference' && node.targetId === targetNodeId
 *   2. Inline reference: node.inlineRefs contains targetNodeId
 *   3. Field value reference: node inside a fieldEntry whose child references targetNodeId
 *
 * No React dependencies — consumed by hooks in use-backlinks.ts.
 */

import * as loroDoc from './loro-doc.js';
import { getAncestorChain, getNavigableParentId, type AncestorInfo } from './tree-utils.js';
import { CONTAINER_IDS } from '../types/index.js';
import type { NodexNode } from '../types/index.js';
import { isNodeInTrash } from './node-capabilities.js';

// ─── Types ───

export interface MentionedInRef {
  referencingNodeId: string;
  refType: 'tree' | 'inline';
  refNodeId: string;
  refNodeName: string;
  breadcrumb: AncestorInfo[];
}

export interface FieldValueRef {
  ownerNodeId: string;
  ownerNodeName: string;
  fieldDefId: string;
  fieldDefName: string;
  ownerTags: string[];
}

export interface BacklinksResult {
  mentionedIn: MentionedInRef[];
  fieldValueRefs: Record<string, FieldValueRef[]>;
  totalCount: number;
}

// ─── Helpers ───

/**
 * Check if a node is a supertag search node — a search node created from a single tag.
 * Structure: search → AND group (1 child) → HAS_TAG leaf (1 child).
 * References from these nodes are excluded from backlinks to reduce noise.
 */
function isSupertagSearchNode(node: NodexNode): boolean {
  if (node.type !== 'search') return false;
  // Find queryCondition children (skip reference children which are search results)
  const conditions = node.children
    .map((id) => loroDoc.toNodexNode(id))
    .filter((n): n is NodexNode => n !== null && n.type === 'queryCondition');
  if (conditions.length !== 1) return false;
  const rootCond = conditions[0];
  if (rootCond.queryLogic !== 'AND') return false;
  const leafIds = rootCond.children;
  if (leafIds.length !== 1) return false;
  const leaf = loroDoc.toNodexNode(leafIds[0]);
  return leaf?.queryOp === 'HAS_TAG' && !!leaf.queryTagDefId;
}

/** Pre-compute the set of all node IDs inside TRASH (single walk from TRASH root). */
function buildTrashSet(): Set<string> {
  const trashSet = new Set<string>();
  const trashNode = loroDoc.toNodexNode(CONTAINER_IDS.TRASH);
  if (!trashNode) return trashSet;
  const queue = [...trashNode.children];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (trashSet.has(id)) continue;
    trashSet.add(id);
    const node = loroDoc.toNodexNode(id);
    if (node) {
      for (const childId of node.children) queue.push(childId);
    }
  }
  return trashSet;
}

// ─── Caches (invalidated by _version from node-store) ───

let _countMapCacheVer = -1;
let _countMapCache: Map<string, number> | null = null;

let _backlinksCacheVer = -1;
let _backlinksCacheKey: string | null = null;
let _backlinksCacheResult: BacklinksResult | null = null;

// ─── Core ───

/**
 * Compute all backlinks (references pointing to targetNodeId).
 *
 * Scans every node in the LoroDoc once. Skips references inside TRASH.
 * Cached by (version, targetNodeId) — repeated calls with same args return O(1).
 */
export function computeBacklinks(targetNodeId: string, version?: number): BacklinksResult {
  if (version !== undefined && version === _backlinksCacheVer
      && targetNodeId === _backlinksCacheKey && _backlinksCacheResult) {
    return _backlinksCacheResult;
  }

  const mentionedIn: MentionedInRef[] = [];
  const fieldValueMap: Record<string, FieldValueRef[]> = {};
  let totalCount = 0;

  const allIds = loroDoc.getAllNodeIds();

  for (const id of allIds) {
    const node = loroDoc.toNodexNode(id);
    if (!node) continue;

    // 1. Tree reference: reference node pointing at target
    if (node.type === 'reference' && node.targetId === targetNodeId) {
      if (isNodeInTrash(id)) continue;
      // Context node is the reference's parent (the meaningful container)
      const contextId = loroDoc.getParentId(id);
      if (!contextId) continue;
      const contextNode = loroDoc.toNodexNode(contextId);
      // Skip if parent is a fieldEntry — handled by field value check (#3) below
      if (contextNode?.type === 'fieldEntry') continue;
      // Skip references from supertag search nodes (single-tag searches) — too noisy
      if (contextNode && isSupertagSearchNode(contextNode)) continue;
      const { ancestors } = getAncestorChain(contextId);
      mentionedIn.push({
        referencingNodeId: contextId,
        refType: 'tree',
        refNodeId: id,
        refNodeName: contextNode?.name ?? '',
        breadcrumb: ancestors,
      });
      totalCount++;
      continue;
    }

    // 2. Inline reference: node content contains @reference to target
    if (node.inlineRefs && node.inlineRefs.length > 0) {
      const hasInlineRef = node.inlineRefs.some(r => r.targetNodeId === targetNodeId);
      if (hasInlineRef) {
        if (isNodeInTrash(id)) continue;
        const { ancestors } = getAncestorChain(id);
        mentionedIn.push({
          referencingNodeId: id,
          refType: 'inline',
          refNodeId: id,
          refNodeName: node.name ?? '',
          breadcrumb: ancestors,
        });
        totalCount++;
      }
    }

    // 3. Field value reference: fieldEntry child that is/references targetNodeId
    if (node.type === 'fieldEntry' && node.fieldDefId) {
      const feChildren = node.children;
      const referencesTarget = feChildren.some(childId => {
        if (childId === targetNodeId) return true;
        const child = loroDoc.toNodexNode(childId);
        // Value nodes in options fields have targetId set (without type='reference')
        return child?.targetId === targetNodeId;
      });

      if (referencesTarget) {
        if (isNodeInTrash(id)) continue;
        // Find the owner content node (navigable parent of this fieldEntry)
        const ownerId = getNavigableParentId(id);
        if (!ownerId) continue;
        const ownerNode = loroDoc.toNodexNode(ownerId);
        if (!ownerNode) continue;

        // Resolve field definition name
        const fieldDefNode = loroDoc.toNodexNode(node.fieldDefId);
        const fieldDefName = fieldDefNode?.name ?? node.fieldDefId;

        const entry: FieldValueRef = {
          ownerNodeId: ownerId,
          ownerNodeName: ownerNode.name ?? '',
          fieldDefId: node.fieldDefId,
          fieldDefName,
          ownerTags: ownerNode.tags ?? [],
        };

        if (!fieldValueMap[fieldDefName]) {
          fieldValueMap[fieldDefName] = [];
        }
        fieldValueMap[fieldDefName].push(entry);
        totalCount++;
      }
    }
  }

  // Sort mentionedIn by breadcrumb path (string comparison)
  mentionedIn.sort((a, b) => {
    const pathA = a.breadcrumb.map(x => x.name).join('/');
    const pathB = b.breadcrumb.map(x => x.name).join('/');
    return pathA.localeCompare(pathB);
  });

  const result = { mentionedIn, fieldValueRefs: fieldValueMap, totalCount };

  if (version !== undefined) {
    _backlinksCacheVer = version;
    _backlinksCacheKey = targetNodeId;
    _backlinksCacheResult = result;
  }

  return result;
}

/**
 * Build a map of targetNodeId → backlink count for ALL referenced nodes.
 *
 * Single-pass scan: O(N) where N = total nodes. Each OutlinerItem reads O(1).
 * Cached by version — repeated calls within the same _version return O(1).
 * Pre-computes trash set to avoid per-node parent chain walks.
 */
export function buildBacklinkCountMap(version: number): Map<string, number> {
  if (version === _countMapCacheVer && _countMapCache) return _countMapCache;

  const counts = new Map<string, number>();
  const trashSet = buildTrashSet();
  const allIds = loroDoc.getAllNodeIds();

  for (const id of allIds) {
    if (trashSet.has(id)) continue;

    const node = loroDoc.toNodexNode(id);
    if (!node) continue;

    // Tree reference — skip refs inside fieldEntry (counted by field value check below)
    // and skip refs from supertag search nodes (single-tag searches)
    if (node.type === 'reference' && node.targetId) {
      const parentId = loroDoc.getParentId(id);
      if (parentId) {
        const parentNode = loroDoc.toNodexNode(parentId);
        if (parentNode?.type !== 'fieldEntry' && !(parentNode && isSupertagSearchNode(parentNode))) {
          counts.set(node.targetId, (counts.get(node.targetId) ?? 0) + 1);
        }
      }
    }

    // Inline references
    if (node.inlineRefs && node.inlineRefs.length > 0) {
      for (const ref of node.inlineRefs) {
        counts.set(ref.targetNodeId, (counts.get(ref.targetNodeId) ?? 0) + 1);
      }
    }

    // Field value references — children of fieldEntry
    if (node.type === 'fieldEntry') {
      for (const childId of node.children) {
        const child = loroDoc.toNodexNode(childId);
        if (child?.targetId) {
          counts.set(child.targetId, (counts.get(child.targetId) ?? 0) + 1);
        }
      }
    }
  }

  _countMapCacheVer = version;
  _countMapCache = counts;
  return counts;
}

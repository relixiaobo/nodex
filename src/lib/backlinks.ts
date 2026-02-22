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

/** Check if a node is inside the TRASH container. */
function isInTrash(nodeId: string): boolean {
  let currentId: string | null = nodeId;
  const visited = new Set<string>();
  while (currentId) {
    if (currentId === CONTAINER_IDS.TRASH) return true;
    if (visited.has(currentId)) return false;
    visited.add(currentId);
    currentId = loroDoc.getParentId(currentId);
  }
  return false;
}

// ─── Count map cache (invalidated by _version from node-store) ───

let _countMapCacheVer = -1;
let _countMapCache: Map<string, number> | null = null;

// ─── Core ───

/**
 * Compute all backlinks (references pointing to targetNodeId).
 *
 * Scans every node in the LoroDoc once. Skips references inside TRASH.
 */
export function computeBacklinks(targetNodeId: string): BacklinksResult {
  const mentionedIn: MentionedInRef[] = [];
  const fieldValueMap: Record<string, FieldValueRef[]> = {};
  let totalCount = 0;

  const allIds = loroDoc.getAllNodeIds();

  for (const id of allIds) {
    const node = loroDoc.toNodexNode(id);
    if (!node) continue;

    // 1. Tree reference: reference node pointing at target
    if (node.type === 'reference' && node.targetId === targetNodeId) {
      if (isInTrash(id)) continue;
      // Context node is the reference's parent (the meaningful container)
      const contextId = loroDoc.getParentId(id);
      if (!contextId) continue;
      const contextNode = loroDoc.toNodexNode(contextId);
      // Skip if parent is a fieldEntry — handled by field value check (#3) below
      if (contextNode?.type === 'fieldEntry') continue;
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
        if (isInTrash(id)) continue;
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
        if (isInTrash(id)) continue;
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

  return { mentionedIn, fieldValueRefs: fieldValueMap, totalCount };
}

/**
 * Build a map of targetNodeId → backlink count for ALL referenced nodes.
 *
 * Single-pass scan: O(N) where N = total nodes. Each OutlinerItem reads O(1).
 * Cached by version — repeated calls within the same _version return O(1).
 */
export function buildBacklinkCountMap(version: number): Map<string, number> {
  if (version === _countMapCacheVer && _countMapCache) return _countMapCache;

  const counts = new Map<string, number>();
  const allIds = loroDoc.getAllNodeIds();

  for (const id of allIds) {
    const node = loroDoc.toNodexNode(id);
    if (!node) continue;

    // Tree reference
    if (node.type === 'reference' && node.targetId) {
      if (!isInTrash(id)) {
        counts.set(node.targetId, (counts.get(node.targetId) ?? 0) + 1);
      }
    }

    // Inline references
    if (node.inlineRefs && node.inlineRefs.length > 0) {
      if (!isInTrash(id)) {
        for (const ref of node.inlineRefs) {
          counts.set(ref.targetNodeId, (counts.get(ref.targetNodeId) ?? 0) + 1);
        }
      }
    }

    // Field value references — children of fieldEntry
    if (node.type === 'fieldEntry') {
      if (!isInTrash(id)) {
        for (const childId of node.children) {
          const child = loroDoc.toNodexNode(childId);
          if (child?.targetId) {
            counts.set(child.targetId, (counts.get(child.targetId) ?? 0) + 1);
          }
        }
      }
    }
  }

  _countMapCacheVer = version;
  _countMapCache = counts;
  return counts;
}

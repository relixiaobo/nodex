/**
 * Highlight service — orchestrates #highlight and #comment system tags.
 *
 * Simplified model:
 * - One template field: "Source" (options_from_supertag → #source)
 * - Anchor data stored in node description (JSON)
 * - Highlight color = tagDef color (no per-node color)
 */
import { CONTAINER_IDS, SYS_T, FIELD_TYPES, AUTO_INIT_STRATEGY } from '../types/index.js';
import type { NodexNode } from '../types/index.js';
import * as loroDoc from './loro-doc.js';
import type { WebClipNodeStore } from './webclip-service.js';
import { findTagDefByName } from './webclip-service.js';

/** Extended store interface for options field support. */
export interface HighlightNodeStore extends WebClipNodeStore {
  setOptionsFieldValue(nodeId: string, fieldDefId: string, optionNodeId: string): void;
}

// ============================================================
// Internal constants
// ============================================================

const FIELD_SOURCE = 'Source';

// ============================================================
// TagDef initialization
// ============================================================

/** Cached fieldDef ID after initialization */
let _sourceFieldDefId: string | null = null;

/**
 * Find a fieldDef by name within a tagDef's children.
 */
function findFieldDefByName_(tagDefId: string, name: string): NodexNode | undefined {
  const children = loroDoc.getChildren(tagDefId);
  const lowerName = name.toLowerCase();
  for (const childId of children) {
    const child = loroDoc.toNodexNode(childId);
    if (child?.type === 'fieldDef' && child.name?.toLowerCase() === lowerName) {
      return child;
    }
  }
  return undefined;
}

/**
 * Create/find #highlight tagDef with fixed ID SYS_T200.
 * Creates 1 template field: Source (options_from_supertag → #source).
 * Migrates legacy fields (Anchor, Color, Page URL) and renames Clip → Source.
 */
export function ensureHighlightTagDef(store: HighlightNodeStore): void {
  // Create tagDef if needed
  let tagDef = loroDoc.toNodexNode(SYS_T.HIGHLIGHT);
  if (!tagDef) {
    loroDoc.createNode(SYS_T.HIGHLIGHT, CONTAINER_IDS.SCHEMA);
    loroDoc.setNodeDataBatch(SYS_T.HIGHLIGHT, {
      type: 'tagDef',
      name: 'highlight',
      color: 'amber',
    });
    loroDoc.commitDoc();
    tagDef = loroDoc.toNodexNode(SYS_T.HIGHLIGHT);
  }

  // Ensure #source tagDef exists (needed for options_from_supertag source)
  let sourceTagDef = findTagDefByName(null, CONTAINER_IDS.SCHEMA, 'source');
  if (!sourceTagDef) {
    sourceTagDef = store.createTagDef('source');
  }

  // Ensure Source field (options_from_supertag → #source)
  let sourceFd = findFieldDefByName_(SYS_T.HIGHLIGHT, FIELD_SOURCE);
  if (!sourceFd) {
    sourceFd = store.createFieldDef(FIELD_SOURCE, FIELD_TYPES.OPTIONS_FROM_SUPERTAG, SYS_T.HIGHLIGHT);
    // Set the source supertag so the picker shows #source nodes
    loroDoc.setNodeDataBatch(sourceFd.id, {
      sourceSupertag: sourceTagDef.id,
      autoInitialize: AUTO_INIT_STRATEGY.ANCESTOR_SUPERTAG_REF,
    });
    loroDoc.commitDoc();
  } else {
    // Backfill sourceSupertag and autoInitialize if missing (e.g., after migration)
    const currentFd = loroDoc.toNodexNode(sourceFd.id);
    const needsUpdate = !currentFd?.sourceSupertag
      || currentFd?.autoInitialize !== AUTO_INIT_STRATEGY.ANCESTOR_SUPERTAG_REF;
    if (needsUpdate) {
      loroDoc.setNodeDataBatch(sourceFd.id, {
        sourceSupertag: sourceTagDef.id,
        autoInitialize: AUTO_INIT_STRATEGY.ANCESTOR_SUPERTAG_REF,
      });
      loroDoc.commitDoc();
    }
  }
  _sourceFieldDefId = sourceFd.id;
}

/**
 * Create/find #comment tagDef with fixed ID SYS_T201 (no template fields).
 */
export function ensureCommentTagDef(_store: HighlightNodeStore): void {
  const tagDef = loroDoc.toNodexNode(SYS_T.COMMENT);
  if (tagDef) return;

  loroDoc.createNode(SYS_T.COMMENT, CONTAINER_IDS.SCHEMA);
  loroDoc.setNodeDataBatch(SYS_T.COMMENT, {
    type: 'tagDef',
    name: 'comment',
    color: 'blue',
  });
  loroDoc.commitDoc();
}

// ============================================================
// Getters for cached field IDs
// ============================================================

export function getSourceFieldDefId(): string {
  if (!_sourceFieldDefId) throw new Error('#highlight tagDef not initialized. Call ensureHighlightTagDef() first.');
  return _sourceFieldDefId;
}

// ============================================================
// CRUD operations
// ============================================================

export interface CreateHighlightParams {
  store: HighlightNodeStore;
  selectedText: string;
  /** Parent clip page node ID. Highlight is created as child of this node. */
  clipNodeId: string;
  /** JSON-serialized anchor data (stored in node description). */
  anchor?: string;
}

/**
 * Create a highlight node as a child of the clip page node.
 * Applies #highlight tag (Source field auto-filled by ancestor_supertag_ref).
 * Stores anchor in description.
 *
 * @returns The created highlight node.
 */
export function createHighlightNode(params: CreateHighlightParams): NodexNode {
  const { store, selectedText, clipNodeId, anchor } = params;

  // 1. Create node as child of clip page (auto-init fills Source field)
  const node = store.createChild(clipNodeId, undefined, { name: selectedText });

  // 2. Apply #highlight tag — auto-init resolves Source from #source ancestor
  store.applyTag(node.id, SYS_T.HIGHLIGHT);

  // 3. Store anchor data in description (internal, not user-visible in normal view)
  if (anchor) {
    store.updateNodeDescription(node.id, anchor);
  }

  return loroDoc.toNodexNode(node.id)!;
}

/**
 * Find all #highlight nodes for a given clip page.
 * New model: highlights are direct children of the clip node.
 * Backward compat: also scans LIBRARY top-level for legacy highlights with Source field match.
 */
export function getHighlightsForClip(clipNodeId: string): NodexNode[] {
  const results: NodexNode[] = [];
  const seen = new Set<string>();

  // 1. New model: direct children of clipNodeId
  const clipChildren = loroDoc.getChildren(clipNodeId);
  for (const childId of clipChildren) {
    const child = loroDoc.toNodexNode(childId);
    if (!child || !child.tags.includes(SYS_T.HIGHLIGHT)) continue;
    results.push(child);
    seen.add(childId);
  }

  // 2. Backward compat: legacy highlights at LIBRARY top level with Source field match
  const sourceFieldDefId = _sourceFieldDefId;
  if (sourceFieldDefId) {
    const libraryChildren = loroDoc.getChildren(CONTAINER_IDS.LIBRARY);
    for (const childId of libraryChildren) {
      if (seen.has(childId)) continue;
      const child = loroDoc.toNodexNode(childId);
      if (!child || !child.tags.includes(SYS_T.HIGHLIGHT)) continue;

      const sourceRef = getOptionsFieldTargetId(childId, sourceFieldDefId);
      if (sourceRef === clipNodeId) {
        results.push(child);
        seen.add(childId);
      }
    }
  }

  return results;
}

/**
 * Create a comment child node under a highlight node.
 * Applies #comment tag.
 */
export function createCommentNode(store: HighlightNodeStore, highlightId: string, text: string): NodexNode {
  const node = store.createChild(highlightId, undefined, { name: text });
  store.applyTag(node.id, SYS_T.COMMENT);
  return loroDoc.toNodexNode(node.id)!;
}

// ============================================================
// Internal helpers
// ============================================================

/**
 * Get the targetId of an options field value (the referenced node ID).
 */
function getOptionsFieldTargetId(nodeId: string, fieldDefId: string): string | undefined {
  const children = loroDoc.getChildren(nodeId);
  for (const childId of children) {
    const child = loroDoc.toNodexNode(childId);
    if (child?.type === 'fieldEntry' && child.fieldDefId === fieldDefId) {
      const valueChildren = loroDoc.getChildren(childId);
      if (valueChildren.length > 0) {
        const valueNode = loroDoc.toNodexNode(valueChildren[0]);
        return valueNode?.targetId ?? valueNode?.name;
      }
      return undefined;
    }
  }
  return undefined;
}

/**
 * Reset cached field IDs (for testing).
 */
export function _resetHighlightCache(): void {
  _sourceFieldDefId = null;
}

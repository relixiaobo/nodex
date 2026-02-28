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

/** Extended store interface for highlight operations. */
export interface HighlightNodeStore extends WebClipNodeStore {}

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
 * Highlights are direct children of the clip node.
 */
export function getHighlightsForClip(clipNodeId: string): NodexNode[] {
  const results: NodexNode[] = [];
  const clipChildren = loroDoc.getChildren(clipNodeId);
  for (const childId of clipChildren) {
    const child = loroDoc.toNodexNode(childId);
    if (!child || !child.tags.includes(SYS_T.HIGHLIGHT)) continue;
    results.push(child);
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

/**
 * Reset cached field IDs (for testing).
 */
export function _resetHighlightCache(): void {
  _sourceFieldDefId = null;
}

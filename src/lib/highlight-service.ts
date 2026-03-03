/**
 * Highlight service — orchestrates #highlight and #comment system tags.
 *
 * Simplified model:
 * - One template field: "Source" (options_from_supertag → #source)
 * - Anchor data stored in node description (JSON)
 * - Highlight color = tagDef color (no per-node color)
 */
import { CONTAINER_IDS, SYS_T, NDX_F, FIELD_TYPES, AUTO_INIT_STRATEGY } from '../types/index.js';
import type { NodexNode } from '../types/index.js';
import * as loroDoc from './loro-doc.js';
import type { WebClipNodeStore } from './webclip-service.js';
import { ensureSourceTagDef } from './webclip-service.js';

/** Extended store interface for highlight operations. */
export interface HighlightNodeStore extends WebClipNodeStore {}

// ============================================================
// TagDef / FieldDef ensure functions (fixed IDs to prevent CRDT duplication)
// ============================================================

/** Cached fieldDef ID after initialization */
let _sourceFieldDefId: string | null = null;

/**
 * Ensure "Source" fieldDef exists with fixed ID NDX_F02 under #highlight tagDef.
 * Type: options_from_supertag → #source, auto-init from ancestor.
 */
export function ensureHighlightSourceFieldDef(): NodexNode {
  const sourceTagDef = ensureSourceTagDef();
  let fd = loroDoc.toNodexNode(NDX_F.HIGHLIGHT_SOURCE);
  if (!fd) {
    loroDoc.createNode(NDX_F.HIGHLIGHT_SOURCE, SYS_T.HIGHLIGHT);
    loroDoc.setNodeDataBatch(NDX_F.HIGHLIGHT_SOURCE, {
      type: 'fieldDef',
      name: 'Source',
      fieldType: FIELD_TYPES.OPTIONS_FROM_SUPERTAG,
    });
    loroDoc.commitDoc();
    fd = loroDoc.toNodexNode(NDX_F.HIGHLIGHT_SOURCE)!;
  }
  // Always ensure sourceSupertag + autoInitialize are set
  if (fd.sourceSupertag !== sourceTagDef.id
    || fd.autoInitialize !== AUTO_INIT_STRATEGY.ANCESTOR_SUPERTAG_REF) {
    loroDoc.setNodeDataBatch(NDX_F.HIGHLIGHT_SOURCE, {
      sourceSupertag: sourceTagDef.id,
      autoInitialize: AUTO_INIT_STRATEGY.ANCESTOR_SUPERTAG_REF,
    });
    loroDoc.commitDoc();
    fd = loroDoc.toNodexNode(NDX_F.HIGHLIGHT_SOURCE)!;
  }
  return fd;
}

/**
 * Create/find #highlight tagDef with fixed ID SYS_T200.
 * Creates 1 template field: Source (options_from_supertag → #source, auto-init from ancestor).
 */
export function ensureHighlightTagDef(_store: HighlightNodeStore): void {
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

  // Ensure #source and Source field (with fixed IDs)
  const sourceFd = ensureHighlightSourceFieldDef();
  _sourceFieldDefId = sourceFd.id;
}

/**
 * Create/find #note tagDef with fixed ID SYS_T201 (no template fields).
 */
export function ensureNoteTagDef(_store: HighlightNodeStore): void {
  const tagDef = loroDoc.toNodexNode(SYS_T.NOTE);
  if (tagDef) return;

  loroDoc.createNode(SYS_T.NOTE, CONTAINER_IDS.SCHEMA);
  loroDoc.setNodeDataBatch(SYS_T.NOTE, {
    type: 'tagDef',
    name: 'note',
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
 * Create a note child node under a highlight node.
 * Applies #note tag.
 */
export function createNoteNode(store: HighlightNodeStore, highlightId: string, text: string): NodexNode {
  const node = store.createChild(highlightId, undefined, { name: text });
  store.applyTag(node.id, SYS_T.NOTE);
  return loroDoc.toNodexNode(node.id)!;
}

/**
 * Reset cached field IDs (for testing).
 */
export function _resetHighlightCache(): void {
  _sourceFieldDefId = null;
}

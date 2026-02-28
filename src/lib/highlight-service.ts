/**
 * Highlight service — orchestrates #highlight and #comment system tags.
 *
 * Simplified model:
 * - One template field: "Clip" (options_from_supertag → #web_clip)
 * - Anchor data stored in node description (JSON)
 * - Highlight color = tagDef color (no per-node color)
 */
import { CONTAINER_IDS, SYS_T, FIELD_TYPES } from '../types/index.js';
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

const FIELD_CLIP = 'Clip';

// ============================================================
// TagDef initialization
// ============================================================

/** Cached fieldDef ID after initialization */
let _clipFieldDefId: string | null = null;

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
 * Creates 1 template field: Clip (options_from_supertag → #web_clip).
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

  // Ensure #web_clip tagDef exists (needed for options_from_supertag source)
  let webClipTagDef = findTagDefByName(null, CONTAINER_IDS.SCHEMA, 'web_clip');
  if (!webClipTagDef) {
    webClipTagDef = store.createTagDef('web_clip');
  }

  // Ensure Clip field (options_from_supertag → #web_clip)
  let clipFd = findFieldDefByName_(SYS_T.HIGHLIGHT, FIELD_CLIP);
  if (!clipFd) {
    clipFd = store.createFieldDef(FIELD_CLIP, FIELD_TYPES.OPTIONS_FROM_SUPERTAG, SYS_T.HIGHLIGHT);
    // Set the source supertag so the picker shows #web_clip nodes
    loroDoc.setNodeDataBatch(clipFd.id, { sourceSupertag: webClipTagDef.id });
    loroDoc.commitDoc();
  } else if (!loroDoc.toNodexNode(clipFd.id)?.sourceSupertag) {
    // Backfill sourceSupertag if missing (e.g., after migration)
    loroDoc.setNodeDataBatch(clipFd.id, { sourceSupertag: webClipTagDef.id });
    loroDoc.commitDoc();
  }
  _clipFieldDefId = clipFd.id;
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

export function getClipFieldDefId(): string {
  if (!_clipFieldDefId) throw new Error('#highlight tagDef not initialized. Call ensureHighlightTagDef() first.');
  return _clipFieldDefId;
}

// ============================================================
// CRUD operations
// ============================================================

export interface CreateHighlightParams {
  store: HighlightNodeStore;
  selectedText: string;
  clipNodeId?: string;
  /** JSON-serialized anchor data (stored in node description). */
  anchor?: string;
}

/**
 * Create a highlight node in LIBRARY container.
 * Applies #highlight tag, sets Clip field, stores anchor in description.
 *
 * @returns The created highlight node.
 */
export function createHighlightNode(params: CreateHighlightParams): NodexNode {
  const { store, selectedText, clipNodeId, anchor } = params;

  // 1. Create node in LIBRARY
  const node = store.createChild(CONTAINER_IDS.LIBRARY, undefined, { name: selectedText });

  // 2. Apply #highlight tag
  store.applyTag(node.id, SYS_T.HIGHLIGHT);

  // 3. Set Clip field (reference to web_clip node)
  if (clipNodeId) {
    store.setOptionsFieldValue(node.id, getClipFieldDefId(), clipNodeId);
  }

  // 4. Store anchor data in description (internal, not user-visible in normal view)
  if (anchor) {
    store.updateNodeDescription(node.id, anchor);
  }

  return loroDoc.toNodexNode(node.id)!;
}

/**
 * Find all #highlight nodes in LIBRARY whose Clip field references the given clipNodeId.
 */
export function getHighlightsForClip(clipNodeId: string): NodexNode[] {
  const clipFieldDefId = _clipFieldDefId;
  if (!clipFieldDefId) return [];

  const libraryChildren = loroDoc.getChildren(CONTAINER_IDS.LIBRARY);
  const results: NodexNode[] = [];

  for (const childId of libraryChildren) {
    const child = loroDoc.toNodexNode(childId);
    if (!child || !child.tags.includes(SYS_T.HIGHLIGHT)) continue;

    // Check Clip field value (options type → targetId reference)
    const clipRef = getOptionsFieldTargetId(childId, clipFieldDefId);
    if (clipRef === clipNodeId) {
      results.push(child);
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
  _clipFieldDefId = null;
}

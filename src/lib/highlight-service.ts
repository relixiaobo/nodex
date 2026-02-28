/**
 * Highlight service — orchestrates #highlight and #comment system tags.
 *
 * - ensureHighlightTagDef(): Create/find #highlight tagDef with fixed ID SYS_T200
 *   and 4 template fields (Source, Anchor, Color, Page URL).
 * - ensureCommentTagDef(): Create/find #comment tagDef with fixed ID SYS_T201.
 * - createHighlightNode(): Create node in LIBRARY + apply tag + fill fields.
 * - getHighlightsForClip(): Find highlights by Source field value.
 * - createCommentNode(): Create child + apply #comment tag.
 */
import { CONTAINER_IDS, SYS_T, FIELD_TYPES } from '../types/index.js';
import type { NodexNode } from '../types/index.js';
import * as loroDoc from './loro-doc.js';
import type { WebClipNodeStore } from './webclip-service.js';

/** Extended store interface that includes options-specific methods. */
export interface HighlightNodeStore extends WebClipNodeStore {
  setOptionsFieldValue(nodeId: string, fieldDefId: string, optionNodeId: string): void;
  addFieldOption(fieldDefId: string, name: string): string;
}

// ============================================================
// Highlight color options
// ============================================================

export const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'] as const;
export type HighlightColor = typeof HIGHLIGHT_COLORS[number];
export const DEFAULT_HIGHLIGHT_COLOR: HighlightColor = 'yellow';

// ============================================================
// Internal field name constants
// ============================================================

const FIELD_SOURCE = 'Source';
const FIELD_ANCHOR = 'Anchor';
const FIELD_COLOR = 'Color';
const FIELD_PAGE_URL = 'Page URL';

// ============================================================
// TagDef initialization
// ============================================================

/** Cached fieldDef IDs after initialization */
let _sourceFieldDefId: string | null = null;
let _anchorFieldDefId: string | null = null;
let _colorFieldDefId: string | null = null;
let _pageUrlFieldDefId: string | null = null;
let _colorOptionIds: Map<string, string> | null = null;

/**
 * Find a fieldDef by name within a tagDef's children.
 */
function findFieldDefByName(tagDefId: string, name: string): NodexNode | undefined {
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
 * Find option node by name within a fieldDef's children.
 */
function findOptionByName(fieldDefId: string, name: string): NodexNode | undefined {
  const children = loroDoc.getChildren(fieldDefId);
  const lowerName = name.toLowerCase();
  for (const childId of children) {
    const child = loroDoc.toNodexNode(childId);
    if (child?.name?.toLowerCase() === lowerName) {
      return child;
    }
  }
  return undefined;
}

/**
 * Create/find #highlight tagDef with fixed ID SYS_T200.
 * Creates 4 template fields: Source (plain), Anchor (plain), Color (options), Page URL (url).
 * Color field has 5 option children: yellow / green / blue / pink / purple.
 */
export function ensureHighlightTagDef(store: HighlightNodeStore): void {
  // Check if tagDef already exists
  let tagDef = loroDoc.toNodexNode(SYS_T.HIGHLIGHT);

  if (!tagDef) {
    // Create tagDef with fixed ID
    loroDoc.createNode(SYS_T.HIGHLIGHT, CONTAINER_IDS.SCHEMA);
    loroDoc.setNodeDataBatch(SYS_T.HIGHLIGHT, {
      type: 'tagDef',
      name: 'highlight',
      color: 'amber',
    });
    loroDoc.commitDoc();
    tagDef = loroDoc.toNodexNode(SYS_T.HIGHLIGHT);
  }

  // Ensure Source field (plain — stores nodeId reference to clip node)
  let sourceFd = findFieldDefByName(SYS_T.HIGHLIGHT, FIELD_SOURCE);
  if (!sourceFd) {
    sourceFd = store.createFieldDef(FIELD_SOURCE, FIELD_TYPES.PLAIN, SYS_T.HIGHLIGHT);
  }
  _sourceFieldDefId = sourceFd.id;

  // Ensure Anchor field (plain — stores JSON anchor data)
  let anchorFd = findFieldDefByName(SYS_T.HIGHLIGHT, FIELD_ANCHOR);
  if (!anchorFd) {
    anchorFd = store.createFieldDef(FIELD_ANCHOR, FIELD_TYPES.PLAIN, SYS_T.HIGHLIGHT);
  }
  _anchorFieldDefId = anchorFd.id;

  // Ensure Color field (options — 5 color choices)
  let colorFd = findFieldDefByName(SYS_T.HIGHLIGHT, FIELD_COLOR);
  if (!colorFd) {
    colorFd = store.createFieldDef(FIELD_COLOR, FIELD_TYPES.OPTIONS, SYS_T.HIGHLIGHT);
  }
  _colorFieldDefId = colorFd.id;

  // Ensure color option children exist
  _colorOptionIds = new Map<string, string>();
  for (const color of HIGHLIGHT_COLORS) {
    let opt = findOptionByName(colorFd.id, color);
    if (!opt) {
      const optId = store.addFieldOption(colorFd.id, color);
      _colorOptionIds.set(color, optId);
    } else {
      _colorOptionIds.set(color, opt.id);
    }
  }

  // Ensure Page URL field (url)
  let pageUrlFd = findFieldDefByName(SYS_T.HIGHLIGHT, FIELD_PAGE_URL);
  if (!pageUrlFd) {
    pageUrlFd = store.createFieldDef(FIELD_PAGE_URL, FIELD_TYPES.URL, SYS_T.HIGHLIGHT);
  }
  _pageUrlFieldDefId = pageUrlFd.id;
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

export function getAnchorFieldDefId(): string {
  if (!_anchorFieldDefId) throw new Error('#highlight tagDef not initialized. Call ensureHighlightTagDef() first.');
  return _anchorFieldDefId;
}

export function getColorFieldDefId(): string {
  if (!_colorFieldDefId) throw new Error('#highlight tagDef not initialized. Call ensureHighlightTagDef() first.');
  return _colorFieldDefId;
}

export function getPageUrlFieldDefId(): string {
  if (!_pageUrlFieldDefId) throw new Error('#highlight tagDef not initialized. Call ensureHighlightTagDef() first.');
  return _pageUrlFieldDefId;
}

export function getColorOptionId(color: HighlightColor): string {
  if (!_colorOptionIds) throw new Error('#highlight tagDef not initialized. Call ensureHighlightTagDef() first.');
  const id = _colorOptionIds.get(color);
  if (!id) throw new Error(`Color option '${color}' not found.`);
  return id;
}

// ============================================================
// CRUD operations
// ============================================================

export interface CreateHighlightParams {
  store: HighlightNodeStore;
  selectedText: string;
  clipNodeId?: string;
  color?: HighlightColor;
  anchor?: string; // JSON string
  pageUrl?: string;
}

/**
 * Create a highlight node in LIBRARY container.
 * Applies #highlight tag and fills Source, Color fields.
 *
 * @returns The created highlight node.
 */
export function createHighlightNode(params: CreateHighlightParams): NodexNode {
  const { store, selectedText, clipNodeId, color = DEFAULT_HIGHLIGHT_COLOR, anchor, pageUrl } = params;

  // 1. Create node in LIBRARY
  const node = store.createChild(CONTAINER_IDS.LIBRARY, undefined, { name: selectedText });

  // 2. Apply #highlight tag
  store.applyTag(node.id, SYS_T.HIGHLIGHT);

  // 3. Fill Source field (clip node reference)
  if (clipNodeId) {
    store.setFieldValue(node.id, getSourceFieldDefId(), [clipNodeId]);
  }

  // 4. Fill Color field (options type → use setOptionsFieldValue)
  const colorOptId = getColorOptionId(color);
  store.setOptionsFieldValue(node.id, getColorFieldDefId(), colorOptId);

  // 5. Fill Anchor field if provided
  if (anchor) {
    store.setFieldValue(node.id, getAnchorFieldDefId(), [anchor]);
  }

  // 6. Fill Page URL field if provided
  if (pageUrl) {
    store.setFieldValue(node.id, getPageUrlFieldDefId(), [pageUrl]);
  }

  return loroDoc.toNodexNode(node.id)!;
}

/**
 * Find all #highlight nodes in LIBRARY whose Source field matches the given clipNodeId.
 */
export function getHighlightsForClip(clipNodeId: string): NodexNode[] {
  const sourceFieldDefId = _sourceFieldDefId;
  if (!sourceFieldDefId) return [];

  const libraryChildren = loroDoc.getChildren(CONTAINER_IDS.LIBRARY);
  const results: NodexNode[] = [];

  for (const childId of libraryChildren) {
    const child = loroDoc.toNodexNode(childId);
    if (!child || !child.tags.includes(SYS_T.HIGHLIGHT)) continue;

    // Check Source field value
    const sourceValue = getFieldValueText(childId, sourceFieldDefId);
    if (sourceValue === clipNodeId) {
      results.push(child);
    }
  }

  return results;
}

/**
 * Create a comment child node under a highlight node.
 * Applies #comment tag.
 *
 * @returns The created comment node.
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
 * Get the text value of a plain field on a node.
 * Returns the name of the first value child of the fieldEntry.
 */
function getFieldValueText(nodeId: string, fieldDefId: string): string | undefined {
  const children = loroDoc.getChildren(nodeId);
  for (const childId of children) {
    const child = loroDoc.toNodexNode(childId);
    if (child?.type === 'fieldEntry' && child.fieldDefId === fieldDefId) {
      const valueChildren = loroDoc.getChildren(childId);
      if (valueChildren.length > 0) {
        return loroDoc.toNodexNode(valueChildren[0])?.name;
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
  _anchorFieldDefId = null;
  _colorFieldDefId = null;
  _pageUrlFieldDefId = null;
  _colorOptionIds = null;
}

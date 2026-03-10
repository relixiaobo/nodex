/**
 * Highlight service — data model.
 *
 * - #highlight is always a direct child of clip page
 * - When user adds note, #note is created as sibling with a
 *   reference node in its Highlights fieldEntry pointing to the #highlight
 * - Anchor data stored in #highlight's hidden "Anchor" field
 * - Source field stays on #highlight (auto-init from #source ancestor)
 */
import { nanoid } from 'nanoid';
import { SYSTEM_NODE_IDS, SYS_T, SYS_V, NDX_F, FIELD_TYPES, AUTO_INIT_STRATEGY } from '../types/index.js';
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
 * Ensure "Anchor" fieldDef exists with fixed ID NDX_F07 under #highlight tagDef.
 * Type: plain, hideField: ALWAYS (invisible to user).
 */
export function ensureHighlightAnchorFieldDef(): NodexNode {
  let fd = loroDoc.toNodexNode(NDX_F.HIGHLIGHT_ANCHOR);
  if (!fd) {
    loroDoc.createNode(NDX_F.HIGHLIGHT_ANCHOR, SYS_T.HIGHLIGHT);
    loroDoc.setNodeDataBatch(NDX_F.HIGHLIGHT_ANCHOR, {
      type: 'fieldDef',
      name: 'Anchor',
      fieldType: FIELD_TYPES.PLAIN,
      hideField: SYS_V.ALWAYS,
    });
    loroDoc.commitDoc();
    fd = loroDoc.toNodexNode(NDX_F.HIGHLIGHT_ANCHOR)!;
  }
  return fd;
}

/**
 * Ensure "Highlights" fieldDef exists with fixed ID NDX_F06 under #note tagDef.
 * Type: options_from_supertag → #highlight (user's highlighted text as field values).
 */
export function ensureNoteHighlightsFieldDef(): NodexNode {
  let fd = loroDoc.toNodexNode(NDX_F.NOTE_HIGHLIGHTS);
  if (!fd) {
    loroDoc.createNode(NDX_F.NOTE_HIGHLIGHTS, SYS_T.NOTE);
    loroDoc.setNodeDataBatch(NDX_F.NOTE_HIGHLIGHTS, {
      type: 'fieldDef',
      name: 'Highlights',
      fieldType: FIELD_TYPES.OPTIONS_FROM_SUPERTAG,
      sourceSupertag: SYS_T.HIGHLIGHT,
    });
    loroDoc.commitDoc();
    fd = loroDoc.toNodexNode(NDX_F.NOTE_HIGHLIGHTS)!;
  }
  // Ensure sourceSupertag is set
  if (fd.sourceSupertag !== SYS_T.HIGHLIGHT) {
    loroDoc.setNodeData(NDX_F.NOTE_HIGHLIGHTS, 'sourceSupertag', SYS_T.HIGHLIGHT);
    loroDoc.commitDoc();
    fd = loroDoc.toNodexNode(NDX_F.NOTE_HIGHLIGHTS)!;
  }
  return fd;
}

/**
 * Create/find #highlight tagDef with fixed ID SYS_T200.
 * Template fields: Source (options_from_supertag → #source), Anchor (hidden plain).
 */
export function ensureHighlightTagDef(_store: HighlightNodeStore): void {
  // Create tagDef if needed
  let tagDef = loroDoc.toNodexNode(SYS_T.HIGHLIGHT);
  if (!tagDef) {
    loroDoc.createNode(SYS_T.HIGHLIGHT, SYSTEM_NODE_IDS.SCHEMA);
    loroDoc.setNodeDataBatch(SYS_T.HIGHLIGHT, {
      type: 'tagDef',
      name: 'highlight',
      color: 'yellow',
    });
    loroDoc.commitDoc();
    tagDef = loroDoc.toNodexNode(SYS_T.HIGHLIGHT);
  } else if (tagDef.color === 'amber') {
    // Migrate: amber → yellow (new dedicated highlight color)
    loroDoc.setNodeData(SYS_T.HIGHLIGHT, 'color', 'yellow');
    loroDoc.commitDoc();
  }

  // Ensure Source field (with fixed ID)
  const sourceFd = ensureHighlightSourceFieldDef();
  _sourceFieldDefId = sourceFd.id;

  // Ensure Anchor hidden field (with fixed ID)
  ensureHighlightAnchorFieldDef();
}

/**
 * Create/find #note tagDef with fixed ID SYS_T201.
 * Template field: Highlights (options_from_supertag → #highlight).
 */
export function ensureNoteTagDef(_store: HighlightNodeStore): void {
  const tagDef = loroDoc.toNodexNode(SYS_T.NOTE);
  if (!tagDef) {
    loroDoc.createNode(SYS_T.NOTE, SYSTEM_NODE_IDS.SCHEMA);
    loroDoc.setNodeDataBatch(SYS_T.NOTE, {
      type: 'tagDef',
      name: 'note',
      color: 'blue',
    });
    loroDoc.commitDoc();
  }

  // Ensure Highlights template field
  ensureNoteHighlightsFieldDef();
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

// ── Create bare highlight ──

export interface CreateHighlightOnlyParams {
  store: HighlightNodeStore;
  /** The highlighted/selected text from the webpage. */
  selectedText: string;
  /** Parent clip page node ID. */
  clipNodeId: string;
  /** JSON-serialized anchor data (stored in Anchor hidden field). */
  anchor?: string;
}

/**
 * Create a bare #highlight node as direct child of clip page (no #note).
 *
 * Data structure created:
 * ```
 * clipPage #source
 *   └── selectedText #highlight        ← direct child of clip
 *       ├── Source (fieldEntry) → clipPage  ← auto-init
 *       └── Anchor (fieldEntry) = anchorJSON ← hidden
 * ```
 */
export function createHighlightOnly(params: CreateHighlightOnlyParams): {
  highlightNode: NodexNode;
} {
  const { store, selectedText, clipNodeId, anchor } = params;

  // 1. Create #highlight node as direct child of clip page
  const hlNode = store.createChild(clipNodeId, undefined, { name: selectedText });

  // 2. Apply #highlight tag — triggers Source auto-init + Anchor fieldEntry
  store.applyTag(hlNode.id, SYS_T.HIGHLIGHT);

  // 3. Store anchor data in the hidden Anchor field
  if (anchor) {
    store.setFieldValue(hlNode.id, NDX_F.HIGHLIGHT_ANCHOR, [anchor]);
  }

  return {
    highlightNode: loroDoc.toNodexNode(hlNode.id)!,
  };
}

// ── Add note to existing highlight ──

export interface AddNoteForHighlightParams {
  store: HighlightNodeStore;
  /** ID of the existing bare #highlight node. */
  highlightNodeId: string;
  /** Parent clip page node ID. */
  clipNodeId: string;
  /** User's own thought — the note text. */
  noteText: string;
  /** Additional child note entries (depth 0 = direct children of #note). */
  extraNoteEntries?: Array<{ text: string; depth: number }>;
}

/**
 * Add a #note for an existing bare #highlight.
 * The #highlight stays in place; #note is created as a sibling with a
 * reference to the highlight in its Highlights field.
 *
 * Data structure created:
 * ```
 * clipPage #source
 *   ├── selectedText #highlight       ← stays here, untouched
 *   └── noteText #note                ← new sibling
 *       ├── Highlights (fieldEntry)
 *       │   └── ref → #highlight      ← reference node (targetId)
 *       └── extra children
 * ```
 */
export function addNoteForHighlight(params: AddNoteForHighlightParams): {
  noteNode: NodexNode;
} {
  const { store, highlightNodeId, clipNodeId, noteText, extraNoteEntries } = params;

  // 1. Create #note node as child of clip page
  const noteNode = store.createChild(clipNodeId, undefined, { name: noteText });

  // 2. Apply #note tag — triggers Highlights fieldEntry template creation
  store.applyTag(noteNode.id, SYS_T.NOTE);

  // 3. Find the Highlights fieldEntry (created by applyTag template)
  let highlightsFeId = findFieldEntry(noteNode.id, NDX_F.NOTE_HIGHLIGHTS);
  if (!highlightsFeId) {
    highlightsFeId = nanoid();
    loroDoc.createNode(highlightsFeId, noteNode.id);
    loroDoc.setNodeDataBatch(highlightsFeId, { type: 'fieldEntry', fieldDefId: NDX_F.NOTE_HIGHLIGHTS });
    loroDoc.commitDoc();
  }

  // 4. Create reference node pointing to the existing #highlight
  const refId = nanoid();
  loroDoc.createNode(refId, highlightsFeId);
  loroDoc.setNodeDataBatch(refId, { type: 'reference', targetId: highlightNodeId });
  loroDoc.commitDoc();

  // 5. Create extra note children under #note
  if (extraNoteEntries && extraNoteEntries.length > 0) {
    const parentStack: string[] = [noteNode.id];
    for (const entry of extraNoteEntries) {
      const depth = Math.max(0, entry.depth);
      const parentIdx = Math.min(depth, parentStack.length - 1);
      const parentId = parentStack[parentIdx];
      const child = store.createChild(parentId, undefined, { name: entry.text.trim() });
      parentStack[depth + 1] = child.id;
      parentStack.length = depth + 2;
    }
  }

  return {
    noteNode: loroDoc.toNodexNode(noteNode.id)!,
  };
}

/**
 * Find a fieldEntry node under a parent by fieldDefId.
 */
function findFieldEntry(parentId: string, fieldDefId: string): string | null {
  const children = loroDoc.getChildren(parentId);
  for (const cid of children) {
    const n = loroDoc.toNodexNode(cid);
    if (n?.type === 'fieldEntry' && n.fieldDefId === fieldDefId) return cid;
  }
  return null;
}

/**
 * Get all #note nodes for a given clip page (direct children with #note tag).
 */
export function getNotesForClip(clipNodeId: string): NodexNode[] {
  const results: NodexNode[] = [];
  const clipChildren = loroDoc.getChildren(clipNodeId);
  for (const childId of clipChildren) {
    const child = loroDoc.toNodexNode(childId);
    if (!child || !child.tags.includes(SYS_T.NOTE)) continue;
    results.push(child);
  }
  return results;
}

/**
 * Get highlight nodes from a #note's Highlights field.
 * Resolves reference nodes to the actual #highlight they point to.
 */
export function getHighlightsForNote(noteNodeId: string): NodexNode[] {
  const feId = findFieldEntry(noteNodeId, NDX_F.NOTE_HIGHLIGHTS);
  if (!feId) return [];
  const results: NodexNode[] = [];
  for (const cid of loroDoc.getChildren(feId)) {
    const child = loroDoc.toNodexNode(cid);
    if (child?.type !== 'reference' || !child.targetId) continue;
    const target = loroDoc.toNodexNode(child.targetId);
    if (target?.tags.includes(SYS_T.HIGHLIGHT)) {
      results.push(target);
    }
  }
  return results;
}

/**
 * Get bare #highlight nodes that are direct children of a clip page (no #note wrapper).
 */
export function getBareHighlightsForClip(clipNodeId: string): NodexNode[] {
  const results: NodexNode[] = [];
  const clipChildren = loroDoc.getChildren(clipNodeId);
  for (const childId of clipChildren) {
    const child = loroDoc.toNodexNode(childId);
    if (child?.tags.includes(SYS_T.HIGHLIGHT)) {
      results.push(child);
    }
  }
  return results;
}

/**
 * Get the anchor JSON from a #highlight node's hidden Anchor field.
 */
export function getHighlightAnchor(highlightNodeId: string): string | null {
  const feId = findFieldEntry(highlightNodeId, NDX_F.HIGHLIGHT_ANCHOR);
  if (!feId) return null;
  const feChildren = loroDoc.getChildren(feId);
  if (feChildren.length === 0) return null;
  const valueNode = loroDoc.toNodexNode(feChildren[0]);
  return valueNode?.name ?? null;
}

/**
 * Find all #note nodes associated with a #highlight (via Highlights field reference).
 * A highlight can have multiple notes (multiple perspectives/thoughts).
 */
export function findNotesForHighlight(highlightNodeId: string): NodexNode[] {
  const parentId = loroDoc.getParentId(highlightNodeId);
  if (!parentId) return [];
  const results: NodexNode[] = [];
  for (const note of getNotesForClip(parentId)) {
    const highlights = getHighlightsForNote(note.id);
    if (highlights.some(hl => hl.id === highlightNodeId)) {
      results.push(note);
    }
  }
  return results;
}

/**
 * Reset cached field IDs (for testing).
 */
export function _resetHighlightCache(): void {
  _sourceFieldDefId = null;
}

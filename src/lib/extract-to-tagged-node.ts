/**
 * extractToTaggedNode — ProseMirror operation for # Tag toolbar action.
 *
 * Takes the current selection, creates a Library node with the selected tag,
 * and replaces the selection with an inline reference.
 *
 * For #highlight tags, sets the Source field to the nearest #source ancestor.
 */
import type { EditorView } from 'prosemirror-view';
import type { NodexNode, InlineRefEntry } from '../types/index.js';
import { CONTAINER_IDS, SYS_T } from '../types/index.js';
import { pmSchema } from '../components/editor/pm-schema.js';
import { docToMarks } from './pm-doc-utils.js';
import * as loroDoc from './loro-doc.js';
import {
  createHighlightNode,
  type HighlightNodeStore,
} from './highlight-service.js';
import { findTagDefByName } from './webclip-service.js';

export interface ExtractResult {
  /** The newly created Library node. */
  node: NodexNode;
  /** Updated text after replacement (contains \uFFFC). */
  newText: string;
  /** Updated inline refs. */
  newInlineRefs: InlineRefEntry[];
}

/**
 * Resolve the nearest ancestor (including self) tagged with #source.
 * Falls back to the current node when no clip ancestor exists.
 */
export function resolveClipNodeIdForHighlight(nodeId: string): string {
  const sourceTagDef = findTagDefByName(null, CONTAINER_IDS.SCHEMA, 'source');
  if (!sourceTagDef) return nodeId;

  let currentId: string | null = nodeId;
  while (currentId) {
    const node = loroDoc.toNodexNode(currentId);
    if (node?.tags.includes(sourceTagDef.id)) {
      return currentId;
    }
    currentId = loroDoc.getParentId(currentId);
  }

  return nodeId;
}

/**
 * Extract selected text to a tagged Library node, replacing selection with inline reference.
 *
 * @param view - ProseMirror EditorView with active selection
 * @param tagDefId - The tagDef to apply to the new node
 * @param nodeId - Current node ID (for Source field if #highlight)
 * @param store - Node store for CRUD operations
 * @param currentInlineRefs - Current inlineRefs of the node
 * @returns ExtractResult with new node and updated content, or null if no selection
 */
export function extractToTaggedNode(
  view: EditorView,
  tagDefId: string,
  nodeId: string,
  store: HighlightNodeStore,
  currentInlineRefs: InlineRefEntry[],
): ExtractResult | null {
  const { from, to } = view.state.selection;
  if (from === to) return null;

  const selectedText = view.state.doc.textBetween(from, to);
  if (!selectedText.trim()) return null;

  // 1. Resolve clip page context for #highlight Source field
  const clipPageId = resolveClipNodeIdForHighlight(nodeId);

  // 2. Create the Library node based on tag type
  let newNode: NodexNode;

  if (tagDefId === SYS_T.HIGHLIGHT) {
    // Use highlight-service for #highlight with automatic field population
    newNode = createHighlightNode({
      store,
      selectedText,
      clipNodeId: clipPageId,
    });
  } else {
    // Generic tag: create in LIBRARY and apply tag
    newNode = store.createChild(CONTAINER_IDS.LIBRARY, undefined, { name: selectedText });
    store.applyTag(newNode.id, tagDefId);
  }

  // 3. Replace ProseMirror selection with inline reference atom
  const inlineRefNode = pmSchema.nodes.inlineReference.create({
    targetNodeId: newNode.id,
    displayName: selectedText,
  });

  const tr = view.state.tr.replaceWith(from, to, inlineRefNode);
  view.dispatch(tr);

  // 4. Compute updated content (text + inlineRefs)
  const parsed = docToMarks(view.state.doc);

  return {
    node: newNode,
    newText: parsed.text,
    newInlineRefs: parsed.inlineRefs,
  };
}

/**
 * extractToTaggedNode — ProseMirror operation for # Tag toolbar action.
 *
 * Takes the current selection, creates a Today node with the selected tag,
 * and replaces the selection with an inline reference.
 *
 * For #highlight tags, sets the Source field to the nearest #source ancestor.
 */
import type { EditorView } from 'prosemirror-view';
import type { NodexNode, InlineRefEntry } from '../types/index.js';
import { SYS_T } from '../types/index.js';
import { pmSchema } from '../components/editor/pm-schema.js';
import { docToMarks } from './pm-doc-utils.js';
import * as loroDoc from './loro-doc.js';
import { ensureTodayNode } from './journal.js';
import {
  createHighlightOnly,
  type HighlightNodeStore,
} from './highlight-service.js';

export interface ExtractResult {
  /** The newly created tagged node. */
  node: NodexNode;
  /** Updated text after replacement (contains \uFFFC). */
  newText: string;
  /** Updated inline refs. */
  newInlineRefs: InlineRefEntry[];
}

/**
 * Resolve the nearest ancestor (including self) tagged with #source.
 * Returns null when no clip ancestor exists.
 */
export function resolveClipNodeIdForHighlight(nodeId: string): string | null {
  // Use fixed ID directly — no need to search by name
  if (!loroDoc.toNodexNode(SYS_T.SOURCE)) return null;

  let currentId: string | null = nodeId;
  while (currentId) {
    const node = loroDoc.toNodexNode(currentId);
    if (node?.tags.includes(SYS_T.SOURCE)) {
      return currentId;
    }
    currentId = loroDoc.getParentId(currentId);
  }

  return null;
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

  if (tagDefId === SYS_T.HIGHLIGHT && clipPageId) {
    // Create bare #highlight under clip page
    const { highlightNode } = createHighlightOnly({
      store,
      selectedText,
      clipNodeId: clipPageId,
    });
    newNode = highlightNode;
  } else {
    // Generic tag or no clip ancestor: create under Today and apply tag
    const parentId = ensureTodayNode();
    newNode = store.createChild(parentId, undefined, { name: selectedText });
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

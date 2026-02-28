/**
 * extractToTaggedNode — ProseMirror operation for # Tag toolbar action.
 *
 * Takes the current selection, creates a Library node with the selected tag,
 * and replaces the selection with an inline reference.
 *
 * For #highlight tags, also fills Source/Color fields automatically.
 */
import type { EditorView } from 'prosemirror-view';
import type { NodexNode, InlineRefEntry } from '../types/index.js';
import { CONTAINER_IDS, SYS_T } from '../types/index.js';
import { pmSchema } from '../components/editor/pm-schema.js';
import { docToMarks } from './pm-doc-utils.js';
import {
  createHighlightNode,
  getSourceFieldDefId,
  getColorFieldDefId,
  getColorOptionId,
  DEFAULT_HIGHLIGHT_COLOR,
  type HighlightNodeStore,
} from './highlight-service.js';

export interface ExtractResult {
  /** The newly created Library node. */
  node: NodexNode;
  /** Updated text after replacement (contains \uFFFC). */
  newText: string;
  /** Updated inline refs. */
  newInlineRefs: InlineRefEntry[];
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

  // 1. Find the clip page ID (walk up the tree to find the nearest ancestor with #web_clip tag)
  // For now, use the direct parent or current node context
  const clipPageId = nodeId;

  // 2. Create the Library node based on tag type
  let newNode: NodexNode;

  if (tagDefId === SYS_T.HIGHLIGHT) {
    // Use highlight-service for #highlight with automatic field population
    newNode = createHighlightNode({
      store,
      selectedText,
      clipNodeId: clipPageId,
      color: DEFAULT_HIGHLIGHT_COLOR,
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

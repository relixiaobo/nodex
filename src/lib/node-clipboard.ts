/**
 * Serialize selected nodes to Markdown and write to clipboard.
 *
 * Output format uses `- ` list items with 2-space indent,
 * compatible with paste-parser.ts `parseMultiLinePaste`.
 */

import * as loroDoc from './loro-doc.js';
import { CONTAINER_IDS } from '../types/index.js';
import { useNodeStore } from '../stores/node-store.js';

/**
 * Recursively serialize a node and its children to Markdown list format.
 */
function serializeNode(nodeId: string, depth: number): string {
  const node = loroDoc.toNodexNode(nodeId);
  if (!node) return '';

  const indent = '  '.repeat(depth);
  const name = node.name?.trim() || '';
  let result = `${indent}- ${name}\n`;

  const children = loroDoc.getChildren(nodeId);
  for (const childId of children) {
    const childNode = loroDoc.toNodexNode(childId);
    // Skip field entries (tuples) — only serialize content nodes
    if (childNode?.type === 'fieldEntry') continue;
    result += serializeNode(childId, depth + 1);
  }

  return result;
}

/**
 * Serialize an array of node IDs to Markdown list text.
 * Each top-level node starts at depth 0; children are indented.
 */
export function serializeNodesToMarkdown(nodeIds: string[]): string {
  let result = '';
  for (const id of nodeIds) {
    result += serializeNode(id, 0);
  }
  return result.trimEnd();
}

/**
 * Copy selected nodes to the system clipboard as Markdown text.
 */
export async function copyNodesToClipboard(nodeIds: string[]): Promise<void> {
  if (nodeIds.length === 0) return;
  const markdown = serializeNodesToMarkdown(nodeIds);
  if (!markdown) return;
  await navigator.clipboard.writeText(markdown);
}

/**
 * Cut selected nodes: copy to clipboard then move to Trash.
 */
export async function cutNodesToClipboard(nodeIds: string[]): Promise<void> {
  if (nodeIds.length === 0) return;
  await copyNodesToClipboard(nodeIds);

  const { trashNode } = useNodeStore.getState();
  // Trash bottom-up to avoid index shift
  for (let i = nodeIds.length - 1; i >= 0; i--) {
    trashNode(nodeIds[i]);
  }
}

/**
 * Serialize selected nodes to Markdown and write to clipboard.
 *
 * Output format uses `- ` list items with 2-space indent,
 * compatible with paste-parser.ts `parseMultiLinePaste`.
 *
 * Field entries use `field name:: ` format:
 *   - field name::
 *     - value node
 */

import * as loroDoc from './loro-doc.js';
import { useNodeStore } from '../stores/node-store.js';

/**
 * Serialize a fieldEntry node to `- field name:: \n  - value\n  - value\n`.
 * Resolves the field name from the fieldDef.
 */
function serializeFieldEntry(nodeId: string, depth: number): string {
  const node = loroDoc.toNodexNode(nodeId);
  if (!node) return '';

  const fieldDef = node.fieldDefId ? loroDoc.toNodexNode(node.fieldDefId) : null;
  const fieldName = fieldDef?.name?.trim() || '';
  const indent = '  '.repeat(depth);
  let result = `${indent}- ${fieldName}:: \n`;

  const children = loroDoc.getChildren(nodeId);
  for (const childId of children) {
    result += serializeNode(childId, depth + 1);
  }

  return result;
}

/**
 * Recursively serialize a node and its children to Markdown list format.
 * Field entries are serialized with `name:: ` Tana-style syntax.
 */
function serializeNode(nodeId: string, depth: number): string {
  const node = loroDoc.toNodexNode(nodeId);
  if (!node) return '';

  // Delegate to field serializer for fieldEntry nodes
  if (node.type === 'fieldEntry') {
    return serializeFieldEntry(nodeId, depth);
  }

  const indent = '  '.repeat(depth);
  const name = node.name?.trim() || '';
  let result = `${indent}- ${name}\n`;

  const children = loroDoc.getChildren(nodeId);
  for (const childId of children) {
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
 * Write text to the system clipboard.
 * Uses async Clipboard API with a synchronous fallback for Chrome extension contexts
 * where the async API may be restricted.
 */
export function writeToClipboard(text: string): void {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {
      clipboardFallback(text);
    });
  } else {
    clipboardFallback(text);
  }
}

function clipboardFallback(text: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

/** HTML attribute used to tag clipboard content as a soma node link. */
export const NODE_LINK_ATTR = 'data-soma-node-link';

/**
 * Write a node ID to clipboard as a "node link".
 *
 * Writes both `text/plain` (the nodeId) and `text/html` (with a marker attribute)
 * so the paste handler can detect it and create a reference node.
 */
export function writeNodeLinkToClipboard(nodeId: string): void {
  const html = `<span ${NODE_LINK_ATTR}="${nodeId}">${nodeId}</span>`;
  if (navigator.clipboard?.write) {
    navigator.clipboard.write([
      new ClipboardItem({
        'text/plain': new Blob([nodeId], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      }),
    ]).catch(() => {
      // Fallback: plain text only (reference detection won't work outside soma)
      writeToClipboard(nodeId);
    });
  } else {
    writeToClipboard(nodeId);
  }
}

/**
 * Extract a node link ID from clipboard HTML, or null if not a soma node link.
 */
export function parseNodeLinkFromHtml(html: string): string | null {
  const match = html.match(new RegExp(`${NODE_LINK_ATTR}="([^"]+)"`));
  return match?.[1] ?? null;
}

/**
 * Copy selected nodes to the system clipboard as Markdown text.
 */
export function copyNodesToClipboard(nodeIds: string[]): void {
  if (nodeIds.length === 0) return;
  const markdown = serializeNodesToMarkdown(nodeIds);
  if (!markdown) return;
  writeToClipboard(markdown);
}

/**
 * Cut selected nodes: copy to clipboard then move to Trash.
 */
export function cutNodesToClipboard(nodeIds: string[]): void {
  if (nodeIds.length === 0) return;
  copyNodesToClipboard(nodeIds);

  const { trashNode } = useNodeStore.getState();
  // Trash bottom-up to avoid index shift
  for (let i = nodeIds.length - 1; i >= 0; i--) {
    trashNode(nodeIds[i]);
  }
}

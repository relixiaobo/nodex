import { deserializeAnchor, serializeAnchor } from './highlight-anchor.js';
import type { HighlightCreatePayload, HighlightRestorePayload } from './highlight-messaging.js';
import {
  createCommentNode,
  createHighlightNode,
  DEFAULT_HIGHLIGHT_COLOR,
  getAnchorFieldDefId,
  getColorFieldDefId,
  getHighlightsForClip,
  HIGHLIGHT_COLORS,
  type HighlightColor,
  type HighlightNodeStore,
} from './highlight-service.js';
import { createLightweightClip, findClipNodeByUrl } from './webclip-service.js';
import * as loroDoc from './loro-doc.js';

export interface CreateHighlightFromPayloadResult {
  highlightNodeId: string;
  clipNodeId: string;
}

function isHighlightColor(color: string): color is HighlightColor {
  return (HIGHLIGHT_COLORS as readonly string[]).includes(color);
}

function findFieldEntry(nodeId: string, fieldDefId: string): string | null {
  const children = loroDoc.getChildren(nodeId);
  for (const childId of children) {
    const child = loroDoc.toNodexNode(childId);
    if (child?.type === 'fieldEntry' && child.fieldDefId === fieldDefId) {
      return childId;
    }
  }
  return null;
}

export function getPlainFieldValue(nodeId: string, fieldDefId: string): string | null {
  const entryId = findFieldEntry(nodeId, fieldDefId);
  if (!entryId) return null;
  const valueChildren = loroDoc.getChildren(entryId);
  if (valueChildren.length === 0) return null;
  return loroDoc.toNodexNode(valueChildren[0])?.name ?? null;
}

export function getOptionsFieldLabel(nodeId: string, fieldDefId: string): string | null {
  const entryId = findFieldEntry(nodeId, fieldDefId);
  if (!entryId) return null;
  const valueChildren = loroDoc.getChildren(entryId);
  if (valueChildren.length === 0) return null;
  const valueNode = loroDoc.toNodexNode(valueChildren[0]);
  if (!valueNode?.targetId) return null;
  return loroDoc.toNodexNode(valueNode.targetId)?.name ?? null;
}

export async function findOrCreateClipNodeForUrl(
  url: string,
  title: string,
  store: HighlightNodeStore,
): Promise<string> {
  const existing = findClipNodeByUrl(url);
  if (existing) return existing;
  return createLightweightClip(url, title, store);
}

export async function createHighlightFromPayload(
  payload: HighlightCreatePayload,
  store: HighlightNodeStore,
): Promise<CreateHighlightFromPayloadResult> {
  const clipNodeId = await findOrCreateClipNodeForUrl(payload.pageUrl, payload.pageTitle, store);
  const color = payload.color && isHighlightColor(payload.color)
    ? payload.color
    : DEFAULT_HIGHLIGHT_COLOR;

  const highlight = createHighlightNode({
    store,
    selectedText: payload.selectedText,
    clipNodeId,
    color,
    anchor: serializeAnchor(payload.anchor),
    pageUrl: payload.pageUrl,
  });

  if (payload.withNote) {
    createCommentNode(store, highlight.id, '');
  }

  return {
    highlightNodeId: highlight.id,
    clipNodeId,
  };
}

export function buildHighlightRestorePayload(clipNodeId: string): HighlightRestorePayload {
  const items: HighlightRestorePayload['highlights'] = [];
  const anchorFieldDefId = getAnchorFieldDefId();
  const colorFieldDefId = getColorFieldDefId();
  const highlights = getHighlightsForClip(clipNodeId);

  for (const node of highlights) {
    const anchorRaw = getPlainFieldValue(node.id, anchorFieldDefId);
    if (!anchorRaw) continue;

    try {
      const parsedAnchor = deserializeAnchor(anchorRaw);
      if (!parsedAnchor) continue;
      const colorLabel = getOptionsFieldLabel(node.id, colorFieldDefId);
      const color = colorLabel && isHighlightColor(colorLabel)
        ? colorLabel
        : DEFAULT_HIGHLIGHT_COLOR;

      items.push({
        id: node.id,
        anchor: parsedAnchor,
        color,
      });
    } catch {
      // Ignore invalid anchors and keep restoring other highlights.
      continue;
    }
  }

  return { highlights: items };
}

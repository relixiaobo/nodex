import { deserializeAnchor, serializeAnchor } from './highlight-anchor.js';
import type { HighlightCreatePayload, HighlightRestorePayload } from './highlight-messaging.js';
import {
  createCommentNode,
  createHighlightNode,
  getClipFieldDefId,
  getHighlightsForClip,
  type HighlightNodeStore,
} from './highlight-service.js';
import { createLightweightClip, findClipNodeByUrl } from './webclip-service.js';
import { resolveTagColor } from './tag-colors.js';
import { SYS_T } from '../types/index.js';
import * as loroDoc from './loro-doc.js';

export interface CreateHighlightFromPayloadResult {
  highlightNodeId: string;
  clipNodeId: string;
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

  const highlight = createHighlightNode({
    store,
    selectedText: payload.selectedText,
    clipNodeId,
    anchor: serializeAnchor(payload.anchor),
  });

  if (payload.withNote) {
    createCommentNode(store, highlight.id, '');
  }

  return {
    highlightNodeId: highlight.id,
    clipNodeId,
  };
}

/**
 * Convert a hex color to a semi-transparent rgba suitable for highlight backgrounds.
 */
function hexToHighlightBg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.3)`;
}

export function buildHighlightRestorePayload(clipNodeId: string): HighlightRestorePayload {
  const items: HighlightRestorePayload['highlights'] = [];
  const highlights = getHighlightsForClip(clipNodeId);

  // All highlights share the tagDef's color
  const tagColor = resolveTagColor(SYS_T.HIGHLIGHT).text;
  const bgColor = hexToHighlightBg(tagColor);

  for (const node of highlights) {
    // Anchor stored in node description
    const anchorRaw = loroDoc.toNodexNode(node.id)?.description;
    if (!anchorRaw) continue;

    try {
      const parsedAnchor = deserializeAnchor(anchorRaw);
      if (!parsedAnchor) continue;

      items.push({
        id: node.id,
        anchor: parsedAnchor,
        color: bgColor,
      });
    } catch {
      // Ignore invalid anchors and keep restoring other highlights.
      continue;
    }
  }

  return { highlights: items };
}

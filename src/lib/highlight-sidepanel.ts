import { deserializeAnchor, serializeAnchor } from './highlight-anchor.js';
import type { HighlightCreatePayload, HighlightRestorePayload } from './highlight-messaging.js';
import {
  createNoteNode,
  createHighlightNode,
  getHighlightsForClip,
  type HighlightNodeStore,
} from './highlight-service.js';
import { createLightweightClip, findClipNodeByUrl, normalizeUrl } from './webclip-service.js';
import { resolveTagColor } from './tag-colors.js';
import { CONTAINER_IDS, SYS_T } from '../types/index.js';
import * as loroDoc from './loro-doc.js';

export interface CreateHighlightFromPayloadResult {
  highlightNodeId: string;
  clipNodeId: string;
}

export interface UpsertHighlightNoteResult {
  noteNodeId: string;
  created: boolean;
}

const pendingClipCreationByUrl = new Map<string, Promise<string>>();

/**
 * Collect all highlight node IDs.
 * Highlights live as children of clip pages in LIBRARY, INBOX, or CLIPS.
 */
export function collectAllHighlightNodeIds(): Set<string> {
  const ids = new Set<string>();
  const containers = [CONTAINER_IDS.LIBRARY, CONTAINER_IDS.INBOX, CONTAINER_IDS.CLIPS];

  for (const containerId of containers) {
    const children = loroDoc.getChildren(containerId);
    for (const childId of children) {
      const grandChildren = loroDoc.getChildren(childId);
      for (const gcId of grandChildren) {
        const gc = loroDoc.toNodexNode(gcId);
        if (gc?.tags.includes(SYS_T.HIGHLIGHT)) {
          ids.add(gcId);
        }
      }
    }
  }
  return ids;
}

export function getRemovedHighlightIds(
  previousIds: Set<string>,
  nextIds: Set<string>,
): string[] {
  const removed: string[] = [];
  for (const id of previousIds) {
    if (!nextIds.has(id)) removed.push(id);
  }
  return removed;
}

export async function findOrCreateClipNodeForUrl(
  url: string,
  title: string,
  store: HighlightNodeStore,
): Promise<string> {
  const normalized = normalizeUrl(url);
  const pending = pendingClipCreationByUrl.get(normalized);
  if (pending) return pending;

  const task = (async () => {
    const existing = findClipNodeByUrl(url);
    if (existing) return existing;
    return createLightweightClip(url, title, store);
  })();

  pendingClipCreationByUrl.set(normalized, task);
  try {
    return await task;
  } finally {
    pendingClipCreationByUrl.delete(normalized);
  }
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

  const noteText = payload.noteText?.trim();
  if (noteText) {
    createNoteNode(store, highlight.id, noteText);
  } else if (payload.withNote) {
    createNoteNode(store, highlight.id, '');
  }

  return {
    highlightNodeId: highlight.id,
    clipNodeId,
  };
}

export function upsertHighlightNote(
  store: HighlightNodeStore,
  highlightNodeId: string,
  noteText: string,
): UpsertHighlightNoteResult | null {
  const trimmed = noteText.trim();
  if (!trimmed) return null;

  const existing = store
    .getChildren(highlightNodeId)
    .find((child) => child.tags.includes(SYS_T.NOTE));

  if (existing) {
    if (existing.name !== trimmed) {
      loroDoc.setNodeRichTextContent(
        existing.id,
        trimmed,
        existing.marks ?? [],
        existing.inlineRefs ?? [],
      );
      loroDoc.commitDoc();
    }
    return {
      noteNodeId: existing.id,
      created: false,
    };
  }

  const created = createNoteNode(store, highlightNodeId, trimmed);
  return {
    noteNodeId: created.id,
    created: true,
  };
}

export function buildHighlightRestorePayload(clipNodeId: string): HighlightRestorePayload {
  const items: HighlightRestorePayload['highlights'] = [];
  const highlights = getHighlightsForClip(clipNodeId);

  // All highlights share the tagDef's color
  const tagColor = resolveTagColor(SYS_T.HIGHLIGHT).text;

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
        color: tagColor,
        hasComment: hasNoteChild(node.id),
      });
    } catch {
      // Ignore invalid anchors and keep restoring other highlights.
      continue;
    }
  }

  return { highlights: items };
}

function hasNoteChild(highlightNodeId: string): boolean {
  const children = loroDoc.getChildren(highlightNodeId);
  for (const childId of children) {
    const child = loroDoc.toNodexNode(childId);
    if (child?.tags.includes(SYS_T.NOTE)) return true;
  }
  return false;
}

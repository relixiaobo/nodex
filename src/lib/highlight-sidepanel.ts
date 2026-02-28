import { deserializeAnchor, serializeAnchor } from './highlight-anchor.js';
import type { HighlightCreatePayload, HighlightRestorePayload } from './highlight-messaging.js';
import {
  createCommentNode,
  createHighlightNode,
  getSourceFieldDefId,
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
  commentNodeId: string;
  created: boolean;
}

const pendingClipCreationByUrl = new Map<string, Promise<string>>();

export function collectHighlightNodeIdsInLibrary(): Set<string> {
  const ids = new Set<string>();
  const children = loroDoc.getChildren(CONTAINER_IDS.LIBRARY);
  for (const childId of children) {
    const node = loroDoc.toNodexNode(childId);
    if (node?.tags.includes(SYS_T.HIGHLIGHT)) {
      ids.add(childId);
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

  if (!hasReferenceToTarget(store, clipNodeId, highlight.id)) {
    store.addReference(clipNodeId, highlight.id);
  }

  const noteText = payload.noteText?.trim();
  if (noteText) {
    createCommentNode(store, highlight.id, noteText);
  } else if (payload.withNote) {
    createCommentNode(store, highlight.id, '');
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
    .find((child) => child.tags.includes(SYS_T.COMMENT));

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
      commentNodeId: existing.id,
      created: false,
    };
  }

  const created = createCommentNode(store, highlightNodeId, trimmed);
  return {
    commentNodeId: created.id,
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
        hasComment: hasCommentChild(node.id),
      });
    } catch {
      // Ignore invalid anchors and keep restoring other highlights.
      continue;
    }
  }

  return { highlights: items };
}

function hasReferenceToTarget(store: HighlightNodeStore, parentId: string, targetNodeId: string): boolean {
  const children = store.getChildren(parentId);
  return children.some((child) => child.type === 'reference' && child.targetId === targetNodeId);
}

function hasCommentChild(highlightNodeId: string): boolean {
  const children = loroDoc.getChildren(highlightNodeId);
  for (const childId of children) {
    const child = loroDoc.toNodexNode(childId);
    if (child?.tags.includes(SYS_T.COMMENT)) return true;
  }
  return false;
}

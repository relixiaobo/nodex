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

export interface SaveHighlightNotesResult {
  kept: number;
  created: number;
  deleted: number;
}

const pendingClipCreationByUrl = new Map<string, Promise<string>>();

/**
 * Collect highlight IDs from direct children of a container (container → clip → highlight).
 */
function collectHighlightsFromFlatContainer(containerId: string, ids: Set<string>): void {
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

/**
 * Collect all highlight node IDs.
 * Highlights live as children of clip pages in LIBRARY, INBOX, CLIPS, or JOURNAL day nodes.
 */
export function collectAllHighlightNodeIds(): Set<string> {
  const ids = new Set<string>();

  // Flat containers: container → clip → highlight
  for (const containerId of [CONTAINER_IDS.LIBRARY, CONTAINER_IDS.INBOX, CONTAINER_IDS.CLIPS]) {
    collectHighlightsFromFlatContainer(containerId, ids);
  }

  // Journal: Year → Week → Day → clip → highlight
  const yearIds = loroDoc.getChildren(CONTAINER_IDS.JOURNAL);
  for (const yearId of yearIds) {
    const weekIds = loroDoc.getChildren(yearId);
    for (const weekId of weekIds) {
      const dayIds = loroDoc.getChildren(weekId);
      for (const dayId of dayIds) {
        collectHighlightsFromFlatContainer(dayId, ids);
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

/**
 * Batch save notes for a highlight.
 * Aligns incoming texts with existing #note children by index:
 * - matching index → update text if changed
 * - extra texts → create new #note nodes
 * - extra existing nodes → delete
 * Empty strings are filtered out before processing.
 */
export function saveHighlightNotes(
  store: HighlightNodeStore,
  highlightNodeId: string,
  texts: string[],
): SaveHighlightNotesResult {
  const nonEmpty = texts.map((t) => t.trim()).filter(Boolean);

  // Gather existing #note children in order
  const existingNotes: { id: string; name: string }[] = [];
  const childIds = loroDoc.getChildren(highlightNodeId);
  for (const childId of childIds) {
    const child = loroDoc.toNodexNode(childId);
    if (child?.tags.includes(SYS_T.NOTE)) {
      existingNotes.push({ id: child.id, name: child.name ?? '' });
    }
  }

  let kept = 0;
  let created = 0;
  let deleted = 0;

  // Update or create
  for (let i = 0; i < nonEmpty.length; i++) {
    if (i < existingNotes.length) {
      // Update existing node if text changed
      if (existingNotes[i].name !== nonEmpty[i]) {
        const existing = loroDoc.toNodexNode(existingNotes[i].id);
        loroDoc.setNodeRichTextContent(
          existingNotes[i].id,
          nonEmpty[i],
          existing?.marks ?? [],
          existing?.inlineRefs ?? [],
        );
      }
      kept++;
    } else {
      // Create new note node
      createNoteNode(store, highlightNodeId, nonEmpty[i]);
      created++;
    }
  }

  // Delete excess existing notes (move to trash)
  for (let i = nonEmpty.length; i < existingNotes.length; i++) {
    loroDoc.moveNode(existingNotes[i].id, CONTAINER_IDS.TRASH);
    deleted++;
  }

  if (kept > 0 || created > 0 || deleted > 0) {
    loroDoc.commitDoc();
  }

  return { kept, created, deleted };
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
    // Skip template-generated fieldEntry nodes — only count user content nodes
    if (child && child.type !== 'fieldEntry') return true;
  }
  return false;
}

/** Return all note texts for a highlight (from #note-tagged children). */
export function getHighlightNoteTexts(highlightNodeId: string): string[] {
  const texts: string[] = [];
  const children = loroDoc.getChildren(highlightNodeId);
  for (const childId of children) {
    const child = loroDoc.toNodexNode(childId);
    if (child?.tags.includes(SYS_T.NOTE)) {
      texts.push(child.name ?? '');
    }
  }
  return texts;
}

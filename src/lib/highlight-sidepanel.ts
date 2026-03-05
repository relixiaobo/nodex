import { deserializeAnchor, serializeAnchor } from './highlight-anchor.js';
import type { HighlightCreatePayload, HighlightRestorePayload, NoteEntry } from './highlight-messaging.js';
import {
  createNoteWithHighlight,
  getNotesForClip,
  getHighlightsForNote,
  getHighlightAnchor,
  type HighlightNodeStore,
} from './highlight-service.js';
import { createLightweightClip, findClipNodeByUrl, normalizeUrl } from './webclip-service.js';
import { resolveTagColor } from './tag-colors.js';
import { CONTAINER_IDS, SYS_T } from '../types/index.js';
import * as loroDoc from './loro-doc.js';

export interface CreateNoteFromPayloadResult {
  noteNodeId: string;
  highlightNodeId: string;
  clipNodeId: string;
}

const pendingClipCreationByUrl = new Map<string, Promise<string>>();

/**
 * Collect highlight IDs from notes under clip pages in a flat container.
 * New model: container → clip → #note → Highlights fieldEntry → #highlight
 */
function collectHighlightsFromFlatContainer(containerId: string, ids: Set<string>): void {
  const children = loroDoc.getChildren(containerId);
  for (const clipId of children) {
    collectHighlightsUnderClip(clipId, ids);
  }
}

/**
 * Collect all #highlight node IDs under a clip page's #note children.
 */
function collectHighlightsUnderClip(clipNodeId: string, ids: Set<string>): void {
  const notes = getNotesForClip(clipNodeId);
  for (const note of notes) {
    const highlights = getHighlightsForNote(note.id);
    for (const hl of highlights) {
      ids.add(hl.id);
    }
  }
}

/**
 * Collect all highlight node IDs.
 * New model: highlights live inside #note's Highlights field, under clip pages.
 */
export function collectAllHighlightNodeIds(): Set<string> {
  const ids = new Set<string>();

  // Flat containers: container → clip → #note → highlight
  for (const containerId of [CONTAINER_IDS.LIBRARY, CONTAINER_IDS.INBOX, CONTAINER_IDS.CLIPS]) {
    collectHighlightsFromFlatContainer(containerId, ids);
  }

  // Journal: Year → Week → Day → clip → #note → highlight
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

/**
 * Create a #note with #highlight from a content script payload.
 * Note-first model: #note is the primary node, #highlight is its field value.
 */
export async function createNoteFromPayload(
  payload: HighlightCreatePayload,
  store: HighlightNodeStore,
): Promise<CreateNoteFromPayloadResult> {
  const clipNodeId = await findOrCreateClipNodeForUrl(payload.pageUrl, payload.pageTitle, store);

  // noteEntries: first entry is the note text, rest are extra children
  const noteEntries = payload.noteEntries ?? [];
  const noteText = noteEntries.length > 0 ? noteEntries[0].text.trim() : '';
  const extraEntries = noteEntries.slice(1).filter((e) => e.text.trim());

  const { noteNode, highlightNode } = createNoteWithHighlight({
    store,
    noteText,
    selectedText: payload.selectedText,
    clipNodeId,
    anchor: serializeAnchor(payload.anchor),
    extraNoteEntries: extraEntries.length > 0 ? extraEntries : undefined,
  });

  return {
    noteNodeId: noteNode.id,
    highlightNodeId: highlightNode.id,
    clipNodeId,
  };
}

/**
 * Build highlight restore payload from a clip page's #note children.
 * New model: clip → #note → Highlights fieldEntry → #highlight (anchor in Anchor field).
 */
export function buildHighlightRestorePayload(clipNodeId: string): HighlightRestorePayload {
  const items: HighlightRestorePayload['highlights'] = [];

  // All highlights share the tagDef's color
  const tagColor = resolveTagColor(SYS_T.HIGHLIGHT).text;

  const notes = getNotesForClip(clipNodeId);
  for (const note of notes) {
    const highlights = getHighlightsForNote(note.id);
    for (const hl of highlights) {
      // Anchor stored in hidden Anchor field
      const anchorRaw = getHighlightAnchor(hl.id);
      if (!anchorRaw) continue;

      try {
        const parsedAnchor = deserializeAnchor(anchorRaw);
        if (!parsedAnchor) continue;

        items.push({
          id: hl.id,
          anchor: parsedAnchor,
          color: tagColor,
          hasNote: hasNoteContent(note),
        });
      } catch {
        continue;
      }
    }
  }

  return { highlights: items };
}

/**
 * Check if a #note node has user content (non-empty name or children beyond fieldEntries).
 */
function hasNoteContent(noteNode: { id: string; name?: string }): boolean {
  if (noteNode.name && noteNode.name.trim()) return true;
  const children = loroDoc.getChildren(noteNode.id);
  for (const childId of children) {
    const child = loroDoc.toNodexNode(childId);
    if (child && child.type !== 'fieldEntry') return true;
  }
  return false;
}

/**
 * Return child note entries for a #note node (DFS over non-fieldEntry children).
 * In the new model, #note's own children (excluding fieldEntries) are the user's further notes.
 */
export function getHighlightNoteEntries(noteNodeId: string): NoteEntry[] {
  const entries: NoteEntry[] = [];

  function walk(parentId: string, depth: number): void {
    const childIds = loroDoc.getChildren(parentId);
    for (const childId of childIds) {
      const child = loroDoc.toNodexNode(childId);
      if (!child || child.type === 'fieldEntry') continue;
      entries.push({ text: child.name ?? '', depth });
      walk(childId, depth + 1);
    }
  }

  walk(noteNodeId, 0);
  return entries;
}

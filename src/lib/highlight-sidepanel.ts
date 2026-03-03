import { deserializeAnchor, serializeAnchor } from './highlight-anchor.js';
import type { HighlightCreatePayload, HighlightRestorePayload, NoteEntry } from './highlight-messaging.js';
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

  if (payload.noteEntries && payload.noteEntries.length > 0) {
    saveHighlightNotes(store, highlight.id, payload.noteEntries);
  }

  return {
    highlightNodeId: highlight.id,
    clipNodeId,
  };
}

/**
 * Recursively collect all #note descendant IDs under a parent (DFS).
 */
function collectAllNoteDescendants(parentId: string): string[] {
  const result: string[] = [];
  const childIds = loroDoc.getChildren(parentId);
  for (const childId of childIds) {
    const child = loroDoc.toNodexNode(childId);
    if (child?.tags.includes(SYS_T.NOTE)) {
      result.push(childId);
      result.push(...collectAllNoteDescendants(childId));
    }
  }
  return result;
}

/**
 * Batch save notes for a highlight.
 * Accepts structured NoteEntry[] with depth for nested note trees.
 * Deletes all existing #note descendants then rebuilds the tree.
 * Empty texts are filtered out before processing.
 */
export function saveHighlightNotes(
  store: HighlightNodeStore,
  highlightNodeId: string,
  entries: NoteEntry[],
): SaveHighlightNotesResult {
  const nonEmpty = entries.filter((e) => e.text.trim());

  // Delete all existing #note descendants (move to trash)
  const existingIds = collectAllNoteDescendants(highlightNodeId);
  let deleted = existingIds.length;
  for (const id of existingIds) {
    loroDoc.moveNode(id, CONTAINER_IDS.TRASH);
  }

  // Rebuild nested tree using a depth → parent stack
  // parentStack[depth] = nodeId that is the parent at that depth level
  const parentStack: string[] = [highlightNodeId];
  let created = 0;

  for (const entry of nonEmpty) {
    const depth = Math.max(0, entry.depth);
    // Ensure parent exists at this depth (clamp to available depth)
    const parentIdx = Math.min(depth, parentStack.length - 1);
    const parentId = parentStack[parentIdx];

    const noteNode = createNoteNode(store, parentId, entry.text.trim());
    created++;

    // Set this node as potential parent for the next depth level
    parentStack[depth + 1] = noteNode.id;
    // Trim stack to prevent stale deeper parents
    parentStack.length = depth + 2;
  }

  if (created > 0 || deleted > 0) {
    loroDoc.commitDoc();
  }

  return { kept: 0, created, deleted };
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

/** Return all note entries for a highlight (DFS over #note subtree). */
export function getHighlightNoteEntries(highlightNodeId: string): NoteEntry[] {
  const entries: NoteEntry[] = [];

  function walk(parentId: string, depth: number): void {
    const childIds = loroDoc.getChildren(parentId);
    for (const childId of childIds) {
      const child = loroDoc.toNodexNode(childId);
      if (child?.tags.includes(SYS_T.NOTE)) {
        entries.push({ text: child.name ?? '', depth });
        walk(childId, depth + 1);
      }
    }
  }

  walk(highlightNodeId, 0);
  return entries;
}

import { deserializeAnchor, serializeAnchor } from './highlight-anchor.js';
import type { HighlightCreatePayload, HighlightRestorePayload, NoteEntry } from './highlight-messaging.js';
import {
  createHighlightOnly,
  addNoteForHighlight,
  ensureNoteTagDef,
  findNotesForHighlight,
  getNotesForClip,
  getHighlightsForNote,
  getBareHighlightsForClip,
  getHighlightAnchor,
  type HighlightNodeStore,
} from './highlight-service.js';
import { createLightweightClip, findClipNodeByUrl, normalizeUrl } from './webclip-service.js';
import { resolveTagColor } from './tag-colors.js';
import { SYSTEM_NODE_IDS, SYS_T } from '../types/index.js';
import * as loroDoc from './loro-doc.js';

export interface CreateHighlightFromPayloadResult {
  highlightNodeId: string;
  noteNodeId?: string;
  clipNodeId: string;
}

const pendingClipCreationByUrl = new Map<string, Promise<string>>();

/**
 * Collect highlight IDs from clip pages in a flat container.
 */
function collectHighlightsFromFlatContainer(containerId: string, ids: Set<string>): void {
  const children = loroDoc.getChildren(containerId);
  for (const clipId of children) {
    collectHighlightsUnderClip(clipId, ids);
  }
}

/**
 * Collect all #highlight node IDs under a clip page (direct children).
 */
function collectHighlightsUnderClip(clipNodeId: string, ids: Set<string>): void {
  for (const childId of loroDoc.getChildren(clipNodeId)) {
    const child = loroDoc.toNodexNode(childId);
    if (child?.tags.includes(SYS_T.HIGHLIGHT)) {
      ids.add(childId);
    }
  }
}

/**
 * Collect all highlight node IDs across all containers.
 */
export function collectAllHighlightNodeIds(): Set<string> {
  const ids = new Set<string>();

  // Flat containers
  for (const containerId of [SYSTEM_NODE_IDS.LIBRARY, SYSTEM_NODE_IDS.INBOX, SYSTEM_NODE_IDS.CLIPS]) {
    collectHighlightsFromFlatContainer(containerId, ids);
  }

  // Journal: Year → Week → Day → clip
  const yearIds = loroDoc.getChildren(SYSTEM_NODE_IDS.JOURNAL);
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
 * Create a highlight (with optional note) from a content script payload.
 * Always creates bare #highlight first, then optionally adds #note with reference.
 */
export async function createHighlightFromPayload(
  payload: HighlightCreatePayload,
  store: HighlightNodeStore,
): Promise<CreateHighlightFromPayloadResult> {
  const clipNodeId = await findOrCreateClipNodeForUrl(payload.pageUrl, payload.pageTitle, store);

  // Always create bare #highlight as direct child of clip
  const { highlightNode } = createHighlightOnly({
    store,
    selectedText: payload.selectedText,
    clipNodeId,
    anchor: serializeAnchor(payload.anchor),
  });

  const result: CreateHighlightFromPayloadResult = {
    highlightNodeId: highlightNode.id,
    clipNodeId,
  };

  // If noteEntries provided, create #note(s) with reference to the highlight
  // Each depth-0 entry starts a new #note; depth 1+ entries are children of that note
  const noteEntries = payload.noteEntries ?? [];
  const groups = splitNoteGroups(noteEntries);
  for (const group of groups) {
    const { noteText, extraEntries } = popoverEntriesToNoteParams(group);
    if (!noteText) continue;
    ensureNoteTagDef(store);
    const { noteNode } = addNoteForHighlight({
      store,
      highlightNodeId: highlightNode.id,
      clipNodeId,
      noteText,
      extraNoteEntries: extraEntries.length > 0 ? extraEntries : undefined,
    });
    // Return the first note's ID for backward compat
    if (!result.noteNodeId) result.noteNodeId = noteNode.id;
  }

  return result;
}

/**
 * Add a note to an existing bare highlight from a content script payload.
 */
/**
 * Convert popover entries (depth 0 = root note name, depth 1+ = children)
 * to creation params (noteText + extraNoteEntries with depth - 1).
 */
function popoverEntriesToNoteParams(noteEntries: NoteEntry[]): {
  noteText: string;
  extraEntries: Array<{ text: string; depth: number }>;
} {
  const noteText = noteEntries.length > 0 ? noteEntries[0].text.trim() : '';
  const extraEntries = noteEntries.slice(1)
    .filter((e) => e.text.trim())
    .map((e) => ({ text: e.text, depth: Math.max(0, e.depth - 1) }));
  return { noteText, extraEntries };
}

export function addNoteToHighlightFromPayload(
  highlightNodeId: string,
  clipNodeId: string,
  noteEntries: NoteEntry[],
  store: HighlightNodeStore,
): { noteNodeId: string } {
  const { noteText, extraEntries } = popoverEntriesToNoteParams(noteEntries);

  const { noteNode } = addNoteForHighlight({
    store,
    highlightNodeId,
    clipNodeId,
    noteText,
    extraNoteEntries: extraEntries.length > 0 ? extraEntries : undefined,
  });

  return { noteNodeId: noteNode.id };
}

/**
 * Split flat popover entries into note groups (each depth-0 entry starts a new group).
 * Returns an array of NoteEntry[] where each sub-array is one note's entries.
 */
function splitNoteGroups(noteEntries: NoteEntry[]): NoteEntry[][] {
  const groups: NoteEntry[][] = [];
  for (const entry of noteEntries) {
    if (entry.depth === 0) {
      groups.push([entry]);
    } else if (groups.length > 0) {
      groups[groups.length - 1].push(entry);
    }
  }
  return groups;
}

/**
 * Sync popover note entries to data model for a highlight.
 * Splits entries by depth-0 boundaries into note groups, then:
 * - Updates existing notes in order
 * - Creates new notes for additional groups
 * - Deletes excess notes that were removed
 *
 * Returns the IDs of all resulting notes.
 */
export function saveNotesForHighlight(
  highlightNodeId: string,
  clipNodeId: string,
  noteEntries: NoteEntry[],
  store: HighlightNodeStore,
): { noteNodeIds: string[] } {
  const groups = splitNoteGroups(noteEntries);
  const existingNotes = findNotesForHighlight(highlightNodeId);
  const resultIds: string[] = [];

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    if (i < existingNotes.length) {
      // Update existing note
      updateNoteFromPayload(existingNotes[i].id, group, store);
      resultIds.push(existingNotes[i].id);
    } else {
      // Create new note
      ensureNoteTagDef(store);
      const { noteNodeId } = addNoteToHighlightFromPayload(highlightNodeId, clipNodeId, group, store);
      resultIds.push(noteNodeId);
    }
  }

  // Delete excess existing notes that no longer have a corresponding group
  for (let i = groups.length; i < existingNotes.length; i++) {
    loroDoc.moveNode(existingNotes[i].id, SYSTEM_NODE_IDS.TRASH);
  }
  if (groups.length < existingNotes.length) {
    loroDoc.commitDoc();
  }

  return { noteNodeIds: resultIds };
}

/**
 * Update an existing #note's content from popover entries.
 * Preserves the Highlights fieldEntry reference; replaces name and content children.
 */
export function updateNoteFromPayload(
  noteNodeId: string,
  noteEntries: NoteEntry[],
  store: HighlightNodeStore,
): void {
  const { noteText, extraEntries } = popoverEntriesToNoteParams(noteEntries);

  // 1. Update note name
  store.setNodeName(noteNodeId, noteText);

  // 2. Remove existing non-fieldEntry children
  const children = loroDoc.getChildren(noteNodeId);
  for (const childId of children) {
    const child = loroDoc.toNodexNode(childId);
    if (child && child.type !== 'fieldEntry') {
      loroDoc.deleteNode(childId);
    }
  }
  loroDoc.commitDoc();

  // 3. Create new children
  if (extraEntries.length > 0) {
    const parentStack: string[] = [noteNodeId];
    for (const entry of extraEntries) {
      const depth = Math.max(0, entry.depth);
      const parentIdx = Math.min(depth, parentStack.length - 1);
      const parentId = parentStack[parentIdx];
      const child = store.createChild(parentId, undefined, { name: entry.text.trim() });
      parentStack[depth + 1] = child.id;
      parentStack.length = depth + 2;
    }
  }
}

/**
 * Build highlight restore payload for a clip page.
 */
export function buildHighlightRestorePayload(clipNodeId: string): HighlightRestorePayload {
  const items: HighlightRestorePayload['highlights'] = [];
  const tagColor = resolveTagColor(SYS_T.HIGHLIGHT).text;

  // Collect highlight IDs that have an associated #note with content
  const idsWithNotes = new Set<string>();
  for (const note of getNotesForClip(clipNodeId)) {
    if (!hasNoteContent(note)) continue;
    for (const hl of getHighlightsForNote(note.id)) {
      idsWithNotes.add(hl.id);
    }
  }

  // All highlights are direct children of clip
  for (const hl of getBareHighlightsForClip(clipNodeId)) {
    const anchorRaw = getHighlightAnchor(hl.id);
    if (!anchorRaw) continue;
    try {
      const parsedAnchor = deserializeAnchor(anchorRaw);
      if (!parsedAnchor) continue;
      items.push({ id: hl.id, anchor: parsedAnchor, color: tagColor, hasNote: idsWithNotes.has(hl.id) });
    } catch { continue; }
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

/**
 * Find all #notes associated with a highlight and return their entries.
 * Each note becomes a depth-0 entry, with its children at depth 1+.
 * Multiple depth-0 entries = multiple notes on the same highlight.
 */
export function findNoteEntriesForHighlight(highlightNodeId: string): NoteEntry[] {
  const parentId = loroDoc.getParentId(highlightNodeId);
  if (!parentId) return [];

  const entries: NoteEntry[] = [];
  for (const note of getNotesForClip(parentId)) {
    const highlights = getHighlightsForNote(note.id);
    if (highlights.some((hl) => hl.id === highlightNodeId)) {
      if (note.name?.trim()) {
        entries.push({ text: note.name, depth: 0 });
      }
      // Offset child depths by +1: LoroDoc depth 0 (direct child of note) → popover depth 1
      entries.push(...getHighlightNoteEntries(note.id).map(e => ({ text: e.text, depth: e.depth + 1 })));
    }
  }
  return entries;
}


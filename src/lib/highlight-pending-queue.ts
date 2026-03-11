/**
 * Pending highlight queue — stores highlights in chrome.storage.local
 * when Side Panel is offline, for later consumption.
 *
 * Storage key: `soma_pending_highlights`
 * Max entries: 200 (oldest evicted on enqueue)
 * TTL: 30 days (cleaned on enqueue)
 */
import type { HighlightAnchor } from './highlight-anchor.js';
import type { NoteEntry } from './highlight-messaging.js';
import { normalizeUrl } from './url-utils.js';

// ── Constants ──

const STORAGE_KEY = 'soma_pending_highlights';
const MAX_ENTRIES = 200;
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ── Types ──

export interface PendingHighlight {
  tempId: string;
  anchor: HighlightAnchor;
  selectedText: string;
  pageUrl: string;
  normalizedUrl: string;
  pageTitle: string;
  noteEntries?: NoteEntry[];
  pageMeta?: { ogType?: string; schemaOrgType?: string; hasArticleElement?: boolean };
  createdAt: number;
  retryCount: number;
  lastError?: string;
}

// ── Internal Helpers ──

async function readQueue(): Promise<PendingHighlight[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as PendingHighlight[] | undefined) ?? [];
}

async function writeQueue(queue: PendingHighlight[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: queue });
}

function cleanup(queue: PendingHighlight[]): PendingHighlight[] {
  const now = Date.now();
  // Remove expired entries
  let cleaned = queue.filter((e) => now - e.createdAt < TTL_MS);
  // Trim to max size (keep newest)
  if (cleaned.length > MAX_ENTRIES) {
    cleaned.sort((a, b) => a.createdAt - b.createdAt);
    cleaned = cleaned.slice(cleaned.length - MAX_ENTRIES);
  }
  return cleaned;
}

// ── Public API ──

/**
 * Add a pending highlight to the queue.
 * Idempotent: skips if tempId already exists.
 * Runs cleanup (TTL + max size) on every enqueue.
 */
export async function enqueuePendingHighlight(
  entry: Omit<PendingHighlight, 'normalizedUrl' | 'createdAt' | 'retryCount'>,
): Promise<void> {
  let queue = await readQueue();

  // Idempotent: skip if already queued
  if (queue.some((e) => e.tempId === entry.tempId)) return;

  queue.push({
    ...entry,
    normalizedUrl: normalizeUrl(entry.pageUrl),
    createdAt: Date.now(),
    retryCount: 0,
  });

  queue = cleanup(queue);

  await writeQueue(queue);
}

/**
 * Get pending highlights for a specific URL (matched by normalizedUrl).
 */
export async function getPendingHighlightsForUrl(
  url: string,
): Promise<PendingHighlight[]> {
  const queue = await readQueue();
  const normalized = normalizeUrl(url);
  return queue.filter((e) => e.normalizedUrl === normalized);
}

/**
 * Get all pending highlights.
 */
export async function getAllPendingHighlights(): Promise<PendingHighlight[]> {
  return readQueue();
}

/**
 * Remove a single pending highlight by tempId.
 */
export async function removePendingHighlight(
  tempId: string,
): Promise<void> {
  const queue = await readQueue();
  const filtered = queue.filter((e) => e.tempId !== tempId);
  if (filtered.length !== queue.length) {
    await writeQueue(filtered);
  }
}

/**
 * Remove multiple pending highlights by tempId.
 */
export async function removePendingHighlights(
  tempIds: string[],
): Promise<void> {
  const idSet = new Set(tempIds);
  const queue = await readQueue();
  const filtered = queue.filter((e) => !idSet.has(e.tempId));
  if (filtered.length !== queue.length) {
    await writeQueue(filtered);
  }
}

/**
 * Find a single pending highlight by tempId.
 */
export async function findPendingHighlight(
  tempId: string,
): Promise<PendingHighlight | undefined> {
  const queue = await readQueue();
  return queue.find((e) => e.tempId === tempId);
}

/**
 * Update noteEntries for a pending highlight.
 */
export async function updatePendingHighlightNotes(
  tempId: string,
  noteEntries: NoteEntry[],
): Promise<void> {
  const queue = await readQueue();
  const entry = queue.find((e) => e.tempId === tempId);
  if (!entry) return;
  entry.noteEntries = noteEntries;
  await writeQueue(queue);
}

/**
 * Increment retryCount and set lastError for a failed entry.
 */
export async function markPendingHighlightFailed(
  tempId: string,
  error: string,
): Promise<void> {
  const queue = await readQueue();
  const entry = queue.find((e) => e.tempId === tempId);
  if (!entry) return;
  entry.retryCount++;
  entry.lastError = error;
  await writeQueue(queue);
}

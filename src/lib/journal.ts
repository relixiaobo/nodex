/**
 * Journal / date node management.
 *
 * Core function: ensureDateNode — lazily creates the Year → Week → Day
 * hierarchy under CONTAINER_IDS.JOURNAL.
 *
 * Depends on: loro-doc.ts (tree ops), date-utils.ts (pure date helpers).
 */
import { CONTAINER_IDS } from '../types/index.js';
import { SYSTEM_TAGS } from '../types/system-nodes.js';
import * as loroDoc from './loro-doc.js';
import {
  getISOWeekNumber,
  formatDayName,
  formatWeekName,
  formatYearName,
  parseDayNodeName,
  parseYearNodeName,
  getAdjacentDay,
  extractSortValue,
} from './date-utils.js';

// ============================================================
// Core: find or create child by name
// ============================================================

/**
 * Find a child node of `parentId` whose name matches `name`.
 * Returns the child's nodex ID, or null if not found.
 */
function findChildByName(parentId: string, name: string): string | null {
  const children = loroDoc.getChildren(parentId);
  for (const cid of children) {
    const node = loroDoc.toNodexNode(cid);
    if (node?.name === name) return cid;
  }
  return null;
}

/**
 * Find insertion index for descending order among siblings.
 * Uses extractSortValue to compare. Returns the index where the new node
 * should be inserted to maintain descending (newest-first) order.
 */
function findDescendingInsertionIndex(parentId: string, value: number): number {
  const children = loroDoc.getChildren(parentId);
  for (let i = 0; i < children.length; i++) {
    const node = loroDoc.toNodexNode(children[i]);
    const existing = node?.name ? extractSortValue(node.name) : 0;
    if (value > existing) return i; // Insert before first smaller value
  }
  return children.length; // Append at end (smallest value)
}

/**
 * Find or create a child node under `parentId` with the given `name`.
 * Optionally applies a system tag. Inserts in descending sort order.
 */
function findOrCreateChild(
  parentId: string,
  name: string,
  systemTag?: string,
): string {
  const existing = findChildByName(parentId, name);
  if (existing) return existing;

  const sortValue = extractSortValue(name);
  const index = findDescendingInsertionIndex(parentId, sortValue);

  const id = loroDoc.createNode(undefined, parentId, index);
  loroDoc.setNodeData(id, 'name', name);
  if (systemTag) {
    loroDoc.addTag(id, systemTag);
  }
  return id;
}

// ============================================================
// Public API
// ============================================================

/**
 * Ensure a day node exists for the given date and return its ID.
 * Creates Year → Week → Day hierarchy under JOURNAL container as needed.
 * Nodes are sorted in descending order (newest first).
 */
export function ensureDateNode(date: Date): string {
  const journalId = CONTAINER_IDS.JOURNAL;

  // Year node
  const { year, week } = getISOWeekNumber(date);
  const yearName = formatYearName(year);
  const yearNodeId = findOrCreateChild(journalId, yearName, SYSTEM_TAGS.YEAR);

  // Week node
  const weekName = formatWeekName(week);
  const weekNodeId = findOrCreateChild(yearNodeId, weekName, SYSTEM_TAGS.WEEK);

  // Day node
  const dayName = formatDayName(date);
  const dayNodeId = findOrCreateChild(weekNodeId, dayName, SYSTEM_TAGS.DAY);

  loroDoc.commitDoc();
  return dayNodeId;
}

/**
 * Shortcut: ensure today's day node exists and return its ID.
 */
export function ensureTodayNode(): string {
  return ensureDateNode(new Date());
}

/**
 * Navigate to an adjacent day from a given day node.
 * Parses the current day node name → computes +offset day → ensureDateNode.
 * Returns null if the current node is not a valid day node.
 */
export function getAdjacentDayNodeId(currentDayNodeId: string, offset: number): string | null {
  const node = loroDoc.toNodexNode(currentDayNodeId);
  if (!node?.name) return null;

  // Need the year from the ancestor chain: day → week → year
  const weekId = loroDoc.getParentId(currentDayNodeId);
  if (!weekId) return null;
  const yearId = loroDoc.getParentId(weekId);
  if (!yearId) return null;
  const yearNode = loroDoc.toNodexNode(yearId);
  if (!yearNode?.name) return null;
  const year = parseYearNodeName(yearNode.name);
  if (year === null) return null;

  const currentDate = parseDayNodeName(node.name, year);
  if (!currentDate) return null;

  const targetDate = getAdjacentDay(currentDate, offset);
  return ensureDateNode(targetDate);
}

// ============================================================
// Query helpers
// ============================================================

/**
 * Check if a node is tagged with SYSTEM_TAGS.DAY.
 */
export function isDayNode(nodeId: string): boolean {
  const tags = loroDoc.getTags(nodeId);
  return tags.includes(SYSTEM_TAGS.DAY);
}

/**
 * Check if a node is tagged with SYSTEM_TAGS.WEEK.
 */
export function isWeekNode(nodeId: string): boolean {
  const tags = loroDoc.getTags(nodeId);
  return tags.includes(SYSTEM_TAGS.WEEK);
}

/**
 * Check if a node is tagged with SYSTEM_TAGS.YEAR.
 */
export function isYearNode(nodeId: string): boolean {
  const tags = loroDoc.getTags(nodeId);
  return tags.includes(SYSTEM_TAGS.YEAR);
}

/**
 * Check if a node is the JOURNAL container.
 */
export function isJournalNode(nodeId: string): boolean {
  return nodeId === CONTAINER_IDS.JOURNAL;
}

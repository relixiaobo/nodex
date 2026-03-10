/**
 * Tests for journal / date node management (src/lib/journal.ts).
 *
 * Uses LoroDoc for tree operations (similar to store-crud tests).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { seedTestDataSync } from '../../src/entrypoints/test/seed-data.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { TAG_COLOR_MAP, resolveTagColor } from '../../src/lib/tag-colors.js';
import { SYSTEM_NODE_IDS, FIELD_TYPES } from '../../src/types/index.js';
import { SYSTEM_TAGS } from '../../src/types/system-nodes.js';
import {
  ensureJournalTagDefs,
  ensureDateNode,
  ensureTodayNode,
  getAdjacentDayNodeId,
  getDayNoteCountsForMonth,
  isDayNode,
  isWeekNode,
  isYearNode,
  isJournalNode,
} from '../../src/lib/journal.js';
import {
  formatDayName,
  formatWeekName,
  formatYearName,
  getISOWeekNumber,
} from '../../src/lib/date-utils.js';

beforeEach(() => {
  seedTestDataSync();
});

describe('ensureDateNode', () => {
  it('creates year → week → day hierarchy under JOURNAL', () => {
    const date = new Date(2026, 1, 14); // Sat, Feb 14, 2026
    const dayId = ensureDateNode(date);

    // Day node exists and has correct name
    const dayNode = loroDoc.toNodexNode(dayId);
    expect(dayNode).not.toBeNull();
    expect(dayNode!.name).toBe('Sat, Feb 14');

    // Day has SYSTEM_TAGS.DAY
    expect(dayNode!.tags).toContain(SYSTEM_TAGS.DAY);

    // Week parent
    const weekId = loroDoc.getParentId(dayId);
    expect(weekId).not.toBeNull();
    const weekNode = loroDoc.toNodexNode(weekId!);
    expect(weekNode!.name).toBe('Week 07');
    expect(weekNode!.tags).toContain(SYSTEM_TAGS.WEEK);

    // Year parent
    const yearId = loroDoc.getParentId(weekId!);
    expect(yearId).not.toBeNull();
    const yearNode = loroDoc.toNodexNode(yearId!);
    expect(yearNode!.name).toBe('2026');
    expect(yearNode!.tags).toContain(SYSTEM_TAGS.YEAR);

    // Year is under JOURNAL
    const journalId = loroDoc.getParentId(yearId!);
    expect(journalId).toBe(SYSTEM_NODE_IDS.JOURNAL);

    // Journal tagDefs are materialized as normal tagDef nodes in Schema
    expect(loroDoc.toNodexNode(SYSTEM_TAGS.DAY)).toMatchObject({
      id: SYSTEM_TAGS.DAY,
      type: 'tagDef',
      name: 'day',
    });
    expect(loroDoc.getParentId(SYSTEM_TAGS.DAY)).toBe(SYSTEM_NODE_IDS.SCHEMA);
  });

  it('is idempotent — second call returns same ID', () => {
    const date = new Date(2026, 1, 14);
    const id1 = ensureDateNode(date);
    const id2 = ensureDateNode(date);
    expect(id1).toBe(id2);
  });

  it('applies #day template fields when creating a new day node', () => {
    ensureJournalTagDefs();

    const moodFieldId = 'attrDef_day_mood';
    loroDoc.createNode(moodFieldId, SYSTEM_TAGS.DAY);
    loroDoc.setNodeDataBatch(moodFieldId, {
      type: 'fieldDef',
      name: 'Mood',
      fieldType: FIELD_TYPES.PLAIN,
      cardinality: 'single',
      nullable: true,
    });
    loroDoc.commitDoc('system:test-seed-day-tagdef-field');

    // Use a date far from seed data's relative dates (seed creates -2/-5/-7/-10/-14 day offsets)
    // to ensure ensureDateNode creates a NEW day node (not returns an existing one).
    const dayId = ensureDateNode(new Date(2030, 6, 1));
    const dayChildren = loroDoc.getChildren(dayId);
    const fieldEntryId = dayChildren.find((id) => {
      const child = loroDoc.toNodexNode(id);
      return child?.type === 'fieldEntry' && child.fieldDefId === moodFieldId;
    });

    expect(fieldEntryId).toBeTruthy();
    expect(loroDoc.toNodexNode(fieldEntryId!)).toMatchObject({
      type: 'fieldEntry',
      fieldDefId: moodFieldId,
      templateId: moodFieldId,
    });
  });

  it('applies #day default content (shallow clone) when creating a new day node', () => {
    ensureJournalTagDefs();

    const templateNodeId = 'tpl_day_prompt';
    loroDoc.createNode(templateNodeId, SYSTEM_TAGS.DAY);
    loroDoc.setNodeDataBatch(templateNodeId, {
      name: 'Top 3 priorities',
      description: 'Daily template prompt',
    });
    loroDoc.createNode('tpl_day_prompt_child', templateNodeId);
    loroDoc.setNodeDataBatch('tpl_day_prompt_child', { name: 'Nested template item (not shallow-cloned)' });
    loroDoc.commitDoc('system:test-seed-day-default-content');

    const dayId = ensureDateNode(new Date(2030, 6, 2));
    const cloned = loroDoc.getChildren(dayId)
      .map((id) => loroDoc.toNodexNode(id))
      .find((n) => n?.templateId === templateNodeId);

    expect(cloned).toMatchObject({
      name: 'Top 3 priorities',
      description: 'Daily template prompt',
      templateId: templateNodeId,
    });
    expect(loroDoc.getChildren(cloned!.id)).toHaveLength(0);
  });

  it('creates separate day nodes for different dates', () => {
    const date1 = new Date(2026, 1, 14);
    const date2 = new Date(2026, 1, 15);
    const id1 = ensureDateNode(date1);
    const id2 = ensureDateNode(date2);
    expect(id1).not.toBe(id2);

    // Same week parent
    const weekId1 = loroDoc.getParentId(id1);
    const weekId2 = loroDoc.getParentId(id2);
    expect(weekId1).toBe(weekId2);
  });

  it('creates separate week nodes for dates in different weeks', () => {
    const date1 = new Date(2026, 1, 14); // Week 07
    const date2 = new Date(2026, 1, 23); // Week 09
    const id1 = ensureDateNode(date1);
    const id2 = ensureDateNode(date2);

    const weekId1 = loroDoc.getParentId(id1);
    const weekId2 = loroDoc.getParentId(id2);
    expect(weekId1).not.toBe(weekId2);

    // Same year parent
    const yearId1 = loroDoc.getParentId(weekId1!);
    const yearId2 = loroDoc.getParentId(weekId2!);
    expect(yearId1).toBe(yearId2);
  });

  it('handles cross-year dates (Dec 29 → next year Week 01)', () => {
    // 2025-12-29 is Monday → belongs to ISO Week 01 of 2026
    const date = new Date(2025, 11, 29);
    const dayId = ensureDateNode(date);

    const weekId = loroDoc.getParentId(dayId)!;
    const yearId = loroDoc.getParentId(weekId)!;
    const yearNode = loroDoc.toNodexNode(yearId);

    // ISO year is 2026, not 2025
    expect(yearNode!.name).toBe('2026');
    const weekNode = loroDoc.toNodexNode(weekId);
    expect(weekNode!.name).toBe('Week 01');
  });

  it('sorts year nodes in descending order', () => {
    ensureDateNode(new Date(2025, 5, 15)); // 2025
    ensureDateNode(new Date(2026, 1, 14)); // 2026
    ensureDateNode(new Date(2024, 0, 1));  // 2024

    const journalChildren = loroDoc.getChildren(SYSTEM_NODE_IDS.JOURNAL);
    // Filter out old seed data (journal_1) — look for year-named nodes
    const yearNames = journalChildren
      .map(id => loroDoc.toNodexNode(id)?.name)
      .filter(n => n && /^\d{4}$/.test(n));

    expect(yearNames[0]).toBe('2026');
    expect(yearNames[1]).toBe('2025');
    expect(yearNames[2]).toBe('2024');
  });

  it('sorts week nodes in descending order within a year', () => {
    ensureDateNode(new Date(2026, 0, 5));  // Week 02
    ensureDateNode(new Date(2026, 2, 15)); // Week 11
    ensureDateNode(new Date(2026, 1, 14)); // Week 07

    // Find 2026 year node
    const journalChildren = loroDoc.getChildren(SYSTEM_NODE_IDS.JOURNAL);
    const yearId = journalChildren.find(id => loroDoc.toNodexNode(id)?.name === '2026');
    expect(yearId).toBeTruthy();

    const weekNames = loroDoc.getChildren(yearId!)
      .map(id => loroDoc.toNodexNode(id)?.name)
      .filter((n): n is string => !!n);

    // Seed data may add extra weeks (today/yesterday). Verify descending order.
    const weekNums = weekNames.map(n => parseInt(n.replace('Week ', ''), 10));
    for (let i = 1; i < weekNums.length; i++) {
      expect(weekNums[i]).toBeLessThan(weekNums[i - 1]);
    }
    // Our three weeks must be present
    expect(weekNames).toContain('Week 11');
    expect(weekNames).toContain('Week 07');
    expect(weekNames).toContain('Week 02');
  });

  it('sorts day nodes in descending order within a week', () => {
    // Week 07 of 2026: Mon Feb 9 - Sun Feb 15
    ensureDateNode(new Date(2026, 1, 9));  // Mon
    ensureDateNode(new Date(2026, 1, 14)); // Sat
    ensureDateNode(new Date(2026, 1, 11)); // Wed

    // Find the week node
    const journalChildren = loroDoc.getChildren(SYSTEM_NODE_IDS.JOURNAL);
    const yearId = journalChildren.find(id => loroDoc.toNodexNode(id)?.name === '2026')!;
    const yearChildren = loroDoc.getChildren(yearId);
    const weekId = yearChildren.find(id => loroDoc.toNodexNode(id)?.name === 'Week 07')!;

    const dayNames = loroDoc.getChildren(weekId)
      .map(id => loroDoc.toNodexNode(id)?.name)
      .filter((n): n is string => !!n);

    // Seed data may add extra days (e.g. today-7). Verify descending order.
    const dayNums = dayNames.map(n => {
      const m = n.match(/(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    });
    for (let i = 1; i < dayNums.length; i++) {
      expect(dayNums[i]).toBeLessThan(dayNums[i - 1]);
    }
    // Our three days must be present
    expect(dayNames).toContain('Sat, Feb 14');
    expect(dayNames).toContain('Wed, Feb 11');
    expect(dayNames).toContain('Mon, Feb 9');
  });
});

describe('ensureJournalTagDefs', () => {
  it('creates fixed-ID day/week/year tagDefs under Schema', () => {
    ensureJournalTagDefs();

    expect(loroDoc.toNodexNode(SYSTEM_TAGS.DAY)).toMatchObject({
      type: 'tagDef',
      name: 'day',
      color: 'gray',
      locked: true,
    });
    expect(loroDoc.toNodexNode(SYSTEM_TAGS.WEEK)).toMatchObject({
      type: 'tagDef',
      name: 'week',
      color: 'gray',
      locked: true,
    });
    expect(loroDoc.toNodexNode(SYSTEM_TAGS.YEAR)).toMatchObject({
      type: 'tagDef',
      name: 'year',
      color: 'gray',
      locked: true,
    });

    expect(loroDoc.getParentId(SYSTEM_TAGS.DAY)).toBe(SYSTEM_NODE_IDS.SCHEMA);
    expect(loroDoc.getParentId(SYSTEM_TAGS.WEEK)).toBe(SYSTEM_NODE_IDS.SCHEMA);
    expect(loroDoc.getParentId(SYSTEM_TAGS.YEAR)).toBe(SYSTEM_NODE_IDS.SCHEMA);

    expect(resolveTagColor(SYSTEM_TAGS.DAY)).toEqual(TAG_COLOR_MAP.gray);
    expect(resolveTagColor(SYSTEM_TAGS.WEEK)).toEqual(TAG_COLOR_MAP.gray);
    expect(resolveTagColor(SYSTEM_TAGS.YEAR)).toEqual(TAG_COLOR_MAP.gray);
  });

  it('is idempotent when called multiple times', () => {
    ensureJournalTagDefs();
    ensureJournalTagDefs();

    const schemaChildren = loroDoc.getChildren(SYSTEM_NODE_IDS.SCHEMA);
    expect(schemaChildren.filter((id) => id === SYSTEM_TAGS.DAY)).toHaveLength(1);
    expect(schemaChildren.filter((id) => id === SYSTEM_TAGS.WEEK)).toHaveLength(1);
    expect(schemaChildren.filter((id) => id === SYSTEM_TAGS.YEAR)).toHaveLength(1);
  });

  it('backfills defaults without overwriting user custom settings', () => {
    ensureJournalTagDefs();
    loroDoc.setNodeDataBatch(SYSTEM_TAGS.WEEK, {
      color: 'violet',
    });
    loroDoc.setNodeDataBatch(SYSTEM_TAGS.YEAR, {
      color: '',
    });
    loroDoc.commitDoc('user:test-customize-journal-tagdefs');

    ensureJournalTagDefs();

    expect(loroDoc.toNodexNode(SYSTEM_TAGS.WEEK)).toMatchObject({
      color: 'violet',
    });
    expect(loroDoc.toNodexNode(SYSTEM_TAGS.YEAR)).toMatchObject({
      color: 'gray',
    });
  });
});

describe('ensureTodayNode', () => {
  it('creates a day node for today', () => {
    const dayId = ensureTodayNode();
    const node = loroDoc.toNodexNode(dayId);
    expect(node).not.toBeNull();

    const today = new Date();
    expect(node!.name).toBe(formatDayName(today));
  });
});

describe('getAdjacentDayNodeId', () => {
  it('returns next day node ID', () => {
    const date = new Date(2026, 1, 14);
    const dayId = ensureDateNode(date);
    const nextId = getAdjacentDayNodeId(dayId, 1);

    expect(nextId).not.toBeNull();
    const nextNode = loroDoc.toNodexNode(nextId!);
    expect(nextNode!.name).toBe('Sun, Feb 15');
  });

  it('returns previous day node ID', () => {
    const date = new Date(2026, 1, 14);
    const dayId = ensureDateNode(date);
    const prevId = getAdjacentDayNodeId(dayId, -1);

    expect(prevId).not.toBeNull();
    const prevNode = loroDoc.toNodexNode(prevId!);
    expect(prevNode!.name).toBe('Fri, Feb 13');
  });

  it('handles month boundary', () => {
    const date = new Date(2026, 1, 1); // Feb 1
    const dayId = ensureDateNode(date);
    const prevId = getAdjacentDayNodeId(dayId, -1);

    expect(prevId).not.toBeNull();
    const prevNode = loroDoc.toNodexNode(prevId!);
    expect(prevNode!.name).toBe('Sat, Jan 31');
  });

  it('returns null for non-day node', () => {
    const result = getAdjacentDayNodeId(SYSTEM_NODE_IDS.LIBRARY, 1);
    expect(result).toBeNull();
  });
});

describe('isDayNode', () => {
  it('returns true for a day node', () => {
    const dayId = ensureDateNode(new Date(2026, 1, 14));
    expect(isDayNode(dayId)).toBe(true);
  });

  it('returns false for a non-day node', () => {
    expect(isDayNode(SYSTEM_NODE_IDS.LIBRARY)).toBe(false);
  });

  it('returns false for a week node', () => {
    const dayId = ensureDateNode(new Date(2026, 1, 14));
    const weekId = loroDoc.getParentId(dayId)!;
    expect(isDayNode(weekId)).toBe(false);
  });
});

describe('isWeekNode', () => {
  it('returns true for a week node', () => {
    const dayId = ensureDateNode(new Date(2026, 1, 14));
    const weekId = loroDoc.getParentId(dayId)!;
    expect(isWeekNode(weekId)).toBe(true);
  });

  it('returns false for a day node', () => {
    const dayId = ensureDateNode(new Date(2026, 1, 14));
    expect(isWeekNode(dayId)).toBe(false);
  });
});

describe('isYearNode', () => {
  it('returns true for a year node', () => {
    const dayId = ensureDateNode(new Date(2026, 1, 14));
    const weekId = loroDoc.getParentId(dayId)!;
    const yearId = loroDoc.getParentId(weekId)!;
    expect(isYearNode(yearId)).toBe(true);
  });
});

describe('isJournalNode', () => {
  it('returns true for JOURNAL container', () => {
    expect(isJournalNode(SYSTEM_NODE_IDS.JOURNAL)).toBe(true);
  });

  it('returns false for other containers', () => {
    expect(isJournalNode(SYSTEM_NODE_IDS.LIBRARY)).toBe(false);
  });
});

describe('getDayNoteCountsForMonth', () => {
  it('returns empty map for a month with no day nodes', () => {
    // 2020-06 — no day nodes created
    const counts = getDayNoteCountsForMonth(2020, 5); // month is 0-based
    expect(counts.size).toBe(0);
  });

  it('returns correct note counts for days with content', () => {
    // Seed data creates today + yesterday with notes.
    // today: 4 notes (j_pg, j_deep, j_leaders, j_range)
    // yesterday: 2 notes (j_yest_1, j_yest_2)
    const today = new Date();
    const counts = getDayNoteCountsForMonth(today.getFullYear(), today.getMonth());

    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(counts.get(todayStr)).toBe(4);

    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    // Yesterday might be in a different month — only check if same month
    if (yesterday.getMonth() === today.getMonth()) {
      const yestStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
      expect(counts.get(yestStr)).toBe(2);
    }
  });

  it('does not count fieldEntry children', () => {
    // Create a day node and add both a content child and a fieldEntry child
    const date = new Date(2026, 3, 15); // April 15, 2026
    const dayId = ensureDateNode(date);

    // Add a regular content child
    loroDoc.createNode('test_content_child', dayId);
    loroDoc.setNodeData('test_content_child', 'name', 'A note');

    // Add a fieldEntry child (should be excluded from count)
    loroDoc.createNode('test_field_entry', dayId);
    loroDoc.setNodeData('test_field_entry', 'type', 'fieldEntry');
    loroDoc.setNodeData('test_field_entry', 'name', 'field');

    loroDoc.commitDoc();

    const counts = getDayNoteCountsForMonth(2026, 3); // April (0-based)
    expect(counts.get('2026-04-15')).toBe(1); // Only the content child
  });

  it('returns empty map for month with day nodes but no content children', () => {
    // Create a day node with no children
    const date = new Date(2026, 6, 10); // July 10, 2026
    ensureDateNode(date);

    const counts = getDayNoteCountsForMonth(2026, 6); // July (0-based)
    expect(counts.has('2026-07-10')).toBe(false); // No entries for 0-count days
  });
});

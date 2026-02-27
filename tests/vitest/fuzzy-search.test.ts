/**
 * Tests for fuzzy search (src/lib/fuzzy-search.ts).
 * Powered by uFuzzy with CJK + Latin + typo tolerance support.
 */
import { describe, it, expect } from 'vitest';
import { fuzzyMatch, fuzzySort } from '../../src/lib/fuzzy-search';

describe('fuzzyMatch', () => {
  it('returns a result for an empty query', () => {
    const result = fuzzyMatch('', 'anything');
    expect(result).not.toBeNull();
    expect(result!.score).toBe(0);
    expect(result!.ranges).toEqual([]);
  });

  it('returns null when query does not match target', () => {
    expect(fuzzyMatch('xyz', 'hello')).toBeNull();
  });

  it('matches substring in target', () => {
    const result = fuzzyMatch('meet', 'Meeting notes');
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThan(0);
  });

  it('matches prefix', () => {
    const result = fuzzyMatch('hel', 'hello world');
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThan(0);
  });

  it('is case-insensitive', () => {
    const result = fuzzyMatch('HEL', 'hello');
    expect(result).not.toBeNull();
  });

  // Core fix: no scattered subsequence matching
  it('does NOT match scattered subsequences', () => {
    // "today" should NOT match "Next meeting on Friday" (t-o-d-a-y scattered)
    expect(fuzzyMatch('today', 'Next meeting on Friday')).toBeNull();
  });

  it('does NOT match letters scattered with spaces', () => {
    expect(fuzzyMatch('today', 'A sentence with t o d a y scattered')).toBeNull();
  });

  // Typo tolerance
  it('matches with a single typo (substitution)', () => {
    const result = fuzzyMatch('tody', "Today's meeting");
    expect(result).not.toBeNull();
  });

  // CJK support
  it('matches Chinese characters', () => {
    const result = fuzzyMatch('会议', '今天的会议记录');
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThan(0);
  });

  it('matches single Chinese character', () => {
    expect(fuzzyMatch('会', '会议')).not.toBeNull();
    expect(fuzzyMatch('会', '开会')).not.toBeNull();
  });

  it('matches mixed CJK + Latin query', () => {
    const result = fuzzyMatch('today 会议', 'Today 会议讨论');
    expect(result).not.toBeNull();
  });

  // Multi-token queries
  it('matches multi-token queries', () => {
    const result = fuzzyMatch('meet fri', 'Next meeting on Friday');
    expect(result).not.toBeNull();
  });

  it('returns highlight ranges', () => {
    const result = fuzzyMatch('today', "Today's meeting notes");
    expect(result).not.toBeNull();
    expect(result!.ranges.length).toBeGreaterThan(0);
    // ranges are [start, end] pairs → "Today" = [0, 5]
    expect(result!.ranges[0]).toBe(0);
    expect(result!.ranges[1]).toBe(5);
  });

  // Scoring: shorter/more precise matches rank higher
  it('scores exact match higher than substring match', () => {
    const exact = fuzzyMatch('today', 'Today');
    const partial = fuzzyMatch('today', 'Go to today and back');
    expect(exact).not.toBeNull();
    expect(partial).not.toBeNull();
    expect(exact!.score).toBeGreaterThan(partial!.score);
  });
});

describe('fuzzySort', () => {
  const items = [
    { id: '1', name: 'Meeting notes' },
    { id: '2', name: 'Weekly review' },
    { id: '3', name: 'Project roadmap' },
    { id: '4', name: 'My meetings list' },
  ];

  it('returns empty for empty query', () => {
    expect(fuzzySort(items, '', (i) => i.name)).toEqual([]);
    expect(fuzzySort(items, '   ', (i) => i.name)).toEqual([]);
  });

  it('filters and sorts by score', () => {
    const results = fuzzySort(items, 'meet', (i) => i.name);
    expect(results.length).toBeGreaterThanOrEqual(1);
    // "Meeting notes" should rank higher than "My meetings list" (prefix match)
    expect(results[0].id).toBe('1');
  });

  it('respects limit parameter', () => {
    const results = fuzzySort(items, 'e', (i) => i.name, 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('attaches _fuzzyScore and _fuzzyRanges', () => {
    const results = fuzzySort(items, 'meet', (i) => i.name);
    expect(results.length).toBeGreaterThan(0);
    expect(typeof results[0]._fuzzyScore).toBe('number');
    expect(Array.isArray(results[0]._fuzzyRanges)).toBe(true);
  });

  it('excludes non-matching items', () => {
    const results = fuzzySort(items, 'xyz', (i) => i.name);
    expect(results.length).toBe(0);
  });

  // CJK batch search
  it('handles CJK items in batch search', () => {
    const cjkItems = [
      { id: 'a', name: '今天的会议记录' },
      { id: 'b', name: '设计评审文档' },
      { id: 'c', name: '会议纪要' },
    ];
    const results = fuzzySort(cjkItems, '会议', (i) => i.name);
    expect(results.length).toBe(2); // 会议记录 + 会议纪要
    // "会议纪要" (shorter, prefix) should rank higher
    expect(results[0].id).toBe('c');
  });

  it('does not return scattered subsequence matches in batch', () => {
    const testItems = [
      { id: '1', name: "Today's plan" },
      { id: '2', name: 'Next meeting on Friday' },
    ];
    const results = fuzzySort(testItems, 'today', (i) => i.name);
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('1');
  });
});

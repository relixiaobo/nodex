/**
 * Tests for date utility functions (src/lib/date-utils.ts).
 *
 * Pure functions — no LoroDoc/store dependencies.
 */
import { describe, it, expect } from 'vitest';
import {
  getISOWeekNumber,
  formatDayName,
  formatWeekName,
  formatYearName,
  parseDayNodeName,
  parseWeekNodeName,
  parseYearNodeName,
  getAdjacentDay,
  isToday,
  extractSortValue,
} from '../../src/lib/date-utils.js';

describe('getISOWeekNumber', () => {
  it('returns correct week for a mid-year date', () => {
    // 2026-02-14 is a Saturday
    const result = getISOWeekNumber(new Date(2026, 1, 14));
    expect(result).toEqual({ year: 2026, week: 7 });
  });

  it('handles Jan 1 that belongs to previous year week', () => {
    // 2027-01-01 is a Friday — belongs to Week 53 of 2026
    const result = getISOWeekNumber(new Date(2027, 0, 1));
    expect(result).toEqual({ year: 2026, week: 53 });
  });

  it('handles Dec 31 that belongs to next year Week 01', () => {
    // 2025-12-29 is a Monday — belongs to Week 01 of 2026
    const result = getISOWeekNumber(new Date(2025, 11, 29));
    expect(result).toEqual({ year: 2026, week: 1 });
  });

  it('returns week 1 for first Thursday of year', () => {
    // 2026-01-01 is Thursday → Week 01
    const result = getISOWeekNumber(new Date(2026, 0, 1));
    expect(result).toEqual({ year: 2026, week: 1 });
  });

  it('handles Week 52/53 boundary', () => {
    // 2026-12-28 is a Monday → should be week 53
    const result = getISOWeekNumber(new Date(2026, 11, 28));
    expect(result).toEqual({ year: 2026, week: 53 });
  });
});

describe('formatDayName', () => {
  it('formats a Saturday in February', () => {
    expect(formatDayName(new Date(2026, 1, 14))).toBe('Sat, Feb 14');
  });

  it('formats a Monday in January', () => {
    expect(formatDayName(new Date(2026, 0, 5))).toBe('Mon, Jan 5');
  });

  it('formats December 25', () => {
    expect(formatDayName(new Date(2026, 11, 25))).toBe('Fri, Dec 25');
  });
});

describe('formatWeekName', () => {
  it('pads single-digit weeks', () => {
    expect(formatWeekName(7)).toBe('Week 07');
  });

  it('does not pad double-digit weeks', () => {
    expect(formatWeekName(42)).toBe('Week 42');
  });

  it('handles week 1', () => {
    expect(formatWeekName(1)).toBe('Week 01');
  });
});

describe('formatYearName', () => {
  it('formats year as string', () => {
    expect(formatYearName(2026)).toBe('2026');
  });
});

describe('parseDayNodeName', () => {
  it('parses a valid day node name', () => {
    const result = parseDayNodeName('Sat, Feb 14', 2026);
    expect(result).toEqual(new Date(2026, 1, 14));
  });

  it('parses single-digit day', () => {
    const result = parseDayNodeName('Mon, Jan 5', 2026);
    expect(result).toEqual(new Date(2026, 0, 5));
  });

  it('returns null for invalid format', () => {
    expect(parseDayNodeName('February 14', 2026)).toBeNull();
    expect(parseDayNodeName('', 2026)).toBeNull();
    expect(parseDayNodeName('Week 07', 2026)).toBeNull();
  });

  it('returns null for invalid date (Feb 31)', () => {
    expect(parseDayNodeName('Sat, Feb 31', 2026)).toBeNull();
  });

  it('returns null for unknown month', () => {
    expect(parseDayNodeName('Mon, Xyz 14', 2026)).toBeNull();
  });
});

describe('parseWeekNodeName', () => {
  it('parses valid week name', () => {
    expect(parseWeekNodeName('Week 07')).toBe(7);
  });

  it('parses double-digit week', () => {
    expect(parseWeekNodeName('Week 42')).toBe(42);
  });

  it('returns null for invalid format', () => {
    expect(parseWeekNodeName('Sat, Feb 14')).toBeNull();
    expect(parseWeekNodeName('Week 0')).toBeNull();
    expect(parseWeekNodeName('Week 54')).toBeNull();
  });
});

describe('parseYearNodeName', () => {
  it('parses valid year', () => {
    expect(parseYearNodeName('2026')).toBe(2026);
  });

  it('returns null for non-year strings', () => {
    expect(parseYearNodeName('Week 07')).toBeNull();
    expect(parseYearNodeName('abc')).toBeNull();
    expect(parseYearNodeName('20260')).toBeNull();
  });
});

describe('getAdjacentDay', () => {
  it('moves forward one day', () => {
    const date = new Date(2026, 1, 14);
    const result = getAdjacentDay(date, 1);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(15);
  });

  it('moves backward one day', () => {
    const date = new Date(2026, 1, 14);
    const result = getAdjacentDay(date, -1);
    expect(result.getDate()).toBe(13);
  });

  it('crosses month boundary forward', () => {
    const date = new Date(2026, 0, 31);
    const result = getAdjacentDay(date, 1);
    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(1);
  });

  it('crosses month boundary backward', () => {
    const date = new Date(2026, 1, 1);
    const result = getAdjacentDay(date, -1);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(31);
  });

  it('crosses year boundary', () => {
    const date = new Date(2025, 11, 31);
    const result = getAdjacentDay(date, 1);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(1);
  });
});

describe('isToday', () => {
  it('returns true for today', () => {
    expect(isToday(new Date())).toBe(true);
  });

  it('returns false for yesterday', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isToday(yesterday)).toBe(false);
  });

  it('returns false for tomorrow', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(isToday(tomorrow)).toBe(false);
  });
});

describe('extractSortValue', () => {
  it('extracts year value', () => {
    expect(extractSortValue('2026')).toBe(2026);
  });

  it('extracts week value', () => {
    expect(extractSortValue('Week 07')).toBe(7);
  });

  it('extracts day sort value (month*100 + day)', () => {
    // Feb 14 → 2*100 + 14 = 214
    expect(extractSortValue('Sat, Feb 14')).toBe(214);
  });

  it('returns 0 for unrecognized format', () => {
    expect(extractSortValue('Random text')).toBe(0);
  });

  it('sorts days correctly within a year', () => {
    const jan1 = extractSortValue('Thu, Jan 1');
    const feb14 = extractSortValue('Sat, Feb 14');
    const dec25 = extractSortValue('Fri, Dec 25');
    expect(jan1).toBeLessThan(feb14);
    expect(feb14).toBeLessThan(dec25);
  });
});

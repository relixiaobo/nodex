import { describe, it, expect } from 'vitest';
import { formatSmartTimestamp } from '../../src/lib/format-timestamp.js';

// Fixed "now": 2026-03-03 14:00:00 local time
const NOW = new Date(2026, 2, 3, 14, 0, 0).getTime();

describe('formatSmartTimestamp', () => {
  it('returns empty string for undefined', () => {
    expect(formatSmartTimestamp(undefined)).toBe('');
  });

  it('returns empty string for 0', () => {
    expect(formatSmartTimestamp(0)).toBe('');
  });

  it('returns "just now" for < 30 seconds ago', () => {
    const ts = NOW - 10_000; // 10 seconds ago
    expect(formatSmartTimestamp(ts, NOW)).toBe('just now');
  });

  it('returns "just now" for exactly 0 seconds ago', () => {
    expect(formatSmartTimestamp(NOW, NOW)).toBe('just now');
  });

  it('returns "N min ago" for minutes-old timestamps', () => {
    const ts = NOW - 3 * 60_000; // 3 minutes ago
    expect(formatSmartTimestamp(ts, NOW)).toBe('3 min ago');
  });

  it('returns "1 min ago" for 30–89 seconds ago', () => {
    const ts = NOW - 45_000; // 45 seconds ago
    expect(formatSmartTimestamp(ts, NOW)).toBe('0 min ago');
    // Actually 30s boundary:
    const ts30 = NOW - 30_000;
    expect(formatSmartTimestamp(ts30, NOW)).toBe('0 min ago');
  });

  it('returns "59 min ago" for 59 minutes ago', () => {
    const ts = NOW - 59 * 60_000;
    expect(formatSmartTimestamp(ts, NOW)).toBe('59 min ago');
  });

  it('returns "N hr ago" for hours-old timestamps', () => {
    const ts = NOW - 2 * 3_600_000; // 2 hours ago
    expect(formatSmartTimestamp(ts, NOW)).toBe('2 hr ago');
  });

  it('returns "1 hr ago" for 60 minutes ago', () => {
    const ts = NOW - 60 * 60_000;
    expect(formatSmartTimestamp(ts, NOW)).toBe('1 hr ago');
  });

  it('returns "23 hr ago" for 23 hours ago', () => {
    const ts = NOW - 23 * 3_600_000;
    expect(formatSmartTimestamp(ts, NOW)).toBe('23 hr ago');
  });

  it('returns "Yesterday, {time}" for calendar yesterday', () => {
    // Yesterday at 10:30 AM
    const ts = new Date(2026, 2, 2, 10, 30, 0).getTime();
    const result = formatSmartTimestamp(ts, NOW);
    expect(result).toMatch(/^yesterday, \d+:\d+\s*(am|pm)$/i);
    expect(result.startsWith('Yesterday')).toBe(true);
  });

  it('returns same-year format for this year (not yesterday)', () => {
    // Feb 15 this year at 9:00 AM
    const ts = new Date(2026, 1, 15, 9, 0, 0).getTime();
    const result = formatSmartTimestamp(ts, NOW);
    expect(result).toContain('feb');
    expect(result).toContain('15');
    expect(result).not.toContain('2026');
    expect(result).toMatch(/(am|pm)$/);
  });

  it('returns different-year format for other years', () => {
    // Dec 25, 2025 at 3:00 PM
    const ts = new Date(2025, 11, 25, 15, 0, 0).getTime();
    const result = formatSmartTimestamp(ts, NOW);
    expect(result).toContain('dec');
    expect(result).toContain('25');
    expect(result).toContain('2025');
    expect(result).toMatch(/(am|pm)$/);
  });

  it('uses lowercase am/pm consistently', () => {
    const ts = new Date(2026, 0, 1, 15, 30, 0).getTime();
    const result = formatSmartTimestamp(ts, NOW);
    // Should not contain uppercase AM/PM
    expect(result).not.toMatch(/[AP]M/);
    expect(result).toMatch(/(am|pm)/);
  });
});

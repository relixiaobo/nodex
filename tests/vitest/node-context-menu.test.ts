import { describe, it, expect } from 'vitest';
import { formatContextMenuTimestamp } from '../../src/components/outliner/NodeContextMenu.js';

describe('formatContextMenuTimestamp', () => {
  it('returns null for undefined', () => {
    expect(formatContextMenuTimestamp(undefined)).toBeNull();
  });

  it('returns null for 0', () => {
    expect(formatContextMenuTimestamp(0)).toBeNull();
  });

  it('formats a known timestamp correctly', () => {
    // 2026-03-03 10:30:00 UTC
    const ts = new Date(2026, 2, 3, 10, 30, 0).getTime();
    const result = formatContextMenuTimestamp(ts);
    expect(result).not.toBeNull();
    expect(result!.date).toContain('Mar');
    expect(result!.date).toContain('2026');
    expect(result!.time).toMatch(/\d+:\d+\s*(am|pm)/);
  });

  it('returns lowercase am/pm in time', () => {
    const ts = new Date(2026, 0, 15, 14, 0, 0).getTime();
    const result = formatContextMenuTimestamp(ts);
    expect(result).not.toBeNull();
    // Time should contain lowercase am or pm
    expect(result!.time).toMatch(/(am|pm)$/);
  });
});

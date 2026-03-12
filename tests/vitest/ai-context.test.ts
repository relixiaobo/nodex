import { describe, expect, it } from 'vitest';
import { formatLocalTimestamp } from '../../src/lib/ai-context.js';

describe('ai context', () => {
  it('formats time context timestamps with a local offset instead of UTC Zulu time', () => {
    const timestamp = formatLocalTimestamp(new Date(2026, 2, 12, 15, 4, 5));

    expect(timestamp).toMatch(/^2026-03-12T15:04:05[+-]\d{2}:\d{2}$/);
    expect(timestamp.endsWith('Z')).toBe(false);
  });
});

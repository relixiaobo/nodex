import { describe, it, expect } from 'vitest';
import { formatSmartTimestamp } from '../../src/lib/format-timestamp.js';
import { writeNodeLinkToClipboard, parseNodeLinkFromHtml, NODE_LINK_ATTR } from '../../src/lib/node-clipboard.js';

/**
 * NodeContextMenu tests.
 *
 * Timestamp formatting logic is tested in format-timestamp.test.ts.
 * These tests verify the integration contract used by the context menu.
 */
describe('NodeContextMenu timestamp formatting', () => {
  it('returns empty string for undefined (no crash in menu)', () => {
    expect(formatSmartTimestamp(undefined)).toBe('');
  });

  it('returns empty string for 0', () => {
    expect(formatSmartTimestamp(0)).toBe('');
  });

  it('returns a non-empty string for a valid timestamp', () => {
    const ts = new Date(2026, 2, 3, 10, 30, 0).getTime();
    const result = formatSmartTimestamp(ts);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });
});

describe('Node link clipboard utilities', () => {
  it('writeNodeLinkToClipboard is exported', () => {
    expect(typeof writeNodeLinkToClipboard).toBe('function');
  });

  it('parseNodeLinkFromHtml extracts node ID from soma node link html', () => {
    const html = `<span ${NODE_LINK_ATTR}="abc123">abc123</span>`;
    expect(parseNodeLinkFromHtml(html)).toBe('abc123');
  });

  it('parseNodeLinkFromHtml returns null for plain html', () => {
    expect(parseNodeLinkFromHtml('<p>hello</p>')).toBeNull();
  });

  it('parseNodeLinkFromHtml returns null for empty string', () => {
    expect(parseNodeLinkFromHtml('')).toBeNull();
  });
});

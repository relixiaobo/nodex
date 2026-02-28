/**
 * highlight-messaging — tests for message type constants,
 * payload serialization, and HighlightAnchor serialization/deserialization.
 */
import { describe, it, expect } from 'vitest';
import {
  HIGHLIGHT_CREATE,
  HIGHLIGHT_RESTORE,
  HIGHLIGHT_REMOVE,
  HIGHLIGHT_SCROLL_TO,
  HIGHLIGHT_CLICK,
  HIGHLIGHT_CHECK_URL,
  HIGHLIGHT_UNRESOLVABLE,
} from '../../src/lib/highlight-messaging.js';
import type {
  HighlightCreatePayload,
  HighlightRestorePayload,
  HighlightRemovePayload,
  HighlightScrollToPayload,
  HighlightClickPayload,
  HighlightCheckUrlPayload,
  HighlightUnresolvablePayload,
  HighlightMessage,
} from '../../src/lib/highlight-messaging.js';
import {
  serializeAnchor,
  deserializeAnchor,
  type HighlightAnchor,
} from '../../src/lib/highlight-anchor.js';

// ── Message Type Constants ──

describe('message type constants', () => {
  it('HIGHLIGHT_CREATE is "highlight:create"', () => {
    expect(HIGHLIGHT_CREATE).toBe('highlight:create');
  });

  it('HIGHLIGHT_RESTORE is "highlight:restore"', () => {
    expect(HIGHLIGHT_RESTORE).toBe('highlight:restore');
  });

  it('HIGHLIGHT_REMOVE is "highlight:remove"', () => {
    expect(HIGHLIGHT_REMOVE).toBe('highlight:remove');
  });

  it('HIGHLIGHT_SCROLL_TO is "highlight:scroll-to"', () => {
    expect(HIGHLIGHT_SCROLL_TO).toBe('highlight:scroll-to');
  });

  it('HIGHLIGHT_CLICK is "highlight:click"', () => {
    expect(HIGHLIGHT_CLICK).toBe('highlight:click');
  });

  it('HIGHLIGHT_CHECK_URL is "highlight:check-url"', () => {
    expect(HIGHLIGHT_CHECK_URL).toBe('highlight:check-url');
  });

  it('HIGHLIGHT_UNRESOLVABLE is "highlight:unresolvable"', () => {
    expect(HIGHLIGHT_UNRESOLVABLE).toBe('highlight:unresolvable');
  });

  it('all message types have the "highlight:" prefix', () => {
    const types = [
      HIGHLIGHT_CREATE,
      HIGHLIGHT_RESTORE,
      HIGHLIGHT_REMOVE,
      HIGHLIGHT_SCROLL_TO,
      HIGHLIGHT_CLICK,
      HIGHLIGHT_CHECK_URL,
      HIGHLIGHT_UNRESOLVABLE,
    ];
    for (const t of types) {
      expect(t).toMatch(/^highlight:/);
    }
  });

  it('all message types are unique', () => {
    const types = [
      HIGHLIGHT_CREATE,
      HIGHLIGHT_RESTORE,
      HIGHLIGHT_REMOVE,
      HIGHLIGHT_SCROLL_TO,
      HIGHLIGHT_CLICK,
      HIGHLIGHT_CHECK_URL,
      HIGHLIGHT_UNRESOLVABLE,
    ];
    const uniqueSet = new Set(types);
    expect(uniqueSet.size).toBe(types.length);
  });
});

// ── Payload Type Validation (structural tests) ──

describe('payload types', () => {
  it('HighlightCreatePayload has required fields', () => {
    const anchor: HighlightAnchor = {
      version: 1,
      exact: 'test text',
      prefix: 'before ',
      suffix: ' after',
    };

    const payload: HighlightCreatePayload = {
      anchor,
      selectedText: 'test text',
      pageUrl: 'https://example.com',
      pageTitle: 'Example Page',
    };

    expect(payload.anchor.exact).toBe('test text');
    expect(payload.selectedText).toBe('test text');
    expect(payload.pageUrl).toBe('https://example.com');
    expect(payload.pageTitle).toBe('Example Page');
    expect(payload.color).toBeUndefined();
    expect(payload.withNote).toBeUndefined();
  });

  it('HighlightCreatePayload supports optional fields', () => {
    const anchor: HighlightAnchor = {
      version: 1,
      exact: 'text',
      prefix: '',
      suffix: '',
    };

    const payload: HighlightCreatePayload = {
      anchor,
      selectedText: 'text',
      pageUrl: 'https://example.com',
      pageTitle: 'Page',
      color: 'green',
      withNote: true,
    };

    expect(payload.color).toBe('green');
    expect(payload.withNote).toBe(true);
  });

  it('HighlightRestorePayload holds array of highlights', () => {
    const payload: HighlightRestorePayload = {
      highlights: [
        {
          id: 'node-1',
          anchor: { version: 1, exact: 'first', prefix: '', suffix: '' },
          color: 'yellow',
        },
        {
          id: 'node-2',
          anchor: { version: 1, exact: 'second', prefix: '', suffix: '' },
          color: 'blue',
        },
      ],
    };

    expect(payload.highlights).toHaveLength(2);
    expect(payload.highlights[0].id).toBe('node-1');
    expect(payload.highlights[1].color).toBe('blue');
  });

  it('HighlightRemovePayload has id', () => {
    const payload: HighlightRemovePayload = { id: 'node-123' };
    expect(payload.id).toBe('node-123');
  });

  it('HighlightScrollToPayload has id', () => {
    const payload: HighlightScrollToPayload = { id: 'node-456' };
    expect(payload.id).toBe('node-456');
  });

  it('HighlightClickPayload has id', () => {
    const payload: HighlightClickPayload = { id: 'node-789' };
    expect(payload.id).toBe('node-789');
  });

  it('HighlightCheckUrlPayload has url and tabId', () => {
    const payload: HighlightCheckUrlPayload = {
      url: 'https://example.com/page',
      tabId: 42,
    };
    expect(payload.url).toBe('https://example.com/page');
    expect(payload.tabId).toBe(42);
  });

  it('HighlightUnresolvablePayload has ids array', () => {
    const payload: HighlightUnresolvablePayload = {
      ids: ['node-1', 'node-2', 'node-3'],
    };
    expect(payload.ids).toHaveLength(3);
  });
});

// ── Anchor Serialization ──

describe('serializeAnchor / deserializeAnchor', () => {
  const makeAnchor = (overrides?: Partial<HighlightAnchor>): HighlightAnchor => ({
    version: 1,
    exact: 'highlighted text',
    prefix: 'some prefix context',
    suffix: 'some suffix context',
    ...overrides,
  });

  it('round-trips a minimal anchor', () => {
    const anchor = makeAnchor();
    const json = serializeAnchor(anchor);
    const restored = deserializeAnchor(json);

    expect(restored).toEqual(anchor);
  });

  it('round-trips an anchor with all fields', () => {
    const anchor = makeAnchor({
      cssSelector: '#content > p:nth-child(3)',
      range: {
        startXPath: '//*[@id="content"]/p[3]/text()[1]',
        startOffset: 10,
        endXPath: '//*[@id="content"]/p[3]/text()[1]',
        endOffset: 26,
      },
      textPosition: {
        start: 150,
        end: 166,
      },
    });

    const json = serializeAnchor(anchor);
    const restored = deserializeAnchor(json);

    expect(restored).toEqual(anchor);
    expect(restored!.range!.startXPath).toBe('//*[@id="content"]/p[3]/text()[1]');
    expect(restored!.textPosition!.start).toBe(150);
  });

  it('returns null for invalid JSON', () => {
    expect(deserializeAnchor('not json')).toBeNull();
    expect(deserializeAnchor('')).toBeNull();
    expect(deserializeAnchor('{}')).toBeNull();
  });

  it('returns null for missing version', () => {
    const json = JSON.stringify({ exact: 'text', prefix: '', suffix: '' });
    expect(deserializeAnchor(json)).toBeNull();
  });

  it('returns null for wrong version', () => {
    const json = JSON.stringify({ version: 2, exact: 'text', prefix: '', suffix: '' });
    expect(deserializeAnchor(json)).toBeNull();
  });

  it('returns null for empty exact text', () => {
    const json = JSON.stringify({ version: 1, exact: '', prefix: '', suffix: '' });
    expect(deserializeAnchor(json)).toBeNull();
  });

  it('returns null for invalid range shape', () => {
    const json = JSON.stringify({
      version: 1,
      exact: 'text',
      prefix: '',
      suffix: '',
      range: { startXPath: 123 }, // wrong type
    });
    expect(deserializeAnchor(json)).toBeNull();
  });

  it('returns null for invalid textPosition shape', () => {
    const json = JSON.stringify({
      version: 1,
      exact: 'text',
      prefix: '',
      suffix: '',
      textPosition: { start: 'not a number', end: 0 },
    });
    expect(deserializeAnchor(json)).toBeNull();
  });

  it('serializes to compact JSON', () => {
    const anchor = makeAnchor();
    const json = serializeAnchor(anchor);
    expect(typeof json).toBe('string');
    // Should be parseable
    expect(() => JSON.parse(json)).not.toThrow();
  });
});

// ── HighlightMessage union type ──

describe('HighlightMessage type', () => {
  it('can construct a create message', () => {
    const msg: HighlightMessage = {
      type: HIGHLIGHT_CREATE,
      payload: {
        anchor: { version: 1, exact: 'test', prefix: '', suffix: '' },
        selectedText: 'test',
        pageUrl: 'https://example.com',
        pageTitle: 'Page',
      },
    };
    expect(msg.type).toBe(HIGHLIGHT_CREATE);
  });

  it('can construct a restore message', () => {
    const msg: HighlightMessage = {
      type: HIGHLIGHT_RESTORE,
      payload: { highlights: [] },
    };
    expect(msg.type).toBe(HIGHLIGHT_RESTORE);
  });

  it('can construct a check-url message', () => {
    const msg: HighlightMessage = {
      type: HIGHLIGHT_CHECK_URL,
      payload: { url: 'https://example.com', tabId: 1 },
    };
    expect(msg.type).toBe(HIGHLIGHT_CHECK_URL);
  });
});

/**
 * highlight-restore — tests for the four-step anchor restoration strategy.
 *
 * Uses jsdom mock DOM for each scenario:
 * 1. XPath Range resolution
 * 2. TextPosition char offset resolution
 * 3. CSS container + exact text search
 * 4. Fuzzy search (prefix + exact + suffix sliding window)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  restoreAnchor,
  findExactTextInElement,
  computeSimilarity,
} from '../../src/entrypoints/content/highlight-restore.js';
import type { HighlightAnchor } from '../../src/lib/highlight-anchor.js';

// ── Mock chrome.runtime.sendMessage for restoreHighlights ──
const mockSendMessage = vi.fn();
vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: mockSendMessage,
    lastError: null,
  },
});

// ── Test Helpers ──

function setupDOM(html: string): void {
  document.body.innerHTML = html;
}

function getTextNode(element: Element, index = 0): Text {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let count = 0;
  let node = walker.nextNode();
  while (node) {
    if (count === index) return node as Text;
    count++;
    node = walker.nextNode();
  }
  throw new Error(`Text node at index ${index} not found`);
}

function makeAnchor(overrides?: Partial<HighlightAnchor>): HighlightAnchor {
  return {
    version: 1,
    exact: 'highlighted text',
    prefix: 'before ',
    suffix: ' after',
    ...overrides,
  };
}

// ── Step 1: XPath Range ──

describe('restoreAnchor — XPath Range (Step 1)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('restores range when XPath resolves and text matches', () => {
    setupDOM('<div id="content"><p>Some highlighted text here</p></div>');

    // Build XPath that points to the text node inside <p>
    const p = document.querySelector('#content p')!;
    const textNode = getTextNode(p);

    const anchor = makeAnchor({
      exact: 'highlighted text',
      range: {
        startXPath: '//*[@id="content"]/p/text()[1]',
        startOffset: 5,
        endXPath: '//*[@id="content"]/p/text()[1]',
        endOffset: 21,
      },
    });

    const range = restoreAnchor(anchor);
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe('highlighted text');
  });

  it('fails XPath when text does not match', () => {
    setupDOM('<div id="content"><p>Different content now</p></div>');

    const anchor = makeAnchor({
      exact: 'highlighted text',
      prefix: '',
      suffix: '',
      range: {
        startXPath: '//*[@id="content"]/p/text()[1]',
        startOffset: 5,
        endXPath: '//*[@id="content"]/p/text()[1]',
        endOffset: 21,
      },
      // No textPosition or cssSelector — should fall to step 4
    });

    const range = restoreAnchor(anchor);
    // Falls through to later steps — won't find "highlighted text" at all
    expect(range).toBeNull();
  });

  it('falls through when XPath is missing', () => {
    setupDOM('<p>Some highlighted text here</p>');

    const anchor = makeAnchor({
      exact: 'highlighted text',
      // No range selector
      textPosition: { start: 5, end: 21 },
    });

    // Should still find via textPosition
    const range = restoreAnchor(anchor);
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe('highlighted text');
  });
});

// ── Step 2: TextPosition ──

describe('restoreAnchor — TextPosition (Step 2)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('restores range from character offsets', () => {
    setupDOM('<p>Hello world this is a test</p>');
    // "this" starts at index 12
    const anchor = makeAnchor({
      exact: 'this',
      textPosition: { start: 12, end: 16 },
    });

    const range = restoreAnchor(anchor);
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe('this');
  });

  it('fails when text at offset does not match exact', () => {
    setupDOM('<p>Page content has changed completely</p>');

    const anchor = makeAnchor({
      exact: 'original text',
      prefix: '',
      suffix: '',
      textPosition: { start: 5, end: 18 },
      // No range, no cssSelector — falls to fuzzy
    });

    const range = restoreAnchor(anchor);
    expect(range).toBeNull();
  });

  it('handles multi-element text offset', () => {
    setupDOM('<p>First</p><p>Second highlighted text here</p>');
    // "First" = 5 chars, "Second " starts at 5
    // "highlighted text" starts at 5+7=12
    const anchor = makeAnchor({
      exact: 'highlighted text',
      textPosition: { start: 12, end: 28 },
    });

    const range = restoreAnchor(anchor);
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe('highlighted text');
  });
});

// ── Step 3: CSS + Exact Search ──

describe('restoreAnchor — CSS + Exact Search (Step 3)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('finds exact text within CSS-selected container', () => {
    setupDOM(`
      <div id="header">Header content</div>
      <article id="main">This article contains highlighted text for reading</article>
      <div id="footer">Footer content</div>
    `);

    const anchor = makeAnchor({
      exact: 'highlighted text',
      cssSelector: '#main',
      // XPath and textPosition not set — forces CSS path
    });

    const range = restoreAnchor(anchor);
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe('highlighted text');
  });

  it('fails when CSS selector does not match any element', () => {
    setupDOM('<p>Some text</p>');

    const anchor = makeAnchor({
      exact: 'nonexistent',
      prefix: '',
      suffix: '',
      cssSelector: '#does-not-exist',
    });

    const range = restoreAnchor(anchor);
    expect(range).toBeNull();
  });

  it('fails when text is not in the CSS container', () => {
    setupDOM(`
      <div id="a">First container</div>
      <div id="b">Second container with highlighted text</div>
    `);

    const anchor = makeAnchor({
      exact: 'highlighted text',
      prefix: '',
      suffix: '',
      cssSelector: '#a', // Wrong container
    });

    // CSS search in #a fails, but fuzzy search finds it in body
    const range = restoreAnchor(anchor);
    expect(range).not.toBeNull(); // Found via fuzzy step
    expect(range!.toString()).toBe('highlighted text');
  });
});

// ── Step 4: Fuzzy Search ──

describe('restoreAnchor — Fuzzy Search (Step 4)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('finds text using prefix+exact+suffix full match', () => {
    setupDOM('<p>The text before highlighted text after the text</p>');

    const anchor = makeAnchor({
      exact: 'highlighted text',
      prefix: 'before ',
      suffix: ' after',
      // No range, no textPosition, no cssSelector
    });

    const range = restoreAnchor(anchor);
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe('highlighted text');
  });

  it('finds text when exact appears multiple times — uses context to disambiguate', () => {
    setupDOM('<p>The word test appears here. And the word test appears there too.</p>');

    const anchor = makeAnchor({
      exact: 'test',
      prefix: 'word ',
      suffix: ' appears there',
      // No structural selectors
    });

    const range = restoreAnchor(anchor);
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe('test');
    // Should find the second occurrence due to suffix context
  });

  it('returns null when exact text is completely absent', () => {
    setupDOM('<p>Completely different content</p>');

    const anchor = makeAnchor({
      exact: 'nonexistent phrase that is not on the page',
      prefix: 'before ',
      suffix: ' after',
    });

    const range = restoreAnchor(anchor);
    expect(range).toBeNull();
  });
});

// ── findExactTextInElement ──

describe('findExactTextInElement', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('finds exact text in an element', () => {
    setupDOM('<div><p>Hello <strong>world</strong> and more</p></div>');
    const div = document.querySelector('div')!;

    const range = findExactTextInElement(div, 'world');
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe('world');
  });

  it('returns null when text is not found', () => {
    setupDOM('<div>Some content</div>');
    const div = document.querySelector('div')!;

    const range = findExactTextInElement(div, 'missing');
    expect(range).toBeNull();
  });

  it('finds text spanning multiple elements', () => {
    setupDOM('<div>Hello <em>world</em> test</div>');
    const div = document.querySelector('div')!;

    // "world test" spans <em> and text node
    const range = findExactTextInElement(div, 'world test');
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe('world test');
  });
});

// ── computeSimilarity ──

describe('computeSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(computeSimilarity('hello', 'hello')).toBe(1);
  });

  it('returns 0 for completely different strings', () => {
    expect(computeSimilarity('abc', 'xyz')).toBe(0);
  });

  it('returns partial score for partially matching strings', () => {
    const score = computeSimilarity('hello', 'helly');
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThan(1);
  });

  it('returns 0 for empty strings', () => {
    expect(computeSimilarity('', 'test')).toBe(0);
    expect(computeSimilarity('test', '')).toBe(0);
    expect(computeSimilarity('', '')).toBe(0);
  });

  it('handles strings of different lengths', () => {
    const score = computeSimilarity('hel', 'hello');
    // 3 matching chars / max(3, 5) = 3/5 = 0.6
    expect(score).toBeCloseTo(0.6, 1);
  });
});

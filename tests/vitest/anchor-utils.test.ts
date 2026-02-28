/**
 * anchor-utils — tests for XPath generation, CSS selector generation,
 * text offset calculation, and prefix/exact/suffix extraction.
 *
 * Uses jsdom environment for DOM manipulation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getXPath,
  getCssSelector,
  getTextOffset,
  getTextContext,
  computeAnchor,
} from '../../src/entrypoints/content/anchor-utils.js';

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

// ── XPath Generation ──

describe('getXPath', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns ID-based shortcut when element has an id', () => {
    setupDOM('<div id="content"><p>Hello</p></div>');
    const div = document.getElementById('content')!;
    expect(getXPath(div)).toBe('//*[@id="content"]');
  });

  it('returns path with tag name when no id', () => {
    setupDOM('<article><p>First</p><p>Second</p></article>');
    const paragraphs = document.querySelectorAll('p');
    // The path should end with p[1] and p[2]
    const xpath1 = getXPath(paragraphs[0]);
    const xpath2 = getXPath(paragraphs[1]);
    expect(xpath1).toContain('p[1]');
    expect(xpath2).toContain('p[2]');
  });

  it('returns text node path for text nodes', () => {
    setupDOM('<p>Hello world</p>');
    const textNode = getTextNode(document.querySelector('p')!);
    const xpath = getXPath(textNode);
    expect(xpath).toContain('/text()[1]');
  });

  it('handles single child without index', () => {
    setupDOM('<div><p>Only child</p></div>');
    const p = document.querySelector('p')!;
    const xpath = getXPath(p);
    // Single <p> child — no index suffix needed
    expect(xpath).toContain('/p');
    expect(xpath).not.toContain('p[');
  });

  it('handles ID-based shortcut in ancestor for shorter path', () => {
    setupDOM('<div id="root"><section><p>Text</p></section></div>');
    const p = document.querySelector('p')!;
    const xpath = getXPath(p);
    expect(xpath).toContain('//*[@id="root"]');
  });

  it('returns empty string for non-element non-text nodes', () => {
    // Comment nodes
    const comment = document.createComment('test');
    expect(getXPath(comment)).toBe('');
  });
});

// ── CSS Selector Generation ──

describe('getCssSelector', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns ID selector for elements with id', () => {
    setupDOM('<div id="main"><p>Text</p></div>');
    const div = document.getElementById('main')!;
    expect(getCssSelector(div)).toBe('#main');
  });

  it('builds path with nth-child for ambiguous siblings', () => {
    setupDOM('<div><p>First</p><p>Second</p></div>');
    const paragraphs = document.querySelectorAll('p');
    const sel = getCssSelector(paragraphs[1]);
    // Should contain nth-child since there are 2 <p> siblings
    expect(sel).toContain(':nth-child(');
  });

  it('uses ancestor ID as base when available', () => {
    setupDOM('<div id="container"><section><p>Text</p></section></div>');
    const p = document.querySelector('p')!;
    const sel = getCssSelector(p);
    expect(sel).toContain('#container');
  });

  it('handles single child without nth-child', () => {
    setupDOM('<div><article><p>Text</p></article></div>');
    const p = document.querySelector('p')!;
    const sel = getCssSelector(p);
    // Single <p> inside <article> — no nth-child needed for unique children
    expect(sel).not.toContain(':nth-child(');
  });
});

// ── Text Offset Calculation ──

describe('getTextOffset', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('calculates offset for text at the start', () => {
    setupDOM('<p>Hello world</p>');
    const textNode = getTextNode(document.querySelector('p')!);
    const offset = getTextOffset(document.body, textNode, 0);
    expect(offset).toBe(0);
  });

  it('calculates offset within a text node', () => {
    setupDOM('<p>Hello world</p>');
    const textNode = getTextNode(document.querySelector('p')!);
    const offset = getTextOffset(document.body, textNode, 5);
    expect(offset).toBe(5);
  });

  it('calculates offset across multiple elements', () => {
    setupDOM('<p>Hello</p><p>World</p>');
    const secondP = document.querySelectorAll('p')[1];
    const textNode = getTextNode(secondP);
    const offset = getTextOffset(document.body, textNode, 0);
    // "Hello" is 5 chars, so "World" starts at offset 5
    expect(offset).toBe(5);
  });

  it('handles nested elements', () => {
    setupDOM('<div>Start <span>middle</span> end</div>');
    const texts = Array.from(document.querySelectorAll('div')[0].childNodes)
      .filter((n): n is Text => n.nodeType === Node.TEXT_NODE);
    // Last text node is " end", starts after "Start middle" (12 chars)
    const offset = getTextOffset(document.body, texts[1], 0);
    expect(offset).toBe(12); // "Start " (6) + "middle" (6) = 12
  });
});

// ── Text Context Extraction ──

describe('getTextContext', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('extracts prefix and suffix around exact text', () => {
    setupDOM('<p>The quick brown fox jumps over the lazy dog</p>');
    const { prefix, suffix } = getTextContext('brown fox', document.body);
    expect(prefix).toContain('quick');
    expect(suffix).toContain('jumps');
  });

  it('returns empty strings when exact text is not found', () => {
    setupDOM('<p>Hello world</p>');
    const { prefix, suffix } = getTextContext('nonexistent', document.body);
    expect(prefix).toBe('');
    expect(suffix).toBe('');
  });

  it('handles exact text at the beginning of content', () => {
    setupDOM('<p>Hello world and more text here</p>');
    const { prefix, suffix } = getTextContext('Hello', document.body);
    expect(prefix).toBe('');
    expect(suffix.length).toBeGreaterThan(0);
  });

  it('handles exact text at the end of content', () => {
    setupDOM('<p>Some text before end</p>');
    const { prefix, suffix } = getTextContext('end', document.body);
    expect(prefix.length).toBeGreaterThan(0);
    expect(suffix).toBe('');
  });
});

// ── computeAnchor (integration) ──

describe('computeAnchor', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('computes a complete anchor from a range', () => {
    setupDOM('<p>The quick brown fox jumps over the lazy dog</p>');

    const textNode = getTextNode(document.querySelector('p')!);
    const range = document.createRange();
    range.setStart(textNode, 10); // "brown"
    range.setEnd(textNode, 19);   // "brown fox"

    const anchor = computeAnchor(range);

    expect(anchor.version).toBe(1);
    expect(anchor.exact).toBe('brown fox');
    expect(anchor.prefix).toBeDefined();
    expect(anchor.suffix).toBeDefined();
    expect(anchor.range).toBeDefined();
    expect(anchor.range!.startXPath).toBeTruthy();
    expect(anchor.range!.endXPath).toBeTruthy();
    expect(anchor.range!.startOffset).toBe(10);
    expect(anchor.range!.endOffset).toBe(19);
    expect(anchor.textPosition).toBeDefined();
    expect(anchor.textPosition!.start).toBe(10);
    expect(anchor.textPosition!.end).toBe(19);
    expect(anchor.cssSelector).toBeDefined();
  });

  it('returns prefix and suffix context text', () => {
    setupDOM('<p>Hello world this is a test of highlighting in the page</p>');

    const textNode = getTextNode(document.querySelector('p')!);
    const range = document.createRange();
    range.setStart(textNode, 12);  // "this"
    range.setEnd(textNode, 26);    // "this is a test" (14 chars)

    const anchor = computeAnchor(range);

    expect(anchor.exact).toBe('this is a test');
    expect(anchor.prefix).toContain('world');
    expect(anchor.suffix).toContain('highlighting');
  });
});

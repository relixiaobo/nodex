/**
 * Google Docs clipping — tests for content extraction and
 * list nesting from the HTML export format.
 */
import { describe, it, expect } from 'vitest';
import { parseHtmlToNodes } from '../../src/lib/html-to-nodes.js';

describe('Google Docs content extraction via parseHtmlToNodes', () => {
  it('parses paragraphs from simple HTML', () => {
    const html = `<div>
<p>Introduction to the document</p>
<p>This is the first paragraph of actual content.</p>
<p>And here is a second paragraph with more details.</p>
</div>`;

    const { nodes } = parseHtmlToNodes(html);
    expect(nodes.length).toBeGreaterThanOrEqual(3);
    expect(nodes[0].name).toBe('Introduction to the document');
  });

  it('parses nested lists (post-processed Google Docs format)', () => {
    // After nestGoogleDocsLists converts flat kix lists → nested <ol>/<li>
    const html = `<ol>
<li><span>Level 0 item</span>
<ol>
<li><span>Level 1 child A</span>
<ol>
<li><span>Level 2 grandchild</span></li>
</ol>
</li>
<li><span>Level 1 child B</span></li>
</ol>
</li>
</ol>`;

    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('Level 0 item');
    expect(nodes[0].children).toHaveLength(2);
    expect(nodes[0].children[0].name).toBe('Level 1 child A');
    expect(nodes[0].children[0].children).toHaveLength(1);
    expect(nodes[0].children[0].children[0].name).toBe('Level 2 grandchild');
    expect(nodes[0].children[1].name).toBe('Level 1 child B');
  });

  it('handles headings extracted from Google Docs', () => {
    const html = `<div>
<h2>Chapter 1</h2>
<p>Content under chapter 1.</p>
<h3>Section 1.1</h3>
<p>Content under section 1.1.</p>
</div>`;

    const { nodes } = parseHtmlToNodes(html);
    const h2 = nodes.find(n => n.name === 'Chapter 1');
    expect(h2).toBeDefined();
    expect(h2!.marks).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'headingMark' })]),
    );
    expect(h2!.children.some(c => c.name === 'Content under chapter 1.')).toBe(true);
  });

  it('returns empty for content-less input', () => {
    const html = '<div></div>';
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(0);
  });
});

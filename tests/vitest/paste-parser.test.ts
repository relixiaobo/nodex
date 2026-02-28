import { describe, expect, it } from 'vitest';
import { parseHtmlBlocks, parseMarkdownList, parseMultiLinePaste } from '../../src/lib/paste-parser.js';

describe('paste-parser', () => {
  it('parses plain multi-line text to flat nodes', () => {
    const nodes = parseMultiLinePaste('Alpha\nBeta\nGamma');
    expect(nodes.map((n) => n.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(nodes.every((n) => n.children.length === 0)).toBe(true);
  });

  it('parses markdown unordered list hierarchy', () => {
    const nodes = parseMarkdownList([
      '- Parent',
      '  - Child 1',
      '  - Child 2',
      '- Sibling',
    ]);

    expect(nodes).not.toBeNull();
    expect(nodes?.map((n) => n.name)).toEqual(['Parent', 'Sibling']);
    expect(nodes?.[0].children.map((n) => n.name)).toEqual(['Child 1', 'Child 2']);
  });

  it('parses markdown ordered list and strips prefixes', () => {
    const nodes = parseMultiLinePaste('1. First\n2. Second\n3. Third');
    expect(nodes.map((n) => n.name)).toEqual(['First', 'Second', 'Third']);
  });

  it('returns null for non-list markdown input', () => {
    const parsed = parseMarkdownList([
      '  indented plain text',
      'next line',
    ]);
    expect(parsed).toBeNull();
  });

  it('parses HTML paragraphs and keeps marks', () => {
    const nodes = parseHtmlBlocks('<p>Hello <strong>World</strong></p><p>Next</p>');
    expect(nodes.map((n) => n.name)).toEqual(['Hello World', 'Next']);
    expect(nodes[0].marks.some((m) => m.type === 'bold')).toBe(true);
  });

  it('parses HTML list hierarchy', () => {
    const nodes = parseHtmlBlocks('<ul><li>Item 1<ul><li>Sub A</li></ul></li><li>Item 2</li></ul>');
    expect(nodes.map((n) => n.name)).toEqual(['Item 1', 'Item 2']);
    expect(nodes[0].children.map((n) => n.name)).toEqual(['Sub A']);
  });

  it('parses single-line HTML with inline formatting', () => {
    const nodes = parseMultiLinePaste('Bold', '<strong>Bold</strong>');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('Bold');
    expect(nodes[0].marks.some((m) => m.type === 'bold')).toBe(true);
  });

  it('extracts #tag tokens', () => {
    const nodes = parseMultiLinePaste('Buy milk #task #Home');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('Buy milk');
    expect(nodes[0].tags).toEqual(['task', 'Home']);
  });

  it('extracts field::value pairs', () => {
    const nodes = parseMultiLinePaste('Buy milk priority:: high owner:: me');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('Buy milk');
    expect(nodes[0].fields).toEqual([
      { name: 'priority', value: 'high' },
      { name: 'owner', value: 'me' },
    ]);
  });

  it('extracts mixed content (text + tags + fields)', () => {
    const nodes = parseMultiLinePaste('Buy milk #task priority:: high');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('Buy milk');
    expect(nodes[0].tags).toEqual(['task']);
    expect(nodes[0].fields).toEqual([{ name: 'priority', value: 'high' }]);
  });

  it('filters empty lines', () => {
    const nodes = parseMultiLinePaste('\n\nA\n\nB\n');
    expect(nodes.map((n) => n.name)).toEqual(['A', 'B']);
  });

  it('handles empty and whitespace-only input', () => {
    expect(parseMultiLinePaste('')).toEqual([]);
    expect(parseMultiLinePaste('   \n\t')).toEqual([]);
  });
});

/**
 * html-to-nodes — pure function tests.
 *
 * Covers: parseHtmlToNodes (HTML → intermediate tree) + createContentNodes (tree → Loro nodes).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { parseHtmlToNodes, createContentNodes } from '../../src/lib/html-to-nodes.js';
import { resetAndSeed } from './helpers/test-state.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { SYSTEM_NODE_IDS } from '../../src/types/index.js';

// ============================================================
// parseHtmlToNodes — pure function tests (no Loro dependency)
// ============================================================

describe('parseHtmlToNodes', () => {
  it('empty HTML → empty result', () => {
    expect(parseHtmlToNodes('')).toEqual({ nodes: [], truncated: false });
    expect(parseHtmlToNodes('   ')).toEqual({ nodes: [], truncated: false });
    expect(parseHtmlToNodes('<div></div>')).toEqual({ nodes: [], truncated: false });
  });

  it('single paragraph', () => {
    const { nodes, truncated } = parseHtmlToNodes('<p>Hello world</p>');
    expect(truncated).toBe(false);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('Hello world');
    expect(nodes[0].marks).toEqual([]);
    expect(nodes[0].children).toEqual([]);
  });

  it('multiple paragraphs', () => {
    const html = '<p>First paragraph</p><p>Second paragraph</p><p>Third paragraph</p>';
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(3);
    expect(nodes[0].name).toBe('First paragraph');
    expect(nodes[1].name).toBe('Second paragraph');
    expect(nodes[2].name).toBe('Third paragraph');
  });

  it('preserves bold mark', () => {
    const { nodes } = parseHtmlToNodes('<p>This is <strong>bold</strong> text</p>');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('This is bold text');
    expect(nodes[0].marks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'bold', start: 8, end: 12 }),
      ]),
    );
  });

  it('preserves italic mark', () => {
    const { nodes } = parseHtmlToNodes('<p><em>italic</em> text</p>');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].marks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'italic', start: 0, end: 6 }),
      ]),
    );
  });

  it('preserves class-based bold/italic marks from clipboard style blocks', () => {
    const html = [
      '<style>.bi{font-weight:700;font-style:italic;}</style>',
      '<p><span class="bi">Styled</span> text</p>',
    ].join('');
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('Styled text');
    expect(nodes[0].marks).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'bold', start: 0, end: 6 }),
      expect.objectContaining({ type: 'italic', start: 0, end: 6 }),
    ]));
  });

  it('preserves link mark with href', () => {
    const { nodes } = parseHtmlToNodes('<p>Visit <a href="https://example.com">here</a></p>');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('Visit here');
    expect(nodes[0].marks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'link', start: 6, end: 10, attrs: { href: 'https://example.com' } }),
      ]),
    );
  });

  it('preserves code mark', () => {
    const { nodes } = parseHtmlToNodes('<p>Use <code>npm install</code> to install</p>');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].marks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'code' }),
      ]),
    );
  });

  it('merges top-level inline sibling fragments into one paragraph node', () => {
    const html = [
      '<span>The word </span>',
      '<i>emoji</i>',
      '<span> comes from Japanese </span>',
      '<span>e</span>',
      '<span> (絵; \'picture\') + </span>',
      '<i>moji</i>',
      '<span> (文字; \'character\').</span>',
      '<sup>[3]</sup>',
    ].join('');
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toContain('The word emoji comes from Japanese');
    expect(nodes[0].name).toContain('moji');
    expect(nodes[0].name).toContain('[3]');
    expect(nodes[0].marks.some((m) => m.type === 'italic')).toBe(true);
  });

  it('splits inline flows by br into multiple nodes', () => {
    const html = '<span>Line A</span><br><span>Line B</span>';
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes.map((n) => n.name)).toEqual(['Line A', 'Line B']);
  });

  // ── Heading hierarchy ──

  it('h2 creates section parent with subsequent p as children', () => {
    const html = '<h2>Introduction</h2><p>First para</p><p>Second para</p>';
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('Introduction');
    expect(nodes[0].children).toHaveLength(2);
    expect(nodes[0].children[0].name).toBe('First para');
    expect(nodes[0].children[1].name).toBe('Second para');
  });

  it('h2 > h3 nested hierarchy', () => {
    const html = `
      <h2>Section A</h2>
      <p>Intro text</p>
      <h3>Subsection</h3>
      <p>Detail text</p>
    `;
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('Section A');
    expect(nodes[0].children).toHaveLength(2); // "Intro text" + "Subsection"
    const subsection = nodes[0].children[1];
    expect(subsection.name).toBe('Subsection');
    expect(subsection.children).toHaveLength(1);
    expect(subsection.children[0].name).toBe('Detail text');
  });

  it('heading level reset (h2 after h3 pops back)', () => {
    const html = `
      <h2>Part 1</h2>
      <h3>Sub 1</h3>
      <p>Sub 1 content</p>
      <h2>Part 2</h2>
      <p>Part 2 content</p>
    `;
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(2);
    expect(nodes[0].name).toBe('Part 1');
    expect(nodes[0].children).toHaveLength(1); // Sub 1
    expect(nodes[0].children[0].name).toBe('Sub 1');
    expect(nodes[0].children[0].children).toHaveLength(1); // Sub 1 content
    expect(nodes[1].name).toBe('Part 2');
    expect(nodes[1].children).toHaveLength(1); // Part 2 content
  });

  it('h1 is skipped (duplicates clip title)', () => {
    const html = '<h1>Title</h1><p>Content</p>';
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('Content');
  });

  it('includeH1 option keeps h1 as heading section', () => {
    const html = '<h1>Title</h1><p>Content</p>';
    const { nodes } = parseHtmlToNodes(html, { includeH1: true });
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('Title');
    expect(nodes[0].marks.some((m) => m.type === 'headingMark')).toBe(true);
    expect(nodes[0].children).toHaveLength(1);
    expect(nodes[0].children[0].name).toBe('Content');
  });

  it('infers styled paragraph heading sections when enabled', () => {
    const html = '<p><span style="font-size:26pt;font-weight:700">Skills</span></p><p>Detail line</p>';
    const { nodes } = parseHtmlToNodes(html, { inferStyledHeadings: true });
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('Skills');
    expect(nodes[0].marks.some((m) => m.type === 'headingMark')).toBe(true);
    expect(nodes[0].children.map((n) => n.name)).toEqual(['Detail line']);
  });

  // ── Lists ──

  it('flat list items', () => {
    const html = '<ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>';
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(3);
    expect(nodes[0].name).toBe('Item 1');
    expect(nodes[1].name).toBe('Item 2');
    expect(nodes[2].name).toBe('Item 3');
  });

  it('nested list creates child nodes', () => {
    const html = `
      <ul>
        <li>Parent
          <ul>
            <li>Child 1</li>
            <li>Child 2</li>
          </ul>
        </li>
      </ul>
    `;
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('Parent');
    expect(nodes[0].children).toHaveLength(2);
    expect(nodes[0].children[0].name).toBe('Child 1');
    expect(nodes[0].children[1].name).toBe('Child 2');
  });

  it('ordered list items', () => {
    const html = '<ol><li>Step 1</li><li>Step 2</li></ol>';
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(2);
    expect(nodes[0].name).toBe('Step 1');
  });

  it('infers paragraph bullet hierarchy when enabled', () => {
    const html = [
      '<p style="margin-left:0pt">• Parent</p>',
      '<p style="margin-left:36pt">• Child</p>',
      '<p style="margin-left:0pt">• Sibling</p>',
    ].join('');
    const { nodes } = parseHtmlToNodes(html, { inferParagraphLists: true });
    expect(nodes.map((n) => n.name)).toEqual(['Parent', 'Sibling']);
    expect(nodes[0].children.map((n) => n.name)).toEqual(['Child']);
  });

  it('infers hierarchy from class-based styles in clipboard html', () => {
    const html = [
      '<style>',
      '.h{font-size:26pt;font-weight:700;}',
      '.l0{margin-left:0pt;}',
      '.l1{margin-left:36pt;}',
      '</style>',
      '<p class="h">Experience</p>',
      '<p class="l0">• Parent</p>',
      '<p class="l1">• Child</p>',
    ].join('');

    const { nodes } = parseHtmlToNodes(html, {
      inferStyledHeadings: true,
      inferParagraphLists: true,
    });

    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('Experience');
    expect(nodes[0].children.map((n) => n.name)).toEqual(['Parent']);
    expect(nodes[0].children[0].children.map((n) => n.name)).toEqual(['Child']);
  });

  it('splits styled block descendants into separate nodes', () => {
    const html = '<div><span style="display:block">Line A</span><span style="display:block">Line B</span></div>';
    const { nodes } = parseHtmlToNodes(html, { inferStyledHeadings: true, inferParagraphLists: true });
    expect(nodes.map((n) => n.name)).toEqual(['Line A', 'Line B']);
  });

  // ── Blockquote ──

  it('blockquote with paragraphs creates parent with children', () => {
    const html = '<blockquote><p>Quote line 1</p><p>Quote line 2</p></blockquote>';
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(1);
    // First paragraph becomes the parent node name, second is child
    expect(nodes[0].name).toBe('Quote line 1');
    expect(nodes[0].children).toHaveLength(1);
    expect(nodes[0].children[0].name).toBe('Quote line 2');
  });

  it('simple blockquote with only inline text', () => {
    const html = '<blockquote>A simple quote</blockquote>';
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('A simple quote');
    expect(nodes[0].children).toEqual([]);
  });

  // ── Code blocks ──

  it('pre > code block becomes codeBlock node with language', () => {
    const html = '<pre><code>const x = 42;\nconsole.log(x);</code></pre>';
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toContain('const x = 42;');
    expect(nodes[0].type).toBe('codeBlock');
    expect(nodes[0].marks).toEqual([]);
  });

  it('pre without code child still works', () => {
    const html = '<pre>plain preformatted text</pre>';
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('plain preformatted text');
    expect(nodes[0].type).toBe('codeBlock');
  });

  // ── Skipped elements ──

  it('figure/img are parsed as image nodes', () => {
    const html = '<p>Before</p><figure><img src="test.jpg"><figcaption>Caption</figcaption></figure><p>After</p>';
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(3);
    expect(nodes[0].name).toBe('Before');
    expect(nodes[1].type).toBe('image');
    expect(nodes[1].mediaUrl).toBe('test.jpg');
    expect(nodes[1].mediaAlt).toBe('Caption');
    expect(nodes[2].name).toBe('After');
  });

  it('hr is skipped', () => {
    const html = '<p>Before</p><hr><p>After</p>';
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(2);
  });

  it('style/script metadata tags are skipped from output nodes', () => {
    const html = [
      '<style><!--td {border:1px solid;}br {mso-data-placement:same-cell;}--></style>',
      '<script>console.log("ignore")</script>',
      '<meta charset="utf-8">',
      '<p>Before</p>',
      '<p>After</p>',
    ].join('');
    const { nodes } = parseHtmlToNodes(html, { inferStyledHeadings: true, inferParagraphLists: true });
    expect(nodes.map((n) => n.name)).toEqual(['Before', 'After']);
  });

  // ── Table ──

  it('table rows become pipe-joined nodes', () => {
    const html = '<table><tr><td>Name</td><td>Age</td></tr><tr><td>Alice</td><td>30</td></tr></table>';
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(2);
    expect(nodes[0].name).toBe('Name | Age');
    expect(nodes[1].name).toBe('Alice | 30');
  });

  // ── Div transparent container ──

  it('div is transparent — recurses into children', () => {
    const html = '<div><p>Inside div</p></div>';
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('Inside div');
  });

  // ── Inline wrapper with block children (Google Docs) ──

  it('recurses into inline wrapper that contains block children (Google Docs <b> wrapper)', () => {
    // Google Docs wraps clipboard HTML in <b style="font-weight:normal">
    const html = [
      '<meta charset="utf-8">',
      '<b style="font-weight:normal" id="docs-internal-guid-abc">',
      '<p dir="ltr" style="font-size:26pt;font-weight:700"><span>Experience</span></p>',
      '<p dir="ltr"><span style="font-weight:700">Company Name</span><span> – </span><span style="font-style:italic">Job Title</span></p>',
      '<ul><li dir="ltr"><span>Did some things</span></li></ul>',
      '</b>',
    ].join('');
    const { nodes } = parseHtmlToNodes(html, { inferStyledHeadings: true, inferParagraphLists: true });
    expect(nodes.length).toBeGreaterThanOrEqual(1);
    // "Experience" should be a heading, not concatenated with Company Name
    expect(nodes[0].name).toBe('Experience');
    expect(nodes[0].children.length).toBeGreaterThan(0);
  });

  // ── maxNodes truncation ──

  it('respects maxNodes limit', () => {
    const html = '<p>A</p><p>B</p><p>C</p><p>D</p><p>E</p>';
    const { nodes, truncated } = parseHtmlToNodes(html, { maxNodes: 3 });
    expect(truncated).toBe(true);
    expect(nodes).toHaveLength(3);
    expect(nodes[0].name).toBe('A');
    expect(nodes[2].name).toBe('C');
  });

  it('maxNodes counts nested nodes', () => {
    const html = '<h2>Section</h2><p>P1</p><p>P2</p><p>P3</p>';
    // Section(1) + P1(2) + P2(3) = 3 nodes, P3 truncated
    const { nodes, truncated } = parseHtmlToNodes(html, { maxNodes: 3 });
    expect(truncated).toBe(true);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].children).toHaveLength(2);
  });

  // ── Mixed content end-to-end ──

  it('mixed content: headings + paragraphs + list + code', () => {
    const html = `
      <h2>Getting Started</h2>
      <p>Install the package:</p>
      <pre><code>npm install nodex</code></pre>
      <h3>Configuration</h3>
      <ul>
        <li>Set API key</li>
        <li>Choose region</li>
      </ul>
      <h2>Usage</h2>
      <p>Import and use:</p>
    `;
    const { nodes, truncated } = parseHtmlToNodes(html);
    expect(truncated).toBe(false);

    // Top level: "Getting Started" section + "Usage" section
    expect(nodes).toHaveLength(2);
    expect(nodes[0].name).toBe('Getting Started');
    expect(nodes[1].name).toBe('Usage');

    // Getting Started children: p + pre + Configuration section
    const gsChildren = nodes[0].children;
    expect(gsChildren.length).toBeGreaterThanOrEqual(3);
    expect(gsChildren[0].name).toBe('Install the package:');
    // Code block
    expect(gsChildren[1].name).toContain('npm install nodex');
    // Configuration subsection
    const configSection = gsChildren[2];
    expect(configSection.name).toBe('Configuration');
    expect(configSection.children).toHaveLength(2);
    expect(configSection.children[0].name).toBe('Set API key');

    // Usage children
    expect(nodes[1].children).toHaveLength(1);
    expect(nodes[1].children[0].name).toBe('Import and use:');
  });
});

// ============================================================
// createContentNodes — Loro materialization tests
// ============================================================

describe('createContentNodes', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('creates flat child nodes under parent', () => {
    const parentId = 'inbox_1';
    const childrenBefore = loroDoc.getChildren(parentId).length;

    const nodes = [
      { name: 'First', marks: [], inlineRefs: [], children: [] },
      { name: 'Second', marks: [], inlineRefs: [], children: [] },
    ];

    const ids = createContentNodes(parentId, nodes);
    expect(ids).toHaveLength(2);

    const childrenAfter = loroDoc.getChildren(parentId);
    expect(childrenAfter.length).toBe(childrenBefore + 2);

    const first = loroDoc.toNodexNode(ids[0]);
    expect(first).toBeDefined();
    expect(first!.name).toBe('First');

    const second = loroDoc.toNodexNode(ids[1]);
    expect(second!.name).toBe('Second');
  });

  it('creates nested child hierarchy', () => {
    const parentId = 'inbox_2';
    const nodes = [
      {
        name: 'Section',
        marks: [],
        inlineRefs: [],
        children: [
          { name: 'Child 1', marks: [], inlineRefs: [], children: [] },
          { name: 'Child 2', marks: [], inlineRefs: [], children: [] },
        ],
      },
    ];

    const ids = createContentNodes(parentId, nodes);
    expect(ids).toHaveLength(1);

    const section = loroDoc.toNodexNode(ids[0]);
    expect(section!.name).toBe('Section');
    expect(section!.children).toHaveLength(2);

    const child1 = loroDoc.toNodexNode(section!.children[0]);
    expect(child1!.name).toBe('Child 1');
  });

  it('preserves marks on created nodes', () => {
    const parentId = 'inbox_1';
    const nodes = [
      {
        name: 'Bold text here',
        marks: [{ start: 0, end: 4, type: 'bold' as const }],
        inlineRefs: [],
        children: [],
      },
    ];

    const ids = createContentNodes(parentId, nodes);
    const node = loroDoc.toNodexNode(ids[0]);
    expect(node!.name).toBe('Bold text here');
    expect(node!.marks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'bold', start: 0, end: 4 }),
      ]),
    );
  });

  it('persists codeBlock type metadata when creating nodes', () => {
    const parentId = 'inbox_1';
    const nodes = [
      {
        name: 'console.log("hello")',
        marks: [],
        inlineRefs: [],
        children: [],
        type: 'codeBlock' as const,
        codeLanguage: 'javascript',
      },
    ];

    const ids = createContentNodes(parentId, nodes);
    const created = loroDoc.toNodexNode(ids[0]);
    expect(created?.type).toBe('codeBlock');
    expect(created?.codeLanguage).toBe('javascript');
    expect(created?.name).toBe('console.log("hello")');
  });

  it('empty nodes array returns empty ids', () => {
    const ids = createContentNodes('inbox_1', []);
    expect(ids).toEqual([]);
  });

  it('persists image type metadata when creating nodes', () => {
    const parentId = 'inbox_1';
    const nodes = [
      {
        name: 'A photo',
        marks: [],
        inlineRefs: [],
        children: [],
        type: 'image' as const,
        mediaUrl: 'https://example.com/photo.jpg',
        mediaAlt: 'A photo',
        imageWidth: 800,
        imageHeight: 600,
      },
    ];

    const ids = createContentNodes(parentId, nodes);
    const created = loroDoc.toNodexNode(ids[0]);
    expect(created?.type).toBe('image');
    expect(created?.mediaUrl).toBe('https://example.com/photo.jpg');
    expect(created?.mediaAlt).toBe('A photo');
    expect(created?.imageWidth).toBe(800);
    expect(created?.imageHeight).toBe(600);
  });

  it('persists embed type metadata when creating nodes', () => {
    const parentId = 'inbox_1';
    const nodes = [
      {
        name: '',
        marks: [],
        inlineRefs: [],
        children: [],
        type: 'embed' as const,
        embedType: 'twitter-video',
        mediaUrl: 'https://video.twimg.com/ext_tw_video/123/pu/vid/720x1280/abc.mp4',
        mediaAlt: 'https://pbs.twimg.com/poster.jpg',
      },
    ];

    const ids = createContentNodes(parentId, nodes);
    const created = loroDoc.toNodexNode(ids[0]);
    expect(created?.type).toBe('embed');
    expect(created?.embedType).toBe('twitter-video');
    expect(created?.mediaUrl).toBe('https://video.twimg.com/ext_tw_video/123/pu/vid/720x1280/abc.mp4');
    expect(created?.mediaAlt).toBe('https://pbs.twimg.com/poster.jpg');
  });
});

// ============================================================
// parseHtmlToNodes — image and media tests
// ============================================================

describe('parseHtmlToNodes — images', () => {
  it('parses <img> into image node', () => {
    const html = '<p>Before</p><img src="https://example.com/photo.jpg" alt="A photo" width="800" height="600"><p>After</p>';
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(3);
    expect(nodes[1].type).toBe('image');
    expect(nodes[1].mediaUrl).toBe('https://example.com/photo.jpg');
    expect(nodes[1].mediaAlt).toBe('A photo');
    expect(nodes[1].imageWidth).toBe(800);
    expect(nodes[1].imageHeight).toBe(600);
  });

  it('skips <img> with data: URI', () => {
    const html = '<img src="data:image/png;base64,iVBORw0KGgo=">';
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(0);
  });

  it('skips <img> without src', () => {
    const html = '<img alt="no source">';
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(0);
  });

  it('fixes protocol-relative URL', () => {
    const html = '<img src="//cdn.example.com/img.jpg">';
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].mediaUrl).toBe('https://cdn.example.com/img.jpg');
  });

  it('parses <figure> with <img> and <figcaption>', () => {
    const html = '<figure><img src="https://example.com/fig.jpg"><figcaption>Caption text</figcaption></figure>';
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('image');
    expect(nodes[0].mediaUrl).toBe('https://example.com/fig.jpg');
    expect(nodes[0].mediaAlt).toBe('Caption text');
  });

  it('parses <picture> containing <img>', () => {
    const html = '<picture><source srcset="large.webp"><img src="https://example.com/fallback.jpg" alt="pic"></picture>';
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('image');
    expect(nodes[0].mediaUrl).toBe('https://example.com/fallback.jpg');
    expect(nodes[0].mediaAlt).toBe('pic');
  });
});

describe('parseHtmlToNodes — iframes', () => {
  it('skips YouTube iframe (users access via Source URL)', () => {
    const html = '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>';
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(0);
  });

  it('skips non-YouTube iframe', () => {
    const html = '<iframe src="https://example.com/embed"></iframe>';
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(0);
  });

  it('skips iframe without src', () => {
    const html = '<iframe></iframe>';
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(0);
  });

  it('skips audio elements', () => {
    const html = '<audio src="test.mp3"></audio>';
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(0);
  });
});

describe('parseHtmlToNodes — video elements', () => {
  it('parses <video> with video.twimg.com src as twitter-video embed', () => {
    const html = '<video src="https://video.twimg.com/ext_tw_video/123/pu/vid/720x1280/abc.mp4" poster="https://pbs.twimg.com/poster.jpg"></video>';
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('embed');
    expect(nodes[0].embedType).toBe('twitter-video');
    expect(nodes[0].mediaUrl).toBe('https://video.twimg.com/ext_tw_video/123/pu/vid/720x1280/abc.mp4');
    expect(nodes[0].mediaAlt).toBe('https://pbs.twimg.com/poster.jpg');
  });

  it('parses <video> with poster only (no src) as twitter-video embed', () => {
    const html = '<video poster="https://pbs.twimg.com/poster.jpg"></video>';
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('embed');
    expect(nodes[0].embedType).toBe('twitter-video');
    expect(nodes[0].mediaUrl).toBeUndefined();
    expect(nodes[0].mediaAlt).toBe('https://pbs.twimg.com/poster.jpg');
  });

  it('skips <video> with non-twimg src (no poster)', () => {
    const html = '<video src="https://example.com/video.mp4"></video>';
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(0);
  });

  it('skips <video> with no src and no poster', () => {
    const html = '<video></video>';
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(0);
  });

  it('falls back to poster-only twitter-video for non-twimg src with poster', () => {
    const html = '<video src="blob:https://x.com/abc123" poster="https://pbs.twimg.com/poster.jpg"></video>';
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('embed');
    expect(nodes[0].embedType).toBe('twitter-video');
    expect(nodes[0].mediaUrl).toBeUndefined();
    expect(nodes[0].mediaAlt).toBe('https://pbs.twimg.com/poster.jpg');
  });
});

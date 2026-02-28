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

  it('parses mixed markdown document with heading sections + lists + tables', () => {
    const nodes = parseMultiLinePaste([
      '# soma',
      'Chrome Side Panel 云端知识管理工具。',
      '## 项目概述',
      '支持结构化记录。',
      '## 沟通约定',
      '| 用户说 | Claude 应做 |',
      '|--------|------------|',
      '| \"实现 X\" | 直接写代码 |',
      '- 规则 A',
      '  - 规则 A.1',
    ].join('\n'));

    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('soma');
    expect(nodes[0].children.some((n) => n.name === 'Chrome Side Panel 云端知识管理工具。')).toBe(true);

    const overview = nodes[0].children.find((n) => n.name === '项目概述');
    expect(overview).toBeTruthy();
    expect(overview?.children.map((n) => n.name)).toContain('支持结构化记录。');

    const convention = nodes[0].children.find((n) => n.name === '沟通约定');
    expect(convention).toBeTruthy();
    expect(convention?.children.map((n) => n.name)).toContain('用户说 | Claude 应做');
    expect(convention?.children.map((n) => n.name)).toContain('"实现 X" | 直接写代码');

    const ruleA = convention?.children.find((n) => n.name === '规则 A');
    expect(ruleA).toBeTruthy();
    expect(ruleA?.children.map((n) => n.name)).toEqual(['规则 A.1']);
  });

  it('strips inline markdown markers from plain markdown lines', () => {
    const nodes = parseMultiLinePaste('**核心设计原则**：保持简单。');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('核心设计原则：保持简单。');
    expect(nodes[0].marks.some((m) => m.type === 'bold')).toBe(true);
  });

  it('parses fenced markdown code block as codeBlock node', () => {
    const nodes = parseMultiLinePaste([
      '```ts',
      'const answer = 42;',
      'console.log(answer);',
      '```',
    ].join('\n'));

    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('codeBlock');
    expect(nodes[0].codeLanguage).toBe('ts');
    expect(nodes[0].name).toBe('const answer = 42;\nconsole.log(answer);');
    expect(nodes[0].marks).toEqual([]);
  });

  it('parses fenced code block under heading section', () => {
    const nodes = parseMultiLinePaste([
      '## 示例',
      '```css',
      '.card {',
      '  color: red;',
      '}',
      '```',
    ].join('\n'));

    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('示例');
    expect(nodes[0].children).toHaveLength(1);
    expect(nodes[0].children[0].type).toBe('codeBlock');
    expect(nodes[0].children[0].codeLanguage).toBe('css');
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

  it('keeps h1 as heading section for paste html', () => {
    const nodes = parseHtmlBlocks('<h1>Main title</h1><p>Paragraph</p>');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('Main title');
    expect(nodes[0].marks.some((m) => m.type === 'headingMark')).toBe(true);
    expect(nodes[0].children.map((n) => n.name)).toEqual(['Paragraph']);
  });

  it('parses HTML pre/code block as codeBlock node', () => {
    const nodes = parseHtmlBlocks('<pre><code class="language-js">console.log(1)</code></pre>');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('codeBlock');
    expect(nodes[0].codeLanguage).toBe('js');
    expect(nodes[0].name).toBe('console.log(1)');
    expect(nodes[0].marks).toEqual([]);
  });

  it('prefers markdown parser when clipboard html is list-wrapped markdown-like text', () => {
    const plain = [
      '### Standalone 测试环境',
      '```bash',
      'npm run dev:test',
      '```',
    ].join('\n');
    const html = '<ul><li>### Standalone 测试环境</li><li>```bash</li><li>npm run dev:test</li><li>```</li></ul>';

    const nodes = parseMultiLinePaste(plain, html);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('Standalone 测试环境');
    expect(nodes[0].children).toHaveLength(1);
    expect(nodes[0].children[0].type).toBe('codeBlock');
    expect(nodes[0].children[0].name).toBe('npm run dev:test');
  });

  it('prefers html parser when html contains rich formatting from clipboard', () => {
    const plain = [
      '- Bold item',
      '- Link item',
    ].join('\n');
    const html = [
      '<ul>',
      '  <li><span style="font-weight:700">Bold item</span></li>',
      '  <li><a href="https://example.com">Link item</a></li>',
      '</ul>',
    ].join('');

    const nodes = parseMultiLinePaste(plain, html);
    expect(nodes).toHaveLength(2);
    expect(nodes[0].name).toBe('Bold item');
    expect(nodes[0].marks.some((m) => m.type === 'bold')).toBe(true);
    expect(nodes[1].name).toBe('Link item');
    expect(nodes[1].marks.some((m) => m.type === 'link')).toBe(true);
  });

  it('prefers html blocks over markdown list when clipboard includes html paragraphs', () => {
    const plain = [
      '- Parent',
      '  - Child',
    ].join('\n');
    const html = '<p>Parent</p><p>Child</p>';
    const nodes = parseMultiLinePaste(plain, html);
    expect(nodes.map((n) => n.name)).toEqual(['Parent', 'Child']);
    expect(nodes.every((n) => n.children.length === 0)).toBe(true);
  });

  it('parses html paragraph bullets into hierarchy for docs-like clipboard html', () => {
    const html = [
      '<p style="font-size:26pt;font-weight:700">Experience</p>',
      '<p style="margin-left:0pt">• Parent</p>',
      '<p style="margin-left:36pt">• Child</p>',
    ].join('');
    const nodes = parseHtmlBlocks(html);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('Experience');
    expect(nodes[0].children.map((n) => n.name)).toEqual(['Parent']);
    expect(nodes[0].children[0].children.map((n) => n.name)).toEqual(['Child']);
  });

  it('parses class-styled docs html into heading + hierarchy', () => {
    const html = [
      '<style>',
      '.h{font-size:26pt;font-weight:700;}',
      '.l0{margin-left:0pt;}',
      '.l1{margin-left:36pt;}',
      '.bi{font-weight:700;font-style:italic;}',
      '</style>',
      '<p class="h">Experience</p>',
      '<p class="l0"><span class="bi">• Parent</span></p>',
      '<p class="l1">• Child</p>',
    ].join('');

    const nodes = parseHtmlBlocks(html);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('Experience');
    expect(nodes[0].children).toHaveLength(1);
    expect(nodes[0].children[0].name).toBe('Parent');
    expect(nodes[0].children[0].marks.some((m) => m.type === 'bold')).toBe(true);
    expect(nodes[0].children[0].marks.some((m) => m.type === 'italic')).toBe(true);
    expect(nodes[0].children[0].children.map((n) => n.name)).toEqual(['Child']);
  });

  it('normalizes bullet-wrapped markdown lines from clipboard shells', () => {
    const plain = [
      '• ### Standalone 测试环境',
      '• ```bash',
      '• npm run dev:test',
      '• ```',
      '• **加粗** 和 *斜体*',
      '• ---',
    ].join('\n');

    const nodes = parseMultiLinePaste(plain, '<ul><li>dummy</li></ul>');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('Standalone 测试环境');
    expect(nodes[0].children[0].type).toBe('codeBlock');
    expect(nodes[0].children[0].name).toBe('npm run dev:test');
    const richLine = nodes[0].children.find((n) => n.type !== 'codeBlock');
    expect(richLine?.name).toBe('加粗 和 斜体');
    expect(richLine?.marks.some((m) => m.type === 'bold')).toBe(true);
    expect(richLine?.marks.some((m) => m.type === 'italic')).toBe(true);
    expect(nodes[0].children.some((n) => n.name === '---')).toBe(false);
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

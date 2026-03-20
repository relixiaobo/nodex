import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { extractInlineMarkup } from '../../src/components/chat/MarkdownRenderer.js';
import { NodeEmbed } from '../../src/components/chat/NodeEmbed.js';
import {
  scanAndTrackMentionedNodes,
  buildMentionedNodeEditReminder,
  clearMentionedNodes,
} from '../../src/lib/ai-mentioned-nodes.js';
import { resetAndSeed } from './helpers/test-state.js';

// ── extractInlineMarkup: <node /> parsing ──

describe('extractInlineMarkup — <node /> tags', () => {
  it('extracts a standalone <node /> on its own line', () => {
    const text = 'Some text\n<node id="abc123" />\nMore text';
    const { cleaned, placeholders } = extractInlineMarkup(text);

    expect(placeholders).toHaveLength(1);
    expect(placeholders[0]).toEqual({ kind: 'node', nodeId: 'abc123' });
    // Should be wrapped in blank lines to form its own markdown paragraph
    expect(cleaned).toContain('%%SOMA_0%%');
    expect(cleaned).not.toContain('<node');
  });

  it('extracts multiple consecutive <node /> tags', () => {
    const text = '<node id="a1" />\n<node id="b2" />\n<node id="c3" />';
    const { placeholders } = extractInlineMarkup(text);

    expect(placeholders).toHaveLength(3);
    expect(placeholders.map((p) => p.nodeId)).toEqual(['a1', 'b2', 'c3']);
  });

  it('does NOT extract <node /> mixed inline with text', () => {
    const text = 'Found <node id="abc123" /> this node';
    const { cleaned, placeholders } = extractInlineMarkup(text);

    // The line has text before and after, so the regex should NOT match
    const nodePlaceholders = placeholders.filter((p) => p.kind === 'node');
    expect(nodePlaceholders).toHaveLength(0);
    expect(cleaned).toContain('<node id="abc123" />');
  });

  it('handles <node /> with whitespace around it on the line', () => {
    const text = '  <node id="xyz" />  ';
    const { placeholders } = extractInlineMarkup(text);

    expect(placeholders).toHaveLength(1);
    expect(placeholders[0]).toEqual({ kind: 'node', nodeId: 'xyz' });
  });

  it('ignores incomplete <node tags during streaming', () => {
    const text = 'Here is a result:\n<node id="abc';
    const { placeholders } = extractInlineMarkup(text);

    const nodeP = placeholders.filter((p) => p.kind === 'node');
    expect(nodeP).toHaveLength(0);
  });

  it('mixes <ref>, <cite>, and <node /> correctly', () => {
    const text = [
      'See <ref id="r1">this note</ref> for details.',
      '<node id="n1" />',
      'Evidence: <cite id="c1">1</cite>',
    ].join('\n');

    const { placeholders } = extractInlineMarkup(text);

    // node extracted first (pass 1), then ref (pass 2), then cite (pass 3)
    expect(placeholders).toHaveLength(3);
    expect(placeholders[0]).toEqual({ kind: 'node', nodeId: 'n1' });
    expect(placeholders[1]).toEqual({ kind: 'ref', nodeId: 'r1', content: 'this note' });
    expect(placeholders[2]).toEqual({ kind: 'cite', id: 'c1', content: '1', citeType: 'node' });
  });
});

// ── extractInlineMarkup: existing <ref> / <cite> behavior preserved ──

describe('extractInlineMarkup — ref/cite backward compatibility', () => {
  it('extracts <ref> tags as before', () => {
    const text = 'Check <ref id="abc">my note</ref> here.';
    const { cleaned, placeholders } = extractInlineMarkup(text);

    expect(placeholders).toHaveLength(1);
    expect(placeholders[0]).toEqual({ kind: 'ref', nodeId: 'abc', content: 'my note' });
    expect(cleaned).toContain('%%SOMA_0%%');
    expect(cleaned).not.toContain('<ref');
  });

  it('extracts <cite> tags without type as node (default)', () => {
    const text = 'Source <cite id="xyz">1</cite>.';
    const { cleaned, placeholders } = extractInlineMarkup(text);

    expect(placeholders).toHaveLength(1);
    expect(placeholders[0]).toEqual({ kind: 'cite', id: 'xyz', content: '1', citeType: 'node' });
    expect(cleaned).toContain('%%SOMA_0%%');
  });
});

// ── extractInlineMarkup: cite types ──

describe('extractInlineMarkup — cite types', () => {
  it('parses <cite type="node" id="xxx">1</cite>', () => {
    const text = 'See <cite type="node" id="abc123">1</cite>.';
    const { placeholders } = extractInlineMarkup(text);

    expect(placeholders).toHaveLength(1);
    expect(placeholders[0]).toEqual({ kind: 'cite', id: 'abc123', content: '1', citeType: 'node' });
  });

  it('parses <cite type="chat" id="xxx">2</cite>', () => {
    const text = 'From <cite type="chat" id="session-abc">2</cite>.';
    const { placeholders } = extractInlineMarkup(text);

    expect(placeholders).toHaveLength(1);
    expect(placeholders[0]).toEqual({ kind: 'cite', id: 'session-abc', content: '2', citeType: 'chat' });
  });

  it('parses <cite type="url" id="https://example.com">3</cite>', () => {
    const text = 'Source <cite type="url" id="https://example.com/article">3</cite>.';
    const { placeholders } = extractInlineMarkup(text);

    expect(placeholders).toHaveLength(1);
    expect(placeholders[0]).toEqual({ kind: 'cite', id: 'https://example.com/article', content: '3', citeType: 'url' });
  });

  it('parses <cite id="xxx">1</cite> (no type) as node default', () => {
    const text = 'Note <cite id="node123">1</cite>.';
    const { placeholders } = extractInlineMarkup(text);

    expect(placeholders).toHaveLength(1);
    expect(placeholders[0]).toEqual({ kind: 'cite', id: 'node123', content: '1', citeType: 'node' });
  });

  it('handles mixed markup: ref + cite(node) + cite(chat) + node', () => {
    const text = [
      'See <ref id="r1">this note</ref> and check <cite type="node" id="n1">1</cite>.',
      '<node id="embed1" />',
      'Also <cite type="chat" id="s1">2</cite> and <cite type="url" id="https://x.com">3</cite>.',
    ].join('\n');

    const { placeholders } = extractInlineMarkup(text);

    expect(placeholders).toHaveLength(5);
    // pass 1: node embed
    expect(placeholders[0]).toEqual({ kind: 'node', nodeId: 'embed1' });
    // pass 2: ref
    expect(placeholders[1]).toEqual({ kind: 'ref', nodeId: 'r1', content: 'this note' });
    // pass 3: cites
    expect(placeholders[2]).toEqual({ kind: 'cite', id: 'n1', content: '1', citeType: 'node' });
    expect(placeholders[3]).toEqual({ kind: 'cite', id: 's1', content: '2', citeType: 'chat' });
    expect(placeholders[4]).toEqual({ kind: 'cite', id: 'https://x.com', content: '3', citeType: 'url' });
  });

  it('treats unknown cite type as node', () => {
    const text = 'See <cite type="unknown" id="x1">1</cite>.';
    const { placeholders } = extractInlineMarkup(text);

    expect(placeholders).toHaveLength(1);
    expect(placeholders[0]).toEqual({ kind: 'cite', id: 'x1', content: '1', citeType: 'node' });
  });
});

// ── Mentioned node tracking ──

describe('mentioned node tracking', () => {
  beforeEach(() => {
    clearMentionedNodes();
  });

  it('scans <ref>, <cite>, and <node /> from AI response without error', () => {
    const response = [
      'Found these: <ref id="r1">note</ref>',
      '<node id="n1" />',
      'Evidence <cite id="c1">1</cite>',
    ].join('\n');

    // Verify scanning itself doesn't throw (buildMentionedNodeEditReminder
    // requires loroDoc so edit-detection is an integration concern).
    expect(() => scanAndTrackMentionedNodes(response)).not.toThrow();
  });

  it('clearMentionedNodes resets tracking state', () => {
    scanAndTrackMentionedNodes('<ref id="x">test</ref>');
    clearMentionedNodes();
    expect(buildMentionedNodeEditReminder()).toBeNull();
  });
});

// ── NodeEmbed component ──

describe('NodeEmbed component', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('renders OutlinerView for an existing node', () => {
    // 'task_1' exists in seed data
    const html = renderToStaticMarkup(createElement(NodeEmbed, { nodeId: 'task_1' }));
    expect(html).toContain('chat-node-embed');
    expect(html).not.toContain('Node not found');
  });

  it('renders "Node not found" for a missing node', () => {
    const html = renderToStaticMarkup(createElement(NodeEmbed, { nodeId: 'nonexistent_id' }));
    expect(html).toContain('Node not found');
  });
});

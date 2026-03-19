import { extractInlineMarkup } from '../../src/components/chat/MarkdownRenderer.js';
import {
  scanAndTrackMentionedNodes,
  buildMentionedNodeEditReminder,
  clearMentionedNodes,
} from '../../src/lib/ai-mentioned-nodes.js';

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

    // node extracted first (pass 1), then ref and cite (pass 2)
    expect(placeholders).toHaveLength(3);
    expect(placeholders[0]).toEqual({ kind: 'node', nodeId: 'n1' });
    expect(placeholders[1]).toEqual({ kind: 'ref', nodeId: 'r1', content: 'this note' });
    expect(placeholders[2]).toEqual({ kind: 'cite', nodeId: 'c1', content: '1' });
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

  it('extracts <cite> tags as before', () => {
    const text = 'Source <cite id="xyz">1</cite>.';
    const { cleaned, placeholders } = extractInlineMarkup(text);

    expect(placeholders).toHaveLength(1);
    expect(placeholders[0]).toEqual({ kind: 'cite', nodeId: 'xyz', content: '1' });
    expect(cleaned).toContain('%%SOMA_0%%');
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

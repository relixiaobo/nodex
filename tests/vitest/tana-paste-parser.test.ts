import { describe, expect, it } from 'vitest';
import { parseTanaPaste } from '../../src/lib/ai-tools/tana-paste-parser.js';

describe('tana-paste-parser', () => {
  it('parses a simple node name', () => {
    const root = parseTanaPaste('hello');
    expect(root.name).toBe('hello');
    expect(root.children).toEqual([]);
  });

  it('parses tags from the headline', () => {
    const root = parseTanaPaste('task #todo #urgent');
    expect(root.name).toBe('task');
    expect(root.tags).toEqual(['todo', 'urgent']);
  });

  it('parses a single-value field on the root node', () => {
    const root = parseTanaPaste('Status:: Done');
    expect(root.name).toBe('');
    expect(root.fields).toHaveLength(1);
    expect(root.fields[0]).toMatchObject({
      name: 'Status',
      clear: false,
    });
    expect(root.fields[0]?.values[0]?.text).toBe('Done');
  });

  it('parses a multi-value field block', () => {
    const root = parseTanaPaste('Options::\n  - A\n  - B');
    expect(root.fields).toHaveLength(1);
    expect(root.fields[0]?.clear).toBe(false);
    expect(root.fields[0]?.values.map((value) => value.text)).toEqual(['A', 'B']);
  });

  it('keeps an empty field as a clear signal', () => {
    const root = parseTanaPaste('Status::');
    expect(root.fields).toHaveLength(1);
    expect(root.fields[0]).toMatchObject({
      name: 'Status',
      clear: true,
    });
    expect(root.fields[0]?.values).toEqual([]);
  });

  it('parses a standalone reference node', () => {
    const root = parseTanaPaste('[[Report^abc123]]');
    expect(root.targetId).toBe('abc123');
    expect(root.name).toBe('Report');
  });

  it('parses inline references inside content text', () => {
    const root = parseTanaPaste('Related to [[Topic^xyz]]');
    expect(root.name).toBe('Related to \uFFFC');
    expect(root.inlineRefs).toEqual([
      {
        offset: 11,
        targetNodeId: 'xyz',
        displayName: 'Topic',
      },
    ]);
  });

  it('parses checkbox-only lines', () => {
    expect(parseTanaPaste('[X]').checked).toBe(true);
    expect(parseTanaPaste('[ ]').checked).toBe(false);
  });

  it('parses hierarchy with nested child nodes', () => {
    const root = parseTanaPaste('Parent\n  Child1\n  Child2\n    Grandchild');
    expect(root.children.map((child) => child.name)).toEqual(['Child1', 'Child2']);
    expect(root.children[1]?.children[0]?.name).toBe('Grandchild');
  });

  it('treats unindented field lines after the first line as root metadata', () => {
    const root = parseTanaPaste('Meeting #meeting\nDate:: 2026-03-20\n  Action item 1\n  Action item 2');
    expect(root.name).toBe('Meeting');
    expect(root.tags).toEqual(['meeting']);
    expect(root.fields[0]?.name).toBe('Date');
    expect(root.fields[0]?.values[0]?.text).toBe('2026-03-20');
    expect(root.children.map((child) => child.name)).toEqual(['Action item 1', 'Action item 2']);
  });

  it('strips tana list bullet prefixes', () => {
    const root = parseTanaPaste('- node');
    expect(root.name).toBe('node');
  });

  it('parses tag-only root lines', () => {
    const root = parseTanaPaste('#nonexistent');
    expect(root.name).toBe('');
    expect(root.tags).toEqual(['nonexistent']);
  });
});

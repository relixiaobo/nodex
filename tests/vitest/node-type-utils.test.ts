import { beforeEach, describe, expect, it } from 'vitest';
import { isOutlinerContentNodeType, resolveEffectiveId } from '../../src/lib/node-type-utils.js';
import { createNode, initLoroDocForTest, resetLoroDoc, setNodeDataBatch } from '../../src/lib/loro-doc.js';
beforeEach(() => {
  resetLoroDoc();
  initLoroDocForTest('ws_default');
});

describe('isOutlinerContentNodeType', () => {
  it('treats regular content nodes as renderable', () => {
    expect(isOutlinerContentNodeType(undefined)).toBe(true);
  });

  it('treats reference nodes as renderable content', () => {
    expect(isOutlinerContentNodeType('reference')).toBe(true);
  });

  it('treats search nodes as renderable content', () => {
    expect(isOutlinerContentNodeType('search')).toBe(true);
  });

  it('treats codeBlock nodes as renderable content', () => {
    expect(isOutlinerContentNodeType('codeBlock')).toBe(true);
  });

  it('treats tagDef as renderable content (Schema container)', () => {
    expect(isOutlinerContentNodeType('tagDef')).toBe(true);
  });

  it('treats image nodes as renderable content', () => {
    expect(isOutlinerContentNodeType('image')).toBe(true);
  });

  it('treats embed nodes as renderable content', () => {
    expect(isOutlinerContentNodeType('embed')).toBe(true);
  });

  it('filters structural/internal nodes from content rows', () => {
    expect(isOutlinerContentNodeType('fieldEntry')).toBe(false);
    expect(isOutlinerContentNodeType('fieldDef')).toBe(false);
    expect(isOutlinerContentNodeType('queryCondition')).toBe(false);
  });
});

describe('resolveEffectiveId', () => {
  it('returns the target id for reference nodes in LoroDoc', () => {
    createNode('target_1', 'ws_default');
    setNodeDataBatch('target_1', { name: 'Target' });
    createNode('ref_1', 'ws_default');
    setNodeDataBatch('ref_1', { type: 'reference', targetId: 'target_1' });

    expect(resolveEffectiveId('ref_1')).toBe('target_1');
  });

  it('falls back to the original id for regular nodes or missing targets', () => {
    createNode('node_1', 'ws_default');
    setNodeDataBatch('node_1', { name: 'Regular' });

    expect(resolveEffectiveId('node_1')).toBe('node_1');
    expect(resolveEffectiveId('missing')).toBe('missing');
  });

  it('supports pure callers via a custom getNode callback', () => {
    const nodes = {
      ref_1: { type: 'reference' as const, targetId: 'target_1' },
      node_1: { type: undefined, targetId: undefined },
    };

    expect(resolveEffectiveId('ref_1', (id) => nodes[id as keyof typeof nodes] ?? null)).toBe('target_1');
    expect(resolveEffectiveId('node_1', (id) => nodes[id as keyof typeof nodes] ?? null)).toBe('node_1');
  });
});

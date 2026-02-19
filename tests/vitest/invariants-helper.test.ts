/**
 * LoroDoc structural invariants (Loro model).
 * collectNodeGraphErrors() reads from LoroDoc — no entity dict needed.
 * All operations must leave the graph in a consistent state.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { collectNodeGraphErrors } from './helpers/invariants.js';
import { resetAndSeed } from './helpers/test-state.js';
import { useNodeStore } from '../../src/stores/node-store.js';

describe('LoroDoc structural invariants', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('seeded graph has no structural errors', () => {
    expect(collectNodeGraphErrors()).toEqual([]);
  });

  it('after creating a child node, graph remains valid', () => {
    useNodeStore.getState().createChild('note_2', undefined, { name: 'New idea' });
    expect(collectNodeGraphErrors()).toEqual([]);
  });

  it('after trashing a node, graph remains valid', () => {
    useNodeStore.getState().trashNode('idea_1');
    expect(collectNodeGraphErrors()).toEqual([]);
  });

  it('after applyTag (creates fieldEntry nodes), graph remains valid', () => {
    useNodeStore.getState().applyTag('note_2', 'tagDef_task');
    expect(collectNodeGraphErrors()).toEqual([]);
  });

  it('after moveNodeTo, graph remains valid', () => {
    useNodeStore.getState().moveNodeTo('idea_1', 'proj_1');
    expect(collectNodeGraphErrors()).toEqual([]);
  });

  it('after setFieldValue, graph remains valid', () => {
    useNodeStore.getState().setFieldValue('task_1', 'attrDef_due', ['2026-03-01']);
    expect(collectNodeGraphErrors()).toEqual([]);
  });
});

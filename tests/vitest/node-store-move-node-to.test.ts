/**
 * node-store moveNodeTo — Loro model.
 * moveNodeTo(nodeId, newParentId, index?) — sync, no userId.
 * Uses note_2 (idea_1, idea_2) for simple reordering tests — no fieldEntries.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useNodeStore } from '../../src/stores/node-store.js';
import { collectNodeGraphErrors } from './helpers/invariants.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('moveNodeTo', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('blocks moving a node onto itself', () => {
    const beforeParent = loroDoc.getParentId('idea_1');
    useNodeStore.getState().moveNodeTo('idea_1', 'idea_1', 0);
    expect(loroDoc.getParentId('idea_1')).toBe(beforeParent);
    expect(collectNodeGraphErrors()).toEqual([]);
  });

  it('blocks moving a node onto its own descendant', () => {
    // proj_1 → task_1 → subtask_1a; try to move proj_1 under subtask_1a
    const beforeParent = loroDoc.getParentId('proj_1');
    useNodeStore.getState().moveNodeTo('proj_1', 'subtask_1a', 0);
    expect(loroDoc.getParentId('proj_1')).toBe(beforeParent);
    expect(collectNodeGraphErrors()).toEqual([]);
  });

  it('reorders within same parent (note_2: idea_1, idea_2)', () => {
    const before = loroDoc.getChildren('note_2');
    expect(before[0]).toBe('idea_1');
    expect(before[1]).toBe('idea_2');

    // Move idea_1 to index=2 in same parent → goes after idea_2
    useNodeStore.getState().moveNodeTo('idea_1', 'note_2', 2);

    const after = loroDoc.getChildren('note_2');
    expect(after[0]).toBe('idea_2');
    expect(after[1]).toBe('idea_1');
    expect(collectNodeGraphErrors()).toEqual([]);
  });

  it('moves node to a different parent', () => {
    const beforeNoteChildren = loroDoc.getChildren('note_2').slice();
    expect(beforeNoteChildren).toContain('idea_2');

    useNodeStore.getState().moveNodeTo('idea_2', 'proj_1', 0);

    expect(loroDoc.getChildren('note_2')).not.toContain('idea_2');
    expect(loroDoc.getChildren('proj_1')).toContain('idea_2');
    expect(loroDoc.getParentId('idea_2')).toBe('proj_1');
    expect(collectNodeGraphErrors()).toEqual([]);
  });

  it('appends to end when no index specified', () => {
    const beforeProjLen = loroDoc.getChildren('proj_1').length;
    useNodeStore.getState().moveNodeTo('idea_1', 'proj_1');
    const afterProjChildren = loroDoc.getChildren('proj_1');
    expect(afterProjChildren.length).toBe(beforeProjLen + 1);
    expect(afterProjChildren[afterProjChildren.length - 1]).toBe('idea_1');
    expect(collectNodeGraphErrors()).toEqual([]);
  });

  it('inserts at specified index in new parent', () => {
    useNodeStore.getState().moveNodeTo('idea_2', 'proj_1', 1);

    const projChildren = loroDoc.getChildren('proj_1');
    expect(projChildren[1]).toBe('idea_2');
    expect(collectNodeGraphErrors()).toEqual([]);
  });
});

describe('moveNodeUp / moveNodeDown', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('moveNodeDown moves node one position down in parent', () => {
    // note_2 children: [idea_1, idea_2]
    useNodeStore.getState().moveNodeDown('idea_1');
    const after = loroDoc.getChildren('note_2');
    expect(after[0]).toBe('idea_2');
    expect(after[1]).toBe('idea_1');
    expect(collectNodeGraphErrors()).toEqual([]);
  });

  it('moveNodeDown is no-op for last child', () => {
    const before = loroDoc.getChildren('note_2').slice();
    useNodeStore.getState().moveNodeDown('idea_2'); // already last
    expect(loroDoc.getChildren('note_2')).toEqual(before);
  });

  it('moveNodeUp moves node one position up in parent', () => {
    // note_2 children: [idea_1, idea_2]
    useNodeStore.getState().moveNodeUp('idea_2');
    const after = loroDoc.getChildren('note_2');
    expect(after[0]).toBe('idea_2');
    expect(after[1]).toBe('idea_1');
    expect(collectNodeGraphErrors()).toEqual([]);
  });

  it('moveNodeUp is no-op for first child', () => {
    const before = loroDoc.getChildren('note_2').slice();
    useNodeStore.getState().moveNodeUp('idea_1'); // already first
    expect(loroDoc.getChildren('note_2')).toEqual(before);
  });
});

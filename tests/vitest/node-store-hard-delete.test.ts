/**
 * node-store hardDeleteNode + emptyTrash — Loro model.
 * hardDeleteNode(id): permanently removes node + descendants from Loro tree.
 * emptyTrash(): permanently removes all nodes in TRASH.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useNodeStore } from '../../src/stores/node-store.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { CONTAINER_IDS } from '../../src/types/index.js';
import { collectNodeGraphErrors } from './helpers/invariants.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('hardDeleteNode', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('permanently removes a trashed node from Loro', () => {
    useNodeStore.getState().trashNode('idea_1');
    expect(loroDoc.hasNode('idea_1')).toBe(true);

    useNodeStore.getState().hardDeleteNode('idea_1');
    expect(loroDoc.hasNode('idea_1')).toBe(false);
    expect(loroDoc.getChildren(CONTAINER_IDS.TRASH)).not.toContain('idea_1');
  });

  it('recursively removes descendants', () => {
    // note_2 has children: idea_1, idea_2
    useNodeStore.getState().trashNode('note_2');
    expect(loroDoc.hasNode('idea_1')).toBe(true);
    expect(loroDoc.hasNode('idea_2')).toBe(true);

    useNodeStore.getState().hardDeleteNode('note_2');
    expect(loroDoc.hasNode('note_2')).toBe(false);
    expect(loroDoc.hasNode('idea_1')).toBe(false);
    expect(loroDoc.hasNode('idea_2')).toBe(false);
  });

  it('does nothing for nodes NOT in TRASH', () => {
    // idea_1 is in Library (under note_2), not in TRASH
    const beforeParent = loroDoc.getParentId('idea_1');
    useNodeStore.getState().hardDeleteNode('idea_1');
    // Node should still exist
    expect(loroDoc.hasNode('idea_1')).toBe(true);
    expect(loroDoc.getParentId('idea_1')).toBe(beforeParent);
  });

  it('does not delete container nodes even if somehow in TRASH', () => {
    // Container nodes (LIBRARY, INBOX, etc.) cannot be hard-deleted
    // This is a safety guard — TRASH itself is a container
    useNodeStore.getState().hardDeleteNode(CONTAINER_IDS.TRASH);
    expect(loroDoc.hasNode(CONTAINER_IDS.TRASH)).toBe(true);
  });

  it('graph is valid after hardDeleteNode', () => {
    useNodeStore.getState().trashNode('idea_1');
    useNodeStore.getState().hardDeleteNode('idea_1');
    expect(collectNodeGraphErrors()).toEqual([]);
  });

  it('reduces total node count', () => {
    const before = loroDoc.getAllNodeIds().length;
    useNodeStore.getState().trashNode('idea_1');
    useNodeStore.getState().hardDeleteNode('idea_1');
    const after = loroDoc.getAllNodeIds().length;
    expect(after).toBe(before - 1);
  });
});

describe('emptyTrash', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('removes all nodes from TRASH', () => {
    useNodeStore.getState().trashNode('idea_1');
    useNodeStore.getState().trashNode('idea_2');
    expect(loroDoc.getChildren(CONTAINER_IDS.TRASH).length).toBe(2);

    useNodeStore.getState().emptyTrash();
    expect(loroDoc.getChildren(CONTAINER_IDS.TRASH).length).toBe(0);
    expect(loroDoc.hasNode('idea_1')).toBe(false);
    expect(loroDoc.hasNode('idea_2')).toBe(false);
  });

  it('removes descendants of trashed nodes', () => {
    // note_2 has children: idea_1, idea_2
    useNodeStore.getState().trashNode('note_2');
    useNodeStore.getState().emptyTrash();
    expect(loroDoc.hasNode('note_2')).toBe(false);
    expect(loroDoc.hasNode('idea_1')).toBe(false);
    expect(loroDoc.hasNode('idea_2')).toBe(false);
  });

  it('does nothing when TRASH is empty', () => {
    const before = loroDoc.getAllNodeIds().length;
    useNodeStore.getState().emptyTrash();
    const after = loroDoc.getAllNodeIds().length;
    expect(after).toBe(before);
  });

  it('graph is valid after emptyTrash', () => {
    useNodeStore.getState().trashNode('idea_1');
    useNodeStore.getState().trashNode('note_1');
    useNodeStore.getState().emptyTrash();
    expect(collectNodeGraphErrors()).toEqual([]);
  });
});

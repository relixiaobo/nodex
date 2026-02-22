import { beforeEach, describe, expect, it } from 'vitest';
import {
  commitDoc,
  createNode,
  getAllNodeIds,
  initLoroDocForTest,
  resetLoroDoc,
  setNodeDataBatch,
  toNodexNode,
} from '../../src/lib/loro-doc.js';
import { ensureWorkspaceHomeNode, WORKSPACE_HOME_NAME } from '../../src/lib/workspace-root.js';

describe('ensureWorkspaceHomeNode', () => {
  beforeEach(() => {
    resetLoroDoc();
    initLoroDocForTest('ws_test');
  });

  it('creates workspace home node when missing', () => {
    const targetId = ensureWorkspaceHomeNode('ws_test');
    expect(targetId).toBe('ws_test');
    expect(getAllNodeIds()).toContain('ws_test');
    expect(toNodexNode('ws_test')?.name).toBe(WORKSPACE_HOME_NAME);
  });

  it('is idempotent when workspace node already exists', () => {
    createNode('ws_test', null);
    setNodeDataBatch('ws_test', { name: 'My Workspace' });
    commitDoc('__seed__');

    const before = getAllNodeIds().length;
    const targetId = ensureWorkspaceHomeNode('ws_test');
    const after = getAllNodeIds().length;

    expect(targetId).toBe('ws_test');
    expect(after).toBe(before);
    expect(toNodexNode('ws_test')?.name).toBe('My Workspace');
  });

  it('returns null for missing workspace id', () => {
    expect(ensureWorkspaceHomeNode(null)).toBeNull();
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { getNodeCapabilities, isWorkspaceHomeNode } from '../../src/lib/node-capabilities.js';
import { CONTAINER_IDS } from '../../src/types/index.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('node capabilities', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('treats current workspace root as a locked system node', () => {
    expect(isWorkspaceHomeNode('ws_default')).toBe(true);
    expect(getNodeCapabilities('ws_default')).toEqual({
      role: 'workspaceHome',
      canEditNode: true,
      canMove: false,
      canDelete: false,
    });
  });

  it('treats workspace containers as locked system nodes', () => {
    expect(getNodeCapabilities(CONTAINER_IDS.INBOX)).toEqual({
      role: 'container',
      canEditNode: false,
      canMove: false,
      canDelete: false,
    });
  });

  it('treats regular content nodes as editable/movable/deletable', () => {
    expect(isWorkspaceHomeNode('note_1')).toBe(false);
    expect(getNodeCapabilities('note_1')).toEqual({
      role: 'general',
      canEditNode: true,
      canMove: true,
      canDelete: true,
    });
  });
});

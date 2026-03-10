import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canCreateChildrenUnder,
  canEditFieldEntryValue,
  getNodeCapabilities,
  isLockedNode,
  isNodeInTrash,
  isWorkspaceHomeNode,
} from '../../src/lib/node-capabilities.js';
import { CONTAINER_IDS } from '../../src/types/index.js';
import { resetAndSeed } from './helpers/test-state.js';
import { SYSTEM_SCHEMA_NODE_IDS } from '../../src/lib/system-schema-presets.js';
import { ensureJournalTagDefs } from '../../src/lib/journal.js';
import { SYSTEM_TAGS } from '../../src/types/system-nodes.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { useNodeStore } from '../../src/stores/node-store.js';

describe('node capabilities', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('treats current workspace root as a locked system node', () => {
    expect(isWorkspaceHomeNode('ws_default')).toBe(true);
    expect(getNodeCapabilities('ws_default')).toEqual({
      role: 'workspaceHome',
      canEditNode: true,
      canEditStructure: true,
      canEditFieldValues: true,
      canMove: false,
      canDelete: false,
    });
  });

  it('lets Settings edit values but not structure', () => {
    expect(isLockedNode(CONTAINER_IDS.SETTINGS)).toBe(true);
    expect(getNodeCapabilities(CONTAINER_IDS.SETTINGS)).toEqual({
      role: 'system',
      canEditNode: false,
      canEditStructure: false,
      canEditFieldValues: true,
      canMove: false,
      canDelete: false,
    });
    expect(canCreateChildrenUnder(CONTAINER_IDS.SETTINGS)).toBe(false);
    expect(canEditFieldEntryValue(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_FIELD_ENTRY)).toBe(true);
  });

  it('lets Schema host definitions while staying identity-locked', () => {
    expect(getNodeCapabilities(CONTAINER_IDS.SCHEMA)).toEqual({
      role: 'system',
      canEditNode: false,
      canEditStructure: true,
      canEditFieldValues: false,
      canMove: false,
      canDelete: false,
    });
    expect(canCreateChildrenUnder(CONTAINER_IDS.SCHEMA)).toBe(true);
  });

  it('treats legacy Library/Inbox nodes as regular editable nodes', () => {
    expect(isLockedNode(CONTAINER_IDS.INBOX)).toBe(false);
    expect(getNodeCapabilities(CONTAINER_IDS.INBOX)).toEqual({
      role: 'general',
      canEditNode: true,
      canEditStructure: true,
      canEditFieldValues: true,
      canMove: true,
      canDelete: true,
    });
  });

  it('treats regular content nodes as editable/movable/deletable', () => {
    expect(isWorkspaceHomeNode('note_1')).toBe(false);
    expect(getNodeCapabilities('note_1')).toEqual({
      role: 'general',
      canEditNode: true,
      canEditStructure: true,
      canEditFieldValues: true,
      canMove: true,
      canDelete: true,
    });
  });

  it('treats journal system tagDefs as locked system nodes with editable schema config', () => {
    ensureJournalTagDefs();

    expect(isLockedNode(SYSTEM_TAGS.DAY)).toBe(true);
    expect(getNodeCapabilities(SYSTEM_TAGS.DAY)).toEqual({
      role: 'system',
      canEditNode: false,
      canEditStructure: true,
      canEditFieldValues: true,
      canMove: false,
      canDelete: false,
    });
  });

  it('detects direct and nested nodes inside Trash via parent-chain walk', () => {
    useNodeStore.getState().trashNode('task_1');

    expect(isNodeInTrash('task_1')).toBe(true);
    expect(isNodeInTrash('subtask_1a')).toBe(true);
    expect(isNodeInTrash('note_2')).toBe(false);
  });

  it('fails closed on parent cycles instead of looping forever', () => {
    const realGetParentId = loroDoc.getParentId;
    const cycleSpy = vi.spyOn(loroDoc, 'getParentId').mockImplementation((nodeId) => {
      if (nodeId === 'loop_a') return 'loop_b';
      if (nodeId === 'loop_b') return 'loop_a';
      return realGetParentId(nodeId);
    });

    expect(isNodeInTrash('loop_a')).toBe(false);

    cycleSpy.mockRestore();
  });
});

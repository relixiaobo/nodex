import { beforeEach, describe, expect, it } from 'vitest';
import {
  canCreateChildrenUnder,
  canEditFieldEntryValue,
  getNodeCapabilities,
  isLockedNode,
  isWorkspaceHomeNode,
} from '../../src/lib/node-capabilities.js';
import { CONTAINER_IDS } from '../../src/types/index.js';
import { resetAndSeed } from './helpers/test-state.js';
import { SYSTEM_SCHEMA_NODE_IDS } from '../../src/lib/system-schema-presets.js';
import { ensureJournalTagDefs } from '../../src/lib/journal.js';
import { SYSTEM_TAGS } from '../../src/types/system-nodes.js';

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
});

import { beforeEach, describe, expect, it } from 'vitest';
import { ensureContainers } from '../../src/lib/bootstrap-containers.js';
import { initLoroDocForTest, resetLoroDoc, getParentId, toNodexNode, hasNode } from '../../src/lib/loro-doc.js';
import { CONTAINER_IDS, NDX_F, NDX_T, SYS_V } from '../../src/types/index.js';
import { SYSTEM_SCHEMA_NODE_IDS } from '../../src/lib/system-schema-presets.js';

describe('ensureContainers', () => {
  beforeEach(() => {
    resetLoroDoc();
    initLoroDocForTest('ws_bootstrap');
  });

  it('bootstraps only Journal, Trash, Schema, and Settings as locked system nodes', () => {
    ensureContainers('ws_bootstrap');

    expect(hasNode(CONTAINER_IDS.JOURNAL)).toBe(true);
    expect(hasNode(CONTAINER_IDS.TRASH)).toBe(true);
    expect(hasNode(CONTAINER_IDS.SCHEMA)).toBe(true);
    expect(hasNode(CONTAINER_IDS.SETTINGS)).toBe(true);

    expect(hasNode(CONTAINER_IDS.LIBRARY)).toBe(false);
    expect(hasNode(CONTAINER_IDS.INBOX)).toBe(false);
    expect(hasNode(CONTAINER_IDS.SEARCHES)).toBe(false);

    for (const nodeId of [
      CONTAINER_IDS.JOURNAL,
      CONTAINER_IDS.TRASH,
      CONTAINER_IDS.SCHEMA,
      CONTAINER_IDS.SETTINGS,
    ]) {
      expect(getParentId(nodeId)).toBe('ws_bootstrap');
      expect(toNodexNode(nodeId)?.locked).toBe(true);
    }
  });

  it('bootstraps fixed Settings schema and default field value', () => {
    ensureContainers('ws_bootstrap');

    expect(getParentId(NDX_T.WORKSPACE_SETTINGS)).toBe(CONTAINER_IDS.SCHEMA);
    expect(toNodexNode(NDX_T.WORKSPACE_SETTINGS)?.locked).toBe(true);
    expect(getParentId(NDX_F.SETTING_HIGHLIGHT_ENABLED)).toBe(NDX_T.WORKSPACE_SETTINGS);
    expect(toNodexNode(NDX_F.SETTING_HIGHLIGHT_ENABLED)?.locked).toBe(true);
    expect(getParentId(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_FIELD_ENTRY)).toBe(CONTAINER_IDS.SETTINGS);
    expect(getParentId(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_VALUE)).toBe(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_FIELD_ENTRY);
    expect(toNodexNode(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_VALUE)?.name).toBe(SYS_V.YES);
  });
});

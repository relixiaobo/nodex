import { beforeEach, describe, expect, it } from 'vitest';
import { ensureSystemNodes, SYSTEM_BOOTSTRAP_VERSION } from '../../src/lib/bootstrap-system-nodes.js';
import {
  createNode,
  getChildren,
  getParentId,
  hasNode,
  initLoroDocForTest,
  resetLoroDoc,
  setNodeData,
  setNodeRichTextContent,
  toNodexNode,
} from '../../src/lib/loro-doc.js';
import { SYSTEM_NODE_IDS, NDX_F, NDX_T, SYS_T, SYS_V } from '../../src/types/index.js';
import { SYSTEM_SCHEMA_NODE_IDS } from '../../src/lib/system-schema-presets.js';
import { useNodeStore } from '../../src/stores/node-store.js';

describe('ensureSystemNodes', () => {
  beforeEach(() => {
    resetLoroDoc();
    initLoroDocForTest('ws_bootstrap');
  });

  it('bootstraps only Journal, Trash, Schema, and Settings as locked system nodes', () => {
    ensureSystemNodes('ws_bootstrap');

    expect(hasNode(SYSTEM_NODE_IDS.JOURNAL)).toBe(true);
    expect(hasNode(SYSTEM_NODE_IDS.TRASH)).toBe(true);
    expect(hasNode(SYSTEM_NODE_IDS.SCHEMA)).toBe(true);
    expect(hasNode(SYSTEM_NODE_IDS.SETTINGS)).toBe(true);

    expect(hasNode(SYSTEM_NODE_IDS.LIBRARY)).toBe(false);
    expect(hasNode(SYSTEM_NODE_IDS.INBOX)).toBe(false);
    expect(hasNode(SYSTEM_NODE_IDS.SEARCHES)).toBe(false);
    expect(hasNode(SYSTEM_NODE_IDS.AGENT)).toBe(true);

    for (const nodeId of [
      SYSTEM_NODE_IDS.JOURNAL,
      SYSTEM_NODE_IDS.TRASH,
      SYSTEM_NODE_IDS.SCHEMA,
      SYSTEM_NODE_IDS.SETTINGS,
    ]) {
      expect(getParentId(nodeId)).toBe('ws_bootstrap');
      expect(toNodexNode(nodeId)?.locked).toBe(true);
    }

    expect(getParentId(SYSTEM_NODE_IDS.AGENT)).toBe('ws_bootstrap');
    expect(toNodexNode(SYSTEM_NODE_IDS.AGENT)?.locked).toBeUndefined();
  });

  it('bootstraps fixed Settings schema and default field value', () => {
    ensureSystemNodes('ws_bootstrap');

    expect(getParentId(NDX_T.WORKSPACE_SETTINGS)).toBe(SYSTEM_NODE_IDS.SCHEMA);
    expect(toNodexNode(NDX_T.WORKSPACE_SETTINGS)?.locked).toBe(true);
    expect(getParentId(NDX_F.SETTING_HIGHLIGHT_ENABLED)).toBe(NDX_T.WORKSPACE_SETTINGS);
    expect(toNodexNode(NDX_F.SETTING_HIGHLIGHT_ENABLED)?.locked).toBe(true);
    expect(getParentId(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_FIELD_ENTRY)).toBe(SYSTEM_NODE_IDS.SETTINGS);
    expect(getParentId(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_VALUE)).toBe(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_FIELD_ENTRY);
    expect(toNodexNode(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_VALUE)?.name).toBe(SYS_V.YES);
  });

  it('records bootstrap version and runs legacy locked cleanup only once per workspace', () => {
    if (!hasNode('ws_bootstrap')) {
      createNode('ws_bootstrap', null);
      setNodeRichTextContent('ws_bootstrap', 'Workspace', [], []);
    }

    const createLegacyNode = (nodeId: string, name: string) => {
      if (!hasNode(nodeId)) {
        createNode(nodeId, 'ws_bootstrap');
        setNodeRichTextContent(nodeId, name, [], []);
      }
      setNodeData(nodeId, 'locked', true);
    };
    createLegacyNode(SYSTEM_NODE_IDS.LIBRARY, 'Library');
    createLegacyNode(SYSTEM_NODE_IDS.INBOX, 'Inbox');

    ensureSystemNodes('ws_bootstrap');

    expect(toNodexNode('ws_bootstrap')?.systemBootstrapVersion).toBe(SYSTEM_BOOTSTRAP_VERSION);
    expect(toNodexNode(SYSTEM_NODE_IDS.LIBRARY)?.locked).toBeUndefined();
    expect(toNodexNode(SYSTEM_NODE_IDS.INBOX)?.locked).toBeUndefined();

    // Re-introduce the stale flag; gated migration should no longer remove it.
    setNodeData(SYSTEM_NODE_IDS.LIBRARY, 'locked', true);
    ensureSystemNodes('ws_bootstrap');

    expect(toNodexNode(SYSTEM_NODE_IDS.LIBRARY)?.locked).toBe(true);
  });

  it('migrates legacy direct-child highlights into the clip Highlights field', () => {
    ensureSystemNodes('ws_bootstrap');

    const store = useNodeStore.getState();
    const clipNode = store.createChild('ws_bootstrap', undefined, { name: 'Legacy clip' });
    store.applyTag(clipNode.id, SYS_T.SOURCE);

    const legacyHighlight = store.createChild(clipNode.id, undefined, { name: 'Legacy highlight' });
    store.applyTag(legacyHighlight.id, SYS_T.HIGHLIGHT);
    expect(getParentId(legacyHighlight.id)).toBe(clipNode.id);

    setNodeData('ws_bootstrap', 'systemBootstrapVersion', SYSTEM_BOOTSTRAP_VERSION - 1);
    ensureSystemNodes('ws_bootstrap');

    const highlightsFieldEntryId = getChildren(clipNode.id).find((childId) => {
      const child = toNodexNode(childId);
      return child?.type === 'fieldEntry' && child.fieldDefId === NDX_F.SOURCE_HIGHLIGHTS;
    });

    expect(highlightsFieldEntryId).toBeDefined();
    expect(getParentId(legacyHighlight.id)).toBe(highlightsFieldEntryId);
  });
});

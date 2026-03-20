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
  setNodeDataBatch,
  setNodeRichTextContent,
  toNodexNode,
} from '../../src/lib/loro-doc.js';
import { SYSTEM_NODE_IDS, NDX_F, NDX_T, SYS_T, SYS_V } from '../../src/types/index.js';
import { SYSTEM_SCHEMA_NODE_IDS } from '../../src/lib/system-schema-presets.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { isOutlinerContentNodeType } from '../../src/lib/node-type-utils.js';
import { ensureSparkAgentNode, SETTINGS_AI_NODE_IDS, SKILL_NODE_IDS } from '../../src/lib/ai-agent-node.js';

describe('ensureSystemNodes', () => {
  beforeEach(() => {
    resetLoroDoc();
    initLoroDocForTest('ws_bootstrap');
  });

  it('bootstraps root system nodes while grouping AI settings under Settings', () => {
    ensureSystemNodes('ws_bootstrap');

    expect(hasNode(SYSTEM_NODE_IDS.JOURNAL)).toBe(true);
    expect(hasNode(SYSTEM_NODE_IDS.LIBRARY)).toBe(true);
    expect(hasNode(SYSTEM_NODE_IDS.TRASH)).toBe(true);
    expect(hasNode(SYSTEM_NODE_IDS.SCHEMA)).toBe(true);
    expect(hasNode(SYSTEM_NODE_IDS.SETTINGS)).toBe(true);

    expect(hasNode(SYSTEM_NODE_IDS.INBOX)).toBe(false);
    expect(hasNode(SYSTEM_NODE_IDS.SEARCHES)).toBe(false);
    expect(hasNode(SYSTEM_NODE_IDS.AGENT)).toBe(true);

    for (const nodeId of [SYSTEM_NODE_IDS.JOURNAL, SYSTEM_NODE_IDS.TRASH, SYSTEM_NODE_IDS.SCHEMA, SYSTEM_NODE_IDS.SETTINGS]) {
      expect(getParentId(nodeId)).toBe('ws_bootstrap');
      expect(toNodexNode(nodeId)?.locked).toBe(true);
    }
    expect(getParentId(SYSTEM_NODE_IDS.LIBRARY)).toBe('ws_bootstrap');
    expect(toNodexNode(SYSTEM_NODE_IDS.LIBRARY)?.locked).toBe(true);

    expect(getParentId(SETTINGS_AI_NODE_IDS.AI)).toBe(SYSTEM_NODE_IDS.SETTINGS);
    expect(toNodexNode(SETTINGS_AI_NODE_IDS.AI)?.locked).toBe(true);
    expect(getParentId(SETTINGS_AI_NODE_IDS.AGENTS)).toBe(SETTINGS_AI_NODE_IDS.AI);
    expect(toNodexNode(SETTINGS_AI_NODE_IDS.AGENTS)?.locked).toBe(true);
    expect(toNodexNode(SETTINGS_AI_NODE_IDS.AGENTS)?.type).toBe('search');
    expect(getParentId(SETTINGS_AI_NODE_IDS.SKILLS)).toBe(SETTINGS_AI_NODE_IDS.AI);
    expect(toNodexNode(SETTINGS_AI_NODE_IDS.SKILLS)?.locked).toBe(true);
    expect(toNodexNode(SETTINGS_AI_NODE_IDS.SKILLS)?.type).toBe('search');
    expect(getParentId(SYSTEM_NODE_IDS.AGENT)).toBe(SYSTEM_NODE_IDS.LIBRARY);
    expect(toNodexNode(SYSTEM_NODE_IDS.AGENT)?.locked).toBeUndefined();
    expect(getParentId(SKILL_NODE_IDS.SKILL_CREATOR)).toBe(SYSTEM_NODE_IDS.LIBRARY);
  });

  it('bootstraps fixed Settings schema and default provider config', () => {
    ensureSystemNodes('ws_bootstrap');

    expect(getParentId(NDX_T.WORKSPACE_SETTINGS)).toBe(SYSTEM_NODE_IDS.SCHEMA);
    expect(toNodexNode(NDX_T.WORKSPACE_SETTINGS)?.locked).toBe(true);
    expect(getParentId(NDX_T.AI_PROVIDER)).toBe(SYSTEM_NODE_IDS.SCHEMA);
    expect(getParentId(NDX_F.SETTING_HIGHLIGHT_ENABLED)).toBe(NDX_T.WORKSPACE_SETTINGS);
    expect(getParentId(NDX_F.SETTING_STARTUP_PAGE)).toBe(NDX_T.WORKSPACE_SETTINGS);
    expect(getParentId(NDX_F.SETTING_AI_PROVIDERS)).toBe(NDX_T.WORKSPACE_SETTINGS);
    expect(toNodexNode(NDX_F.SETTING_HIGHLIGHT_ENABLED)?.locked).toBe(true);
    expect(getParentId(NDX_F.PROVIDER_ID)).toBe(NDX_T.AI_PROVIDER);
    expect(getParentId(NDX_F.PROVIDER_ENABLED)).toBe(NDX_T.AI_PROVIDER);
    expect(getParentId(NDX_F.PROVIDER_API_KEY)).toBe(NDX_T.AI_PROVIDER);
    expect(getParentId(NDX_F.PROVIDER_BASE_URL)).toBe(NDX_T.AI_PROVIDER);
    expect(getParentId(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_FIELD_ENTRY)).toBe(SYSTEM_NODE_IDS.SETTINGS);
    expect(getParentId(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_VALUE)).toBe(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_FIELD_ENTRY);
    expect(toNodexNode(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_VALUE)?.name).toBe(SYS_V.YES);
    expect(getParentId(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_STARTUP_PAGE_FIELD_ENTRY)).toBe(SYSTEM_NODE_IDS.SETTINGS);
    expect(getParentId(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_STARTUP_PAGE_CHAT_OPTION)).toBe(NDX_F.SETTING_STARTUP_PAGE);
    expect(getParentId(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_STARTUP_PAGE_TODAY_OPTION)).toBe(NDX_F.SETTING_STARTUP_PAGE);
    expect(toNodexNode(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_STARTUP_PAGE_VALUE)?.targetId).toBe(
      SYSTEM_SCHEMA_NODE_IDS.SETTINGS_STARTUP_PAGE_CHAT_OPTION,
    );
    expect(getParentId(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_AI_PROVIDERS_FIELD_ENTRY)).toBe(SETTINGS_AI_NODE_IDS.AI);
    // Default Anthropic provider is no longer auto-created on bootstrap;
    // the providers field entry starts empty for new workspaces.
    expect(toNodexNode(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_AI_PROVIDERS_FIELD_ENTRY)?.children?.length ?? 0).toBe(0);
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
    createLegacyNode(SYSTEM_NODE_IDS.INBOX, 'Inbox');
    createLegacyNode(SYSTEM_NODE_IDS.SEARCHES, 'Searches');

    ensureSystemNodes('ws_bootstrap');

    expect(toNodexNode('ws_bootstrap')?.systemBootstrapVersion).toBe(SYSTEM_BOOTSTRAP_VERSION);
    expect(toNodexNode(SYSTEM_NODE_IDS.INBOX)?.locked).toBeUndefined();
    expect(toNodexNode(SYSTEM_NODE_IDS.SEARCHES)?.locked).toBeUndefined();

    // Re-introduce the stale flag; gated migration should no longer remove it.
    setNodeData(SYSTEM_NODE_IDS.INBOX, 'locked', true);
    ensureSystemNodes('ws_bootstrap');

    expect(toNodexNode(SYSTEM_NODE_IDS.INBOX)?.locked).toBe(true);
  });

  it('migrates legacy single-provider Settings fields into the default provider config', () => {
    createNode('ws_bootstrap', null);
    setNodeRichTextContent('ws_bootstrap', 'Workspace', [], []);
    createNode(SYSTEM_NODE_IDS.SETTINGS, 'ws_bootstrap');
    setNodeRichTextContent(SYSTEM_NODE_IDS.SETTINGS, 'Settings', [], []);
    createNode(SYSTEM_NODE_IDS.SCHEMA, 'ws_bootstrap');
    setNodeRichTextContent(SYSTEM_NODE_IDS.SCHEMA, 'Schema', [], []);

    createNode(SYSTEM_SCHEMA_NODE_IDS.LEGACY_SETTINGS_AI_API_KEY_FIELD_ENTRY, SYSTEM_NODE_IDS.SETTINGS);
    setNodeDataBatch(SYSTEM_SCHEMA_NODE_IDS.LEGACY_SETTINGS_AI_API_KEY_FIELD_ENTRY, {
      type: 'fieldEntry',
      fieldDefId: NDX_F.LEGACY_SETTING_AI_API_KEY,
    });
    createNode('legacy_ai_key_value', SYSTEM_SCHEMA_NODE_IDS.LEGACY_SETTINGS_AI_API_KEY_FIELD_ENTRY);
    setNodeRichTextContent('legacy_ai_key_value', 'sk-ant-legacy-123', [], []);

    ensureSystemNodes('ws_bootstrap');

    expect(hasNode(SYSTEM_SCHEMA_NODE_IDS.LEGACY_SETTINGS_AI_API_KEY_FIELD_ENTRY)).toBe(false);
    expect(getParentId(SYSTEM_SCHEMA_NODE_IDS.DEFAULT_AI_PROVIDER_NODE)).toBe(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_AI_PROVIDERS_FIELD_ENTRY);
    expect(toNodexNode(SYSTEM_SCHEMA_NODE_IDS.DEFAULT_AI_PROVIDER_ENABLED_VALUE)?.name).toBe(SYS_V.YES);
    expect(toNodexNode(SYSTEM_SCHEMA_NODE_IDS.DEFAULT_AI_PROVIDER_API_KEY_VALUE)?.name).toBe('sk-ant-legacy-123');
  });

  it('ensureAgentNode keeps built-in prompt out of node children on repeated calls', () => {
    ensureSystemNodes('ws_bootstrap');

    const contentChildrenBefore = getChildren(SYSTEM_NODE_IDS.AGENT)
      .filter((id) => {
        const n = toNodexNode(id);
        return n != null && isOutlinerContentNodeType(n.type);
      });
    expect(contentChildrenBefore.length).toBe(0);

    ensureSystemNodes('ws_bootstrap');

    const contentChildrenAfter = getChildren(SYSTEM_NODE_IDS.AGENT)
      .filter((id) => {
        const n = toNodexNode(id);
        return n != null && isOutlinerContentNodeType(n.type);
      });
    expect(contentChildrenAfter.length).toBe(contentChildrenBefore.length);
    expect(contentChildrenAfter).toEqual(contentChildrenBefore);
  });

  it('ensureSparkAgentNode keeps built-in prompt out of node children on repeated calls', () => {
    ensureSystemNodes('ws_bootstrap');
    ensureSparkAgentNode('ws_bootstrap');

    expect(getParentId(SYSTEM_NODE_IDS.SPARK_AGENT)).toBe(SYSTEM_NODE_IDS.LIBRARY);

    const contentChildrenBefore = getChildren(SYSTEM_NODE_IDS.SPARK_AGENT)
      .filter((id) => {
        const n = toNodexNode(id);
        return n != null && isOutlinerContentNodeType(n.type);
      });
    expect(contentChildrenBefore.length).toBe(0);

    ensureSparkAgentNode('ws_bootstrap');

    const contentChildrenAfter = getChildren(SYSTEM_NODE_IDS.SPARK_AGENT)
      .filter((id) => {
        const n = toNodexNode(id);
        return n != null && isOutlinerContentNodeType(n.type);
      });
    expect(contentChildrenAfter.length).toBe(contentChildrenBefore.length);
    expect(contentChildrenAfter).toEqual(contentChildrenBefore);
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

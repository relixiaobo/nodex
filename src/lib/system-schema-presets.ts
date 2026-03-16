import { getProviders } from '@mariozechner/pi-ai';
import { SYSTEM_NODE_IDS, FIELD_TYPES, NDX_F, NDX_T, SYS_T, SYS_V } from '../types/index.js';
import * as loroDoc from './loro-doc.js';

const PROVIDER_OPTION_ID_PREFIX = 'NDX_PROVIDER_OPT_';

export const SYSTEM_SCHEMA_NODE_IDS = {
  SETTINGS_HIGHLIGHT_FIELD_ENTRY: 'NDX_FE10',
  SETTINGS_HIGHLIGHT_VALUE: 'NDX_N10',
  LEGACY_SETTINGS_AI_PROVIDER_FIELD_ENTRY: 'NDX_FE11',
  LEGACY_SETTINGS_AI_PROVIDER_ANTHROPIC_OPTION: 'NDX_N11',
  LEGACY_SETTINGS_AI_PROVIDER_VALUE: 'NDX_N12',
  LEGACY_SETTINGS_AI_API_KEY_FIELD_ENTRY: 'NDX_FE12',
  SETTINGS_AI_PROVIDERS_FIELD_ENTRY: 'NDX_FE17',
  DEFAULT_AI_PROVIDER_NODE: 'NDX_N13',
  DEFAULT_AI_PROVIDER_PROVIDER_ID_FIELD_ENTRY: 'NDX_FE18',
  DEFAULT_AI_PROVIDER_PROVIDER_ID_VALUE: 'NDX_N14',
  DEFAULT_AI_PROVIDER_ENABLED_FIELD_ENTRY: 'NDX_FE19',
  DEFAULT_AI_PROVIDER_ENABLED_VALUE: 'NDX_N15',
  DEFAULT_AI_PROVIDER_API_KEY_FIELD_ENTRY: 'NDX_FE23',
  DEFAULT_AI_PROVIDER_API_KEY_VALUE: 'NDX_N16',
  DEFAULT_AI_PROVIDER_BASE_URL_FIELD_ENTRY: 'NDX_FE24',
  DEFAULT_AI_PROVIDER_BASE_URL_VALUE: 'NDX_N17',
} as const;

interface FixedSchemaNodePreset {
  id: string;
  parentId: string;
  name?: string;
  data?: Record<string, unknown>;
}

const SYSTEM_SCHEMA_NODE_PRESETS: ReadonlyArray<FixedSchemaNodePreset> = [
  {
    id: NDX_T.WORKSPACE_SETTINGS,
    parentId: SYSTEM_NODE_IDS.SCHEMA,
    name: 'Workspace settings',
    data: {
      type: 'tagDef',
      description: 'System schema for workspace-level settings',
      locked: true,
    },
  },
  {
    id: NDX_F.SETTING_HIGHLIGHT_ENABLED,
    parentId: NDX_T.WORKSPACE_SETTINGS,
    name: 'Highlight & Comment',
    data: {
      type: 'fieldDef',
      fieldType: FIELD_TYPES.BOOLEAN,
      description: 'Show floating toolbar when selecting text on web pages',
      locked: true,
      nullable: true,
      cardinality: 'single',
    },
  },
  {
    id: NDX_T.AI_PROVIDER,
    parentId: SYSTEM_NODE_IDS.SCHEMA,
    name: 'ai-provider',
    data: {
      type: 'tagDef',
      color: 'amber',
      description: 'AI provider credentials and routing settings',
      locked: true,
    },
  },
  {
    id: NDX_F.PROVIDER_ID,
    parentId: NDX_T.AI_PROVIDER,
    name: 'Provider ID',
    data: {
      type: 'fieldDef',
      fieldType: FIELD_TYPES.OPTIONS,
      description: 'Provider used for model routing',
      locked: true,
      nullable: false,
      cardinality: 'single',
    },
  },
  {
    id: NDX_F.PROVIDER_ENABLED,
    parentId: NDX_T.AI_PROVIDER,
    name: 'Enabled',
    data: {
      type: 'fieldDef',
      fieldType: FIELD_TYPES.BOOLEAN,
      description: 'Whether this provider is available in Chat',
      locked: true,
      nullable: true,
      cardinality: 'single',
    },
  },
  {
    id: NDX_F.PROVIDER_API_KEY,
    parentId: NDX_T.AI_PROVIDER,
    name: 'API Key',
    data: {
      type: 'fieldDef',
      fieldType: FIELD_TYPES.PASSWORD,
      description: 'API key used by the Worker proxy',
      locked: true,
      nullable: true,
      cardinality: 'single',
    },
  },
  {
    id: NDX_F.PROVIDER_BASE_URL,
    parentId: NDX_T.AI_PROVIDER,
    name: 'Base URL',
    data: {
      type: 'fieldDef',
      fieldType: FIELD_TYPES.PLAIN,
      description: 'Optional custom base URL for this provider',
      locked: true,
      nullable: true,
      cardinality: 'single',
    },
  },
  {
    id: NDX_F.SETTING_AI_PROVIDERS,
    parentId: NDX_T.WORKSPACE_SETTINGS,
    name: 'AI Providers',
    data: {
      type: 'fieldDef',
      fieldType: FIELD_TYPES.OPTIONS_FROM_SUPERTAG,
      sourceSupertag: NDX_T.AI_PROVIDER,
      childSupertag: NDX_T.AI_PROVIDER,
      description: 'Available AI providers for Chat and routing',
      locked: true,
      nullable: true,
      cardinality: 'list',
    },
  },
  {
    id: SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_FIELD_ENTRY,
    parentId: SYSTEM_NODE_IDS.SETTINGS,
    data: {
      type: 'fieldEntry',
      fieldDefId: NDX_F.SETTING_HIGHLIGHT_ENABLED,
    },
  },
  {
    id: SYSTEM_SCHEMA_NODE_IDS.SETTINGS_AI_PROVIDERS_FIELD_ENTRY,
    parentId: SYSTEM_NODE_IDS.SETTINGS,
    data: {
      type: 'fieldEntry',
      fieldDefId: NDX_F.SETTING_AI_PROVIDERS,
    },
  },
] as const;

function getProviderOptionNodeId(provider: string): string {
  return `${PROVIDER_OPTION_ID_PREFIX}${provider.replace(/[^a-z0-9]+/gi, '_').toUpperCase()}`;
}

function ensureNode({ id, parentId, name, data }: FixedSchemaNodePreset): void {
  if (!loroDoc.hasNode(id)) {
    loroDoc.createNode(id, parentId);
  } else if (loroDoc.getParentId(id) !== parentId) {
    loroDoc.moveNode(id, parentId);
  }

  const node = loroDoc.toNodexNode(id);
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    if ((node as Record<string, unknown> | null)?.[key] !== value) {
      patch[key] = value;
    }
  }

  if (name !== undefined && node?.name !== name) {
    loroDoc.setNodeRichTextContent(id, name, [], []);
  }
  if (Object.keys(patch).length > 0) {
    loroDoc.setNodeDataBatch(id, patch);
  }
}

function ensureTaggedNode(id: string, parentId: string, tagId: string, name: string): void {
  ensureNode({ id, parentId, name });
  if (!loroDoc.toNodexNode(id)?.tags.includes(tagId)) {
    loroDoc.addTag(id, tagId);
  }
}

function ensureFieldEntry(id: string, parentId: string, fieldDefId: string): void {
  ensureNode({
    id,
    parentId,
    data: {
      type: 'fieldEntry',
      fieldDefId,
    },
  });
}

function ensureTextValue(fieldEntryId: string, valueNodeId: string, value: string): void {
  if ((loroDoc.toNodexNode(fieldEntryId)?.children?.length ?? 0) > 0) return;
  ensureNode({
    id: valueNodeId,
    parentId: fieldEntryId,
    name: value,
  });
}

function ensureTargetValue(fieldEntryId: string, valueNodeId: string, targetId: string): void {
  if ((loroDoc.toNodexNode(fieldEntryId)?.children?.length ?? 0) > 0) return;
  ensureNode({
    id: valueNodeId,
    parentId: fieldEntryId,
    data: { targetId },
  });
}

function readLegacyApiKey(): string | null {
  const fieldEntry = loroDoc.toNodexNode(SYSTEM_SCHEMA_NODE_IDS.LEGACY_SETTINGS_AI_API_KEY_FIELD_ENTRY);
  const valueNodeId = fieldEntry?.children?.[0];
  const apiKey = valueNodeId ? loroDoc.toNodexNode(valueNodeId)?.name?.trim() : '';
  return apiKey ? apiKey : null;
}

function ensureProviderOptions(): void {
  for (const provider of getProviders()) {
    ensureNode({
      id: getProviderOptionNodeId(provider),
      parentId: NDX_F.PROVIDER_ID,
      name: provider,
    });
  }
}

function ensureDefaultAnthropicProvider(apiKey?: string | null): void {
  ensureTaggedNode(
    SYSTEM_SCHEMA_NODE_IDS.DEFAULT_AI_PROVIDER_NODE,
    SYSTEM_SCHEMA_NODE_IDS.SETTINGS_AI_PROVIDERS_FIELD_ENTRY,
    NDX_T.AI_PROVIDER,
    'Anthropic',
  );
  ensureFieldEntry(
    SYSTEM_SCHEMA_NODE_IDS.DEFAULT_AI_PROVIDER_PROVIDER_ID_FIELD_ENTRY,
    SYSTEM_SCHEMA_NODE_IDS.DEFAULT_AI_PROVIDER_NODE,
    NDX_F.PROVIDER_ID,
  );
  ensureTargetValue(
    SYSTEM_SCHEMA_NODE_IDS.DEFAULT_AI_PROVIDER_PROVIDER_ID_FIELD_ENTRY,
    SYSTEM_SCHEMA_NODE_IDS.DEFAULT_AI_PROVIDER_PROVIDER_ID_VALUE,
    getProviderOptionNodeId('anthropic'),
  );
  ensureFieldEntry(
    SYSTEM_SCHEMA_NODE_IDS.DEFAULT_AI_PROVIDER_ENABLED_FIELD_ENTRY,
    SYSTEM_SCHEMA_NODE_IDS.DEFAULT_AI_PROVIDER_NODE,
    NDX_F.PROVIDER_ENABLED,
  );
  ensureTextValue(
    SYSTEM_SCHEMA_NODE_IDS.DEFAULT_AI_PROVIDER_ENABLED_FIELD_ENTRY,
    SYSTEM_SCHEMA_NODE_IDS.DEFAULT_AI_PROVIDER_ENABLED_VALUE,
    apiKey ? SYS_V.YES : SYS_V.NO,
  );
  ensureFieldEntry(
    SYSTEM_SCHEMA_NODE_IDS.DEFAULT_AI_PROVIDER_API_KEY_FIELD_ENTRY,
    SYSTEM_SCHEMA_NODE_IDS.DEFAULT_AI_PROVIDER_NODE,
    NDX_F.PROVIDER_API_KEY,
  );
  if (apiKey) {
    ensureTextValue(
      SYSTEM_SCHEMA_NODE_IDS.DEFAULT_AI_PROVIDER_API_KEY_FIELD_ENTRY,
      SYSTEM_SCHEMA_NODE_IDS.DEFAULT_AI_PROVIDER_API_KEY_VALUE,
      apiKey,
    );
  }
  ensureFieldEntry(
    SYSTEM_SCHEMA_NODE_IDS.DEFAULT_AI_PROVIDER_BASE_URL_FIELD_ENTRY,
    SYSTEM_SCHEMA_NODE_IDS.DEFAULT_AI_PROVIDER_NODE,
    NDX_F.PROVIDER_BASE_URL,
  );
}

function cleanupLegacySettingsNodes(): void {
  if (loroDoc.hasNode(SYSTEM_SCHEMA_NODE_IDS.LEGACY_SETTINGS_AI_PROVIDER_FIELD_ENTRY)) {
    loroDoc.deleteNode(SYSTEM_SCHEMA_NODE_IDS.LEGACY_SETTINGS_AI_PROVIDER_FIELD_ENTRY);
  }
  if (loroDoc.hasNode(SYSTEM_SCHEMA_NODE_IDS.LEGACY_SETTINGS_AI_API_KEY_FIELD_ENTRY)) {
    loroDoc.deleteNode(SYSTEM_SCHEMA_NODE_IDS.LEGACY_SETTINGS_AI_API_KEY_FIELD_ENTRY);
  }
}

/**
 * Ensure the fixed system schema used by singleton workspace pages exists.
 *
 * These nodes intentionally use fixed IDs so concurrent bootstrap on multiple
 * peers converges on the same schema shape instead of creating duplicates.
 */
export function ensureSystemSchema(): void {
  for (const preset of SYSTEM_SCHEMA_NODE_PRESETS) {
    ensureNode(preset);
  }

  ensureProviderOptions();

  const highlightFieldEntry = loroDoc.toNodexNode(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_FIELD_ENTRY);
  if ((highlightFieldEntry?.children?.length ?? 0) === 0) {
    ensureTextValue(
      SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_FIELD_ENTRY,
      SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_VALUE,
      SYS_V.YES,
    );
  }

  const providerConfigsFieldEntry = loroDoc.toNodexNode(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_AI_PROVIDERS_FIELD_ENTRY);
  if ((providerConfigsFieldEntry?.children?.length ?? 0) === 0) {
    ensureDefaultAnthropicProvider(readLegacyApiKey());
  }

  cleanupLegacySettingsNodes();
}

import { CONTAINER_IDS, FIELD_TYPES, NDX_F, NDX_T, SYS_V } from '../types/index.js';
import * as loroDoc from './loro-doc.js';

export const SYSTEM_SCHEMA_NODE_IDS = {
  SETTINGS_HIGHLIGHT_FIELD_ENTRY: 'NDX_FE10',
  SETTINGS_HIGHLIGHT_VALUE: 'NDX_N10',
} as const;

interface FixedSchemaNodePreset {
  id: string;
  parentId: string;
  name?: string;
  data: Record<string, unknown>;
}

const SYSTEM_SCHEMA_NODE_PRESETS: ReadonlyArray<FixedSchemaNodePreset> = [
  {
    id: NDX_T.WORKSPACE_SETTINGS,
    parentId: CONTAINER_IDS.SCHEMA,
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
    id: SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_FIELD_ENTRY,
    parentId: CONTAINER_IDS.SETTINGS,
    data: {
      type: 'fieldEntry',
      fieldDefId: NDX_F.SETTING_HIGHLIGHT_ENABLED,
    },
  },
] as const;

function applyPresetNode(preset: FixedSchemaNodePreset): void {
  if (!loroDoc.hasNode(preset.id)) {
    loroDoc.createNode(preset.id, preset.parentId);
  } else if (loroDoc.getParentId(preset.id) !== preset.parentId) {
    loroDoc.moveNode(preset.id, preset.parentId);
  }

  const node = loroDoc.toNodexNode(preset.id);
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(preset.data)) {
    if ((node as Record<string, unknown> | null)?.[key] !== value) {
      patch[key] = value;
    }
  }

  const currentName = node?.name ?? '';
  if (preset.name !== undefined && currentName !== preset.name) {
    loroDoc.setNodeRichTextContent(preset.id, preset.name, [], []);
  } else if (preset.name === undefined && Object.keys(patch).length === 0) {
    return;
  }

  if (Object.keys(patch).length > 0) {
    loroDoc.setNodeDataBatch(preset.id, patch);
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
    applyPresetNode(preset);
  }

  const settingFieldEntry = loroDoc.toNodexNode(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_FIELD_ENTRY);
  if ((settingFieldEntry?.children?.length ?? 0) === 0) {
    if (!loroDoc.hasNode(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_VALUE)) {
      loroDoc.createNode(
        SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_VALUE,
        SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_FIELD_ENTRY,
      );
    } else if (loroDoc.getParentId(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_VALUE) !== SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_FIELD_ENTRY) {
      loroDoc.moveNode(
        SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_VALUE,
        SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_FIELD_ENTRY,
      );
    }
    if (loroDoc.toNodexNode(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_VALUE)?.name !== SYS_V.YES) {
      loroDoc.setNodeRichTextContent(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_VALUE, SYS_V.YES, [], []);
    }
  }
}

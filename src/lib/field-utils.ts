/**
 * Shared field utilities: data type resolution and icon mapping.
 *
 * Loro 迁移后：
 * - 所有 config 值从 NodexNode 直接属性读取（无 Tuple 间接层）
 * - entities 参数已移除，改用 loroDoc 全局访问
 */
import type { LucideIcon } from 'lucide-react';
import {
  AlignLeft, Building2, Calendar, CalendarCheck, CalendarClock, CalendarPlus,
  CheckSquare, ChevronDown, FileText, Hash, Link, List, ListTree, Mail,
  Play, Asterisk, EyeOff, Settings2, SquareUser, Sparkles, Tag, ToggleLeft, UserPen,
} from 'lucide-react';
import { SYS_A, SYS_D, SYS_V, FIELD_TYPES } from '../types/index.js';
import type { NodexNode } from '../types/index.js';
import * as loroDoc from './loro-doc.js';

// ─── resolveConfigValue（向后兼容：SYS_A* key → NodexNode 属性） ───

/** Mapping from SYS_A* config keys to flat NodexNode property names. */
const SYS_A_TO_PROP: Partial<Record<string, keyof NodexNode>> = {
  [SYS_A.SHOW_CHECKBOX]:     'showCheckbox',
  [SYS_A.CHILD_SUPERTAG]:    'childSupertag',
  [SYS_A.COLOR]:             'color',
  [SYS_A.EXTENDS]:           'extends',
  [SYS_A.DONE_STATE_MAPPING]:'doneStateEnabled',
  [SYS_A.TYPE_CHOICE]:       'fieldType',
  [SYS_A.NULLABLE]:          'nullable',
  [SYS_A.SOURCE_SUPERTAG]:   'sourceSupertag',
  [SYS_A.AUTO_INITIALIZE]:   'autoInitialize',
  [SYS_A.AUTOCOLLECT_OPTIONS]:'autocollectOptions',
  [SYS_A.HIDE_FIELD]:        'hideField',
  [SYS_A.MIN_VALUE]:         'minValue',
  [SYS_A.MAX_VALUE]:         'maxValue',
};

/**
 * Resolve a config value from a node by looking up its flat NodexNode property.
 * Converts boolean properties to SYS_V.YES / SYS_V.NO for backward compat.
 *
 * @deprecated In new code, read NodexNode properties directly.
 */
export function resolveConfigValue(
  node: NodexNode,
  configKey: string,
): string | undefined {
  const propName = SYS_A_TO_PROP[configKey];
  if (!propName) return undefined;
  const val = node[propName];
  if (val === undefined || val === null) return undefined;
  if (typeof val === 'boolean') return val ? SYS_V.YES : SYS_V.NO;
  return String(val);
}

/**
 * Check whether a node ID is a system config attrDef (SYS_A* or NDX_A*).
 */
export function isSystemConfigField(keyId: string): boolean {
  return keyId.startsWith('SYS_') || keyId.startsWith('NDX_');
}

/**
 * Resolve the data type of a fieldDef.
 * Returns a FIELD_TYPES string (e.g., 'plain', 'options').
 */
export function resolveDataType(fieldDefId: string): string {
  const fieldDef = loroDoc.toNodexNode(fieldDefId);
  if (!fieldDef) return FIELD_TYPES.PLAIN;
  return fieldDef.fieldType ?? FIELD_TYPES.PLAIN;
}

/**
 * Resolve the source supertag ID for an OPTIONS_FROM_SUPERTAG fieldDef.
 */
export function resolveSourceSupertag(
  fieldDefId: string,
): string | undefined {
  const fieldDef = loroDoc.toNodexNode(fieldDefId);
  return fieldDef?.sourceSupertag;
}

/**
 * Find all content nodes tagged with a given tagDefId.
 * Iterates all known node IDs and checks node.tags.
 */
export function resolveTaggedNodes(tagDefId: string): string[] {
  const result: string[] = [];
  for (const id of loroDoc.getAllNodeIds()) {
    const node = loroDoc.toNodexNode(id);
    if (!node || node.type) continue; // skip structural nodes
    if (node.tags.includes(tagDefId)) result.push(id);
  }
  return result;
}

/**
 * Resolve the hide-field condition from a fieldDef.
 * Returns the SYS_V constant (NEVER, WHEN_EMPTY, etc.) or the string value.
 */
export function resolveHideField(fieldDefId: string): string {
  const fieldDef = loroDoc.toNodexNode(fieldDefId);
  return fieldDef?.hideField ?? SYS_V.NEVER;
}

/**
 * Resolve whether a fieldDef field is marked as required (nullable = false).
 */
export function resolveRequired(fieldDefId: string): boolean {
  const fieldDef = loroDoc.toNodexNode(fieldDefId);
  // nullable=false means required=true (confusingly named legacy)
  return fieldDef?.nullable === false;
}

/** Resolve minimum value for Number/Integer fields. */
export function resolveMinValue(fieldDefId: string): number | undefined {
  const fieldDef = loroDoc.toNodexNode(fieldDefId);
  return fieldDef?.minValue;
}

/** Resolve maximum value for Number/Integer fields. */
export function resolveMaxValue(fieldDefId: string): number | undefined {
  const fieldDef = loroDoc.toNodexNode(fieldDefId);
  return fieldDef?.maxValue;
}

/**
 * Map a field type constant to a lucide icon component.
 */
export function getFieldTypeIcon(dataType: string): LucideIcon {
  switch (dataType) {
    case SYS_D.DATE:
    case FIELD_TYPES.DATE:
      return Calendar;
    case SYS_D.CHECKBOX:
    case FIELD_TYPES.CHECKBOX:
      return CheckSquare;
    case SYS_D.OPTIONS:
    case SYS_D.OPTIONS_ALT:
    case FIELD_TYPES.OPTIONS:
    case SYS_D.OPTIONS_FROM_SUPERTAG:
    case FIELD_TYPES.OPTIONS_FROM_SUPERTAG:
      return List;
    case SYS_D.NUMBER:
    case FIELD_TYPES.NUMBER:
    case SYS_D.INTEGER:
    case FIELD_TYPES.INTEGER:
      return Hash;
    case SYS_D.URL:
    case FIELD_TYPES.URL:
      return Link;
    case SYS_D.EMAIL:
    case FIELD_TYPES.EMAIL:
      return Mail;
    case SYS_D.BOOLEAN:
    case FIELD_TYPES.BOOLEAN:
      return ToggleLeft;
    default:
      return AlignLeft;
  }
}

/**
 * Resolve option node IDs for an OPTIONS-type fieldDef.
 * Options are direct non-fieldDef, non-fieldEntry children of the fieldDef node.
 */
export function resolveFieldOptions(fieldDefId: string): string[] {
  const children = loroDoc.getChildren(fieldDefId);
  return children.filter((cid) => {
    const child = loroDoc.toNodexNode(cid);
    return child && child.type !== 'fieldEntry' && child.type !== 'fieldDef';
  });
}

/**
 * Resolve auto-collected option node IDs for an OPTIONS-type fieldDef.
 * In the new model, autocollect options are stored directly as children.
 * Returns them when fieldDef.autocollectOptions is true.
 */
export function resolveAutoCollectedOptions(
  fieldDefId: string,
): string[] {
  const fieldDef = loroDoc.toNodexNode(fieldDefId);
  if (!fieldDef?.autocollectOptions) return [];
  // Auto-collected options are also in children (same pool as pre-defined options)
  return resolveFieldOptions(fieldDefId);
}

/**
 * Find the autocollect toggle for a fieldDef.
 * In the new model, just check fieldDef.autocollectOptions.
 * @deprecated In new code, read fieldDef.autocollectOptions directly.
 */
export function findAutoCollectTupleId(
  _fieldDefId: string,
): string | null {
  return null; // No longer stored as a Tuple
}

/**
 * Ordered list of field types for the type selector UI.
 * Matches Tana's dropdown order exactly.
 */
export const FIELD_TYPE_LIST: Array<{ value: string; label: string }> = [
  { value: FIELD_TYPES.PLAIN, label: 'Plain' },
  { value: FIELD_TYPES.OPTIONS, label: 'Options' },
  { value: FIELD_TYPES.OPTIONS_FROM_SUPERTAG, label: 'Options from supertag' },
  { value: FIELD_TYPES.DATE, label: 'Date' },
  { value: FIELD_TYPES.NUMBER, label: 'Number' },
  { value: FIELD_TYPES.URL, label: 'URL' },
  { value: FIELD_TYPES.EMAIL, label: 'Email' },
  { value: FIELD_TYPES.CHECKBOX, label: 'Checkbox' },
];

/** Get a human-readable label for a field type constant. */
export function getFieldTypeLabel(dataType: string): string {
  if (dataType === SYS_D.INTEGER || dataType === FIELD_TYPES.INTEGER) return 'Number';
  return FIELD_TYPE_LIST.find((t) => t.value === dataType)?.label ?? 'Plain';
}

/** Check if a data type is "plain" (uses outliner for values). */
export function isPlainFieldType(dataType: string): boolean {
  return dataType === FIELD_TYPES.PLAIN || dataType === SYS_D.PLAIN || !dataType;
}

// ─── AttrDef / FieldDef config field registry ───

export interface ConfigFieldDef {
  key: string;
  name: string;
  control: 'type_choice' | 'toggle' | 'select' | 'outliner' | 'autocollect' | 'tag_picker' | 'color_picker' | 'number_input' | 'done_map_entries';
  defaultValue: string;
  appliesTo: string[] | '*';
  icon?: LucideIcon;
  description?: string;
  options?: Array<{ value: string; label: string }>;
  /** Conditional visibility: only show when another config field has a specific value */
  visibleWhen?: { dependsOn: string; value: string };
}

/**
 * Registry of config fields for fieldDef nodes.
 * Order matches Tana's config page layout.
 */
export const ATTRDEF_CONFIG_FIELDS: ConfigFieldDef[] = [
  {
    key: SYS_A.TYPE_CHOICE,
    name: 'Field type',
    control: 'type_choice',
    icon: Settings2,
    defaultValue: FIELD_TYPES.PLAIN,
    appliesTo: '*',
  },
  {
    key: 'NDX_SECTION_PRE_OPTIONS',
    name: 'Pre-determined options',
    control: 'outliner',
    icon: ListTree,
    defaultValue: '',
    appliesTo: [FIELD_TYPES.OPTIONS],
    description: 'Each node included will become an option',
  },
  {
    key: SYS_A.SOURCE_SUPERTAG,
    name: 'Supertag',
    control: 'tag_picker',
    icon: Tag,
    defaultValue: '',
    appliesTo: [FIELD_TYPES.OPTIONS_FROM_SUPERTAG],
    description: 'Nodes tagged with this supertag become options',
  },
  {
    key: SYS_A.AUTOCOLLECT_OPTIONS,
    name: 'Auto-collect values',
    control: 'autocollect',
    icon: Sparkles,
    defaultValue: SYS_V.YES,
    appliesTo: [FIELD_TYPES.OPTIONS],
    description: 'Values created from field input',
  },
  {
    key: SYS_A.AUTO_INITIALIZE,
    name: 'Auto-initialize',
    control: 'toggle',
    icon: Play,
    defaultValue: SYS_V.NO,
    appliesTo: '*',
    description: 'to value from ancestor with this field',
  },
  {
    key: SYS_A.NULLABLE,
    name: 'Required',
    control: 'toggle',
    icon: Asterisk,
    defaultValue: SYS_V.NO,
    appliesTo: '*',
  },
  {
    key: SYS_A.HIDE_FIELD,
    name: 'Hide field',
    control: 'select',
    icon: EyeOff,
    defaultValue: SYS_V.NEVER,
    appliesTo: '*',
    description: 'Minimize field when part of a supertag',
    options: [
      { value: SYS_V.NEVER, label: 'Never' },
      { value: SYS_V.WHEN_EMPTY, label: 'When empty' },
      { value: SYS_V.WHEN_NOT_EMPTY, label: 'When not empty' },
      { value: SYS_V.WHEN_VALUE_IS_DEFAULT, label: 'When value is default' },
      { value: SYS_V.ALWAYS, label: 'Always' },
    ],
  },
  {
    key: SYS_A.MIN_VALUE,
    name: 'Minimum value',
    control: 'number_input',
    icon: Hash,
    defaultValue: '',
    appliesTo: [FIELD_TYPES.NUMBER, FIELD_TYPES.INTEGER],
    description: 'Warn when value is below this number',
  },
  {
    key: SYS_A.MAX_VALUE,
    name: 'Maximum value',
    control: 'number_input',
    icon: Hash,
    defaultValue: '',
    appliesTo: [FIELD_TYPES.NUMBER, FIELD_TYPES.INTEGER],
    description: 'Warn when value exceeds this number',
  },
];

/** O(1) lookup by config field key. Excludes outliner entries. */
export const ATTRDEF_CONFIG_MAP = new Map(
  ATTRDEF_CONFIG_FIELDS
    .filter(f => f.control !== 'outliner')
    .map(f => [f.key, f]),
);

/** Outliner-type config fields (virtual entries — no backing tuple). */
export const ATTRDEF_OUTLINER_FIELDS = ATTRDEF_CONFIG_FIELDS.filter(f => f.control === 'outliner');

// ─── TagDef (SYS_T01) config field registry ───

/**
 * Registry of config fields for tagDef nodes.
 */
export const TAGDEF_CONFIG_FIELDS: ConfigFieldDef[] = [
  {
    key: SYS_A.COLOR,
    name: 'Color',
    control: 'color_picker',
    icon: undefined,
    defaultValue: '',
    appliesTo: '*',
  },
  {
    key: SYS_A.EXTENDS,
    name: 'Extend from',
    control: 'tag_picker',
    icon: ListTree,
    defaultValue: '',
    appliesTo: '*',
    description: 'Inherit fields and content from another tag',
  },
  {
    key: SYS_A.SHOW_CHECKBOX,
    name: 'Show as checkbox',
    control: 'toggle',
    icon: CheckSquare,
    defaultValue: SYS_V.NO,
    appliesTo: '*',
    description: 'Show done/not done checkbox on tagged nodes',
  },
  {
    key: SYS_A.DONE_STATE_MAPPING,
    name: 'Done state mapping',
    control: 'toggle',
    icon: CheckSquare,
    defaultValue: SYS_V.NO,
    appliesTo: '*',
    description: 'Map checkbox done state to Options field values',
    visibleWhen: { dependsOn: SYS_A.SHOW_CHECKBOX, value: SYS_V.YES },
  },
  {
    key: SYS_A.DONE_MAP_CHECKED,
    name: 'Map checked to',
    control: 'done_map_entries',
    icon: CheckSquare,
    defaultValue: '',
    appliesTo: '*',
    description: 'Field+option pairs that mean "done"',
    visibleWhen: { dependsOn: SYS_A.DONE_STATE_MAPPING, value: SYS_V.YES },
  },
  {
    key: SYS_A.DONE_MAP_UNCHECKED,
    name: 'Map unchecked to',
    control: 'done_map_entries',
    icon: CheckSquare,
    defaultValue: '',
    appliesTo: '*',
    description: 'Field+option pairs that mean "not done"',
    visibleWhen: { dependsOn: SYS_A.DONE_STATE_MAPPING, value: SYS_V.YES },
  },
  {
    key: 'NDX_SECTION_DEFAULT_CONTENT',
    name: 'Default content',
    control: 'outliner',
    icon: FileText,
    defaultValue: '',
    appliesTo: '*',
  },
  {
    key: SYS_A.CHILD_SUPERTAG,
    name: 'Default child supertag',
    control: 'tag_picker',
    icon: ChevronDown,
    defaultValue: '',
    appliesTo: '*',
    description: 'Auto-apply this tag to new children',
  },
];

/** O(1) lookup by config field key. Excludes outliner entries. */
export const TAGDEF_CONFIG_MAP = new Map(
  TAGDEF_CONFIG_FIELDS
    .filter(f => f.control !== 'outliner')
    .map(f => [f.key, f]),
);

/** Outliner-type config fields for tagDef (virtual entries — no backing tuple). */
export const TAGDEF_OUTLINER_FIELDS = TAGDEF_CONFIG_FIELDS.filter(f => f.control === 'outliner');

/**
 * Resolve default child supertag IDs for a parent node.
 * Walks the parent's tags and reads tagDef.childSupertag from each tagDef.
 */
export function resolveChildSupertags(parentId: string): string[] {
  const parent = loroDoc.toNodexNode(parentId);
  if (!parent?.tags.length) return [];

  const result: string[] = [];
  for (const tagDefId of parent.tags) {
    const tagDef = loroDoc.toNodexNode(tagDefId);
    if (!tagDef?.childSupertag) continue;
    if (!loroDoc.hasNode(tagDef.childSupertag)) continue;
    if (!result.includes(tagDef.childSupertag)) {
      result.push(tagDef.childSupertag);
    }
  }
  return result;
}

// ─── Extend chain resolution ───

/**
 * Walk the Extend chain for a tagDef and return ancestor tagDef IDs
 * in ancestor-first order. Does not include self. Handles circular refs.
 */
export function getExtendsChain(tagDefId: string): string[] {
  const chain: string[] = [];
  const visited = new Set<string>();

  function walk(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const tagDef = loroDoc.toNodexNode(id);
    if (!tagDef?.extends) return;
    const parentId = tagDef.extends;
    if (parentId === tagDefId) return; // exclude self (circular)
    if (!loroDoc.hasNode(parentId)) return;

    walk(parentId); // recurse ancestors first
    if (!chain.includes(parentId)) chain.push(parentId);
  }
  walk(tagDefId);
  return chain;
}

// ─── System Fields (read-only, auto-derived from node metadata) ───

export interface SystemFieldDef {
  key: string;
  name: string;
  source: string;
  dataType: '__system_date__' | '__system_text__' | '__system_node__';
  icon: LucideIcon;
}

/** 8 system fields available for Nodex. */
export const SYSTEM_FIELDS: SystemFieldDef[] = [
  { key: 'NDX_SYS_DESCRIPTION', name: 'Node description', source: 'description', dataType: '__system_text__', icon: FileText },
  { key: 'NDX_SYS_CREATED', name: 'Created time', source: 'createdAt', dataType: '__system_date__', icon: CalendarPlus },
  { key: 'NDX_SYS_LAST_EDITED', name: 'Last edited time', source: 'updatedAt', dataType: '__system_date__', icon: CalendarClock },
  { key: 'NDX_SYS_LAST_EDITED_BY', name: 'Last edited by', source: 'updatedBy', dataType: '__system_text__', icon: UserPen },
  { key: 'NDX_SYS_OWNER', name: 'Owner node', source: 'parentId', dataType: '__system_node__', icon: SquareUser },
  { key: 'NDX_SYS_TAGS', name: 'Tags', source: 'tags', dataType: '__system_text__', icon: Tag },
  { key: 'NDX_SYS_WORKSPACE', name: 'Workspace', source: 'workspace', dataType: '__system_text__', icon: Building2 },
  { key: 'NDX_SYS_DONE_TIME', name: 'Done time', source: 'completedAt', dataType: '__system_date__', icon: CalendarCheck },
];

/** O(1) lookup by system field key. */
export const SYSTEM_FIELD_MAP = new Map(SYSTEM_FIELDS.map(f => [f.key, f]));

/** Entries shaped for useWorkspaceFields autocomplete list. */
export const SYSTEM_FIELD_ENTRIES: Array<{ id: string; name: string; dataType: string }> =
  SYSTEM_FIELDS.map(f => ({ id: f.key, name: f.name, dataType: f.dataType }));

const systemDateFormatter = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** Format a millisecond timestamp to human-readable date string. */
export function formatTimestamp(ms: number | undefined): string {
  if (!ms) return '';
  return systemDateFormatter.format(new Date(ms));
}

/**
 * Resolve the display value for a system field on a given node.
 */
export function resolveSystemFieldValue(
  nodeId: string,
  sysDef: SystemFieldDef,
): { text: string; refNodeId?: string } {
  const node = loroDoc.toNodexNode(nodeId);
  if (!node) return { text: '' };

  switch (sysDef.source) {
    case 'description':
      return { text: node.description ?? '' };
    case 'createdAt':
      return { text: formatTimestamp(node.createdAt) };
    case 'updatedAt':
      return { text: formatTimestamp(node.updatedAt) };
    case 'updatedBy':
      return { text: '' }; // Phase 2: Loro PeerID
    case 'parentId': {
      const parentId = loroDoc.getParentId(nodeId);
      if (!parentId) return { text: '' };
      const parentNode = loroDoc.toNodexNode(parentId);
      return { text: parentNode?.name ?? parentId, refNodeId: parentId };
    }
    case 'tags': {
      const tagNames: string[] = [];
      for (const tagDefId of node.tags) {
        const tagDef = loroDoc.toNodexNode(tagDefId);
        if (tagDef?.name) tagNames.push(tagDef.name);
      }
      return { text: tagNames.join(', ') };
    }
    case 'workspace':
      return { text: 'workspace' }; // Phase 2: workspace ID from LoroDoc peer
    case 'completedAt':
      return { text: formatTimestamp(node.completedAt) };
    default:
      return { text: '' };
  }
}

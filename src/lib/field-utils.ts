/**
 * Shared field utilities: data type resolution and icon mapping.
 */
import type { LucideIcon } from 'lucide-react';
import { AlignLeft, Building2, Calendar, CalendarCheck, CalendarClock, CalendarPlus, CheckSquare, ChevronDown, FileText, Hash, Link, List, ListTree, Mail, Play, Asterisk, EyeOff, Settings2, SquareUser, Sparkles, Tag, ToggleLeft, UserPen } from 'lucide-react';
import { SYS_A, SYS_D, SYS_V } from '../types/index.js';
import type { NodexNode } from '../types/index.js';

/**
 * Resolve a config value from an attrDef by walking its children
 * for a Tuple [configKey, value].
 */
function resolveAttrDefConfig(entities: Record<string, NodexNode>, attrDefId: string, configKey: string): string | undefined {
  const attrDef = entities[attrDefId];
  if (!attrDef?.children) return undefined;

  for (const childId of attrDef.children) {
    const child = entities[childId];
    if (
      child?.props._docType === 'tuple' &&
      child.children?.[0] === configKey &&
      child.children.length >= 2
    ) {
      return child.children[1];
    }
  }
  return undefined;
}

/**
 * Resolve a config/field value from a node by walking its children for a Tuple [configKey, ...].
 * Reads directly from Tuple.children[1].
 */
export function resolveConfigValue(
  entities: Record<string, NodexNode>,
  node: NodexNode,
  configKey: string,
): string | undefined {
  if (!node.children) return undefined;
  for (const childId of node.children) {
    const child = entities[childId];
    if (child?.props._docType === 'tuple' && child.children?.[0] === configKey) {
      if (child.children.length >= 2) return child.children[1];
      return undefined;
    }
  }
  return undefined;
}

/**
 * Check whether a node ID is a system config attrDef (SYS_A* or NDX_A*).
 */
export function isSystemConfigField(keyId: string): boolean {
  return keyId.startsWith('SYS_') || keyId.startsWith('NDX_');
}

/**
 * Resolve the data type of an attrDef by walking its children
 * for a Tuple [SYS_A02, SYS_D*].
 */
export function resolveDataType(entities: Record<string, NodexNode>, attrDefId: string): string {
  const attrDef = entities[attrDefId];
  if (!attrDef) return SYS_D.PLAIN;
  return resolveConfigValue(entities, attrDef, SYS_A.TYPE_CHOICE) ?? SYS_D.PLAIN;
}

/**
 * Resolve the source supertag ID for an OPTIONS_FROM_SUPERTAG attrDef.
 * Reads the Tuple [SYS_A06, tagDefId] from attrDef children.
 */
export function resolveSourceSupertag(
  entities: Record<string, NodexNode>, attrDefId: string
): string | undefined {
  const attrDef = entities[attrDefId];
  if (!attrDef) return undefined;
  return resolveConfigValue(entities, attrDef, SYS_A.SOURCE_SUPERTAG);
}

/**
 * Find all content nodes tagged with a given tagDefId.
 * Walks every entity → node.meta tuples looking for [SYS_A13, tagDefId].
 */
export function resolveTaggedNodes(
  entities: Record<string, NodexNode>, tagDefId: string
): string[] {
  const result: string[] = [];
  for (const [id, node] of Object.entries(entities)) {
    if (node.props._docType) continue;
    if (!node.meta || node.meta.length === 0) continue;
    for (const cid of node.meta) {
      const tuple = entities[cid];
      if (
        tuple?.props._docType === 'tuple' &&
        tuple.children?.[0] === SYS_A.NODE_SUPERTAGS &&
        tuple.children[1] === tagDefId
      ) {
        result.push(id);
        break;
      }
    }
  }
  return result;
}

/**
 * Resolve the hide-field condition from an attrDef.
 * Returns the SYS_V constant (NEVER, WHEN_EMPTY, WHEN_NOT_EMPTY, WHEN_VALUE_IS_DEFAULT, ALWAYS).
 */
export function resolveHideField(entities: Record<string, NodexNode>, attrDefId: string): string {
  const attrDef = entities[attrDefId];
  if (!attrDef) return SYS_V.NEVER;
  return resolveConfigValue(entities, attrDef, SYS_A.HIDE_FIELD) ?? SYS_V.NEVER;
}

/**
 * Resolve whether an attrDef field is marked as required.
 */
export function resolveRequired(entities: Record<string, NodexNode>, attrDefId: string): boolean {
  const attrDef = entities[attrDefId];
  if (!attrDef) return false;
  return resolveConfigValue(entities, attrDef, SYS_A.NULLABLE) === SYS_V.YES;
}

/** Resolve minimum value for Number/Integer fields. Returns number or undefined. */
export function resolveMinValue(entities: Record<string, NodexNode>, attrDefId: string): number | undefined {
  const attrDef = entities[attrDefId];
  if (!attrDef) return undefined;
  const v = resolveConfigValue(entities, attrDef, SYS_A.MIN_VALUE);
  if (v && !isNaN(Number(v))) return Number(v);
  return undefined;
}

/** Resolve maximum value for Number/Integer fields. Returns number or undefined. */
export function resolveMaxValue(entities: Record<string, NodexNode>, attrDefId: string): number | undefined {
  const attrDef = entities[attrDefId];
  if (!attrDef) return undefined;
  const v = resolveConfigValue(entities, attrDef, SYS_A.MAX_VALUE);
  if (v && !isNaN(Number(v))) return Number(v);
  return undefined;
}

/**
 * Map a SYS_D data type constant to a lucide icon component.
 */
export function getFieldTypeIcon(dataType: string): LucideIcon {
  switch (dataType) {
    case SYS_D.DATE:
      return Calendar;
    case SYS_D.CHECKBOX:
      return CheckSquare;
    case SYS_D.OPTIONS:
    case SYS_D.OPTIONS_FROM_SUPERTAG:
      return List;
    case SYS_D.NUMBER:
    case SYS_D.INTEGER:
      return Hash;
    case SYS_D.URL:
      return Link;
    case SYS_D.EMAIL:
      return Mail;
    case SYS_D.BOOLEAN:
      return ToggleLeft;
    default:
      return AlignLeft;
  }
}

/**
 * Resolve option node IDs for an OPTIONS-type attrDef.
 * Options are direct non-tuple children of the attrDef node.
 */
export function resolveFieldOptions(
  entities: Record<string, NodexNode>,
  attrDefId: string,
): string[] {
  const attrDef = entities[attrDefId];
  if (!attrDef?.children) return [];

  return attrDef.children.filter((cid) => {
    const child = entities[cid];
    return child && child.props._docType !== 'tuple';
  });
}

/**
 * Resolve auto-collected option node IDs for an OPTIONS-type attrDef.
 * Auto-collected values are stored as children[2+] of the autocollect Tuple
 * (children[0] = SYS_A44 key, children[1] = toggle value, children[2+] = collected IDs).
 * Returns IDs only when the toggle is ON (SYS_V.YES).
 */
export function resolveAutoCollectedOptions(
  entities: Record<string, NodexNode>,
  attrDefId: string,
): string[] {
  const attrDef = entities[attrDefId];
  if (!attrDef?.children) return [];

  for (const cid of attrDef.children) {
    const child = entities[cid];
    if (
      child?.props._docType === 'tuple' &&
      child.children?.[0] === SYS_A.AUTOCOLLECT_OPTIONS
    ) {
      const isEnabled = child.children[1] === SYS_V.YES;
      if (!isEnabled || child.children.length <= 2) return [];
      return child.children.slice(2);
    }
  }
  return [];
}

/**
 * Find the autocollect Tuple ID for an attrDef.
 */
export function findAutoCollectTupleId(
  entities: Record<string, NodexNode>,
  attrDefId: string,
): string | null {
  const attrDef = entities[attrDefId];
  if (!attrDef?.children) return null;

  for (const cid of attrDef.children) {
    const child = entities[cid];
    if (
      child?.props._docType === 'tuple' &&
      child.children?.[0] === SYS_A.AUTOCOLLECT_OPTIONS
    ) {
      return cid;
    }
  }
  return null;
}

/**
 * Ordered list of field types for the type selector UI.
 * Matches Tana's dropdown order exactly (no Integer — Tana only shows Number).
 */
export const FIELD_TYPE_LIST: Array<{ value: string; label: string }> = [
  { value: SYS_D.PLAIN, label: 'Plain' },
  { value: SYS_D.OPTIONS, label: 'Options' },
  { value: SYS_D.OPTIONS_FROM_SUPERTAG, label: 'Options from supertag' },
  { value: SYS_D.DATE, label: 'Date' },
  { value: SYS_D.NUMBER, label: 'Number' },
  { value: SYS_D.URL, label: 'URL' },
  { value: SYS_D.EMAIL, label: 'Email' },
  { value: SYS_D.CHECKBOX, label: 'Checkbox' },
];

/** Get a human-readable label for a SYS_D data type constant. */
export function getFieldTypeLabel(dataType: string): string {
  if (dataType === SYS_D.INTEGER) return 'Number'; // INTEGER maps to Number in UI
  return FIELD_TYPE_LIST.find((t) => t.value === dataType)?.label ?? 'Plain';
}

/** Check if a data type is "plain" (uses outliner for values). */
export function isPlainFieldType(dataType: string): boolean {
  return dataType === SYS_D.PLAIN || !dataType;
}

// ─── AttrDef config field registry ───

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
 * Registry of config fields for attrDef nodes.
 * Maps to SYS_T02 (FIELD_DEFINITION) template tuples.
 * Order matches Tana's config page layout.
 *
 * control types:
 * - type_choice: Field type dropdown picker
 * - toggle: Boolean switch (Yes/No)
 * - select: Dropdown with predefined options
 * - section_label: Label + description rendered between FieldList and OutlinerView (no tuple)
 */
export const ATTRDEF_CONFIG_FIELDS: ConfigFieldDef[] = [
  {
    key: SYS_A.TYPE_CHOICE,
    name: 'Field type',
    control: 'type_choice',
    icon: Settings2,
    defaultValue: SYS_D.PLAIN,
    appliesTo: '*',
  },
  // outliner fields — rendered as field rows with embedded outliner
  {
    key: 'NDX_SECTION_PRE_OPTIONS',
    name: 'Pre-determined options',
    control: 'outliner',
    icon: ListTree,
    defaultValue: '',
    appliesTo: [SYS_D.OPTIONS],
    description: 'Each node included will become an option',
  },
  {
    key: SYS_A.SOURCE_SUPERTAG,
    name: 'Supertag',
    control: 'tag_picker',
    icon: Tag,
    defaultValue: '',
    appliesTo: [SYS_D.OPTIONS_FROM_SUPERTAG],
    description: 'Nodes tagged with this supertag become options',
  },
  // tuple-based config fields
  {
    key: SYS_A.AUTOCOLLECT_OPTIONS,
    name: 'Auto-collect values',
    control: 'autocollect',
    icon: Sparkles,
    defaultValue: SYS_V.YES,
    appliesTo: [SYS_D.OPTIONS],
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
    appliesTo: [SYS_D.NUMBER, SYS_D.INTEGER],
    description: 'Warn when value is below this number',
  },
  {
    key: SYS_A.MAX_VALUE,
    name: 'Maximum value',
    control: 'number_input',
    icon: Hash,
    defaultValue: '',
    appliesTo: [SYS_D.NUMBER, SYS_D.INTEGER],
    description: 'Warn when value exceeds this number',
  },
];

/** O(1) lookup by config field key (SYS_A* or NDX_A*). Excludes outliner entries (no backing tuple). */
export const ATTRDEF_CONFIG_MAP = new Map(
  ATTRDEF_CONFIG_FIELDS
    .filter(f => f.control !== 'outliner')
    .map(f => [f.key, f]),
);

/** Outliner-type config fields (virtual entries — no backing tuple). */
export const ATTRDEF_OUTLINER_FIELDS = ATTRDEF_CONFIG_FIELDS
  .filter(f => f.control === 'outliner');

// ─── TagDef (SYS_T01) config field registry ───

/**
 * Registry of config fields for tagDef nodes.
 * Maps to SYS_T01 (SUPERTAG) template tuples.
 * Mirrors ATTRDEF_CONFIG_FIELDS pattern.
 */
export const TAGDEF_CONFIG_FIELDS: ConfigFieldDef[] = [
  {
    key: SYS_A.COLOR,           // SYS_A11
    name: 'Color',
    control: 'color_picker',
    icon: undefined,
    defaultValue: '',
    appliesTo: '*',
  },
  {
    key: SYS_A.EXTENDS,           // NDX_A05
    name: 'Extend from',
    control: 'tag_picker',
    icon: ListTree,
    defaultValue: '',
    appliesTo: '*',
    description: 'Inherit fields and content from another tag',
  },
  {
    key: SYS_A.SHOW_CHECKBOX,   // SYS_A55
    name: 'Show as checkbox',
    control: 'toggle',
    icon: CheckSquare,
    defaultValue: SYS_V.NO,
    appliesTo: '*',
    description: 'Show done/not done checkbox on tagged nodes',
  },
  {
    key: SYS_A.DONE_STATE_MAPPING,  // NDX_A06
    name: 'Done state mapping',
    control: 'toggle',
    icon: CheckSquare,
    defaultValue: SYS_V.NO,
    appliesTo: '*',
    description: 'Map checkbox done state to Options field values',
    visibleWhen: { dependsOn: SYS_A.SHOW_CHECKBOX, value: SYS_V.YES },
  },
  {
    key: SYS_A.DONE_MAP_CHECKED,   // NDX_A07
    name: 'Map checked to',
    control: 'done_map_entries',
    icon: CheckSquare,
    defaultValue: '',
    appliesTo: '*',
    description: 'Field+option pairs that mean "done"',
    visibleWhen: { dependsOn: SYS_A.DONE_STATE_MAPPING, value: SYS_V.YES },
  },
  {
    key: SYS_A.DONE_MAP_UNCHECKED, // NDX_A08
    name: 'Map unchecked to',
    control: 'done_map_entries',
    icon: CheckSquare,
    defaultValue: '',
    appliesTo: '*',
    description: 'Field+option pairs that mean "not done"',
    visibleWhen: { dependsOn: SYS_A.DONE_STATE_MAPPING, value: SYS_V.YES },
  },
  // outliner field — rendered as field row with embedded outliner (template children)
  {
    key: 'NDX_SECTION_DEFAULT_CONTENT',
    name: 'Default content',
    control: 'outliner',
    icon: FileText,
    defaultValue: '',
    appliesTo: '*',
  },
  {
    key: SYS_A.CHILD_SUPERTAG,  // SYS_A14
    name: 'Default child supertag',
    control: 'tag_picker',
    icon: ChevronDown,
    defaultValue: '',
    appliesTo: '*',
    description: 'Auto-apply this tag to new children',
  },
];

/** O(1) lookup by config field key (SYS_A*). Excludes outliner entries. */
export const TAGDEF_CONFIG_MAP = new Map(
  TAGDEF_CONFIG_FIELDS
    .filter(f => f.control !== 'outliner')
    .map(f => [f.key, f]),
);

/** Outliner-type config fields for tagDef (virtual entries — no backing tuple). */
export const TAGDEF_OUTLINER_FIELDS = TAGDEF_CONFIG_FIELDS
  .filter(f => f.control === 'outliner');

/**
 * Resolve default child supertag IDs for a parent node.
 * Walks the parent's tags (node.meta → SYS_A13 tuples) and reads SYS_A14 from each tagDef.
 * Returns deduplicated tagDef IDs that should be auto-applied to new children.
 */
export function resolveChildSupertags(
  entities: Record<string, NodexNode>,
  parentId: string,
): string[] {
  const parent = entities[parentId];
  if (!parent?.meta || parent.meta.length === 0) return [];

  const result: string[] = [];
  for (const cid of parent.meta) {
    const tuple = entities[cid];
    if (
      tuple?.props._docType === 'tuple' &&
      tuple.children?.[0] === SYS_A.NODE_SUPERTAGS &&
      tuple.children[1]
    ) {
      const tagDefId = tuple.children[1];
      const tagDef = entities[tagDefId];
      if (!tagDef) continue;
      const childTagId = resolveConfigValue(entities, tagDef, SYS_A.CHILD_SUPERTAG);
      if (childTagId && entities[childTagId] && !result.includes(childTagId)) {
        result.push(childTagId);
      }
    }
  }
  return result;
}

// ─── Extend chain resolution (synchronous, for immer context) ───

/**
 * Walk the Extend chain for a tagDef and return ancestor tagDef IDs
 * in ancestor-first order (grandparent before parent). Does not include self.
 * Handles circular references via visited set.
 *
 * Reads from tagDef.children (config tuple) — this is the source of truth
 * that the config field UI edits via setConfigValue.
 */
export function getExtendsChain(
  entities: Record<string, NodexNode>,
  tagDefId: string,
): string[] {
  const chain: string[] = [];
  const visited = new Set<string>();

  function walk(id: string) {
    if (visited.has(id)) return; // circular guard
    visited.add(id);
    const tagDef = entities[id];
    if (!tagDef) return;

    const parentId = resolveConfigValue(entities, tagDef, SYS_A.EXTENDS);
    if (!parentId) return;
    if (parentId === tagDefId) return; // exclude self (circular)
    if (!entities[parentId]) return; // skip invalid

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

/** 8 system fields available for Nodex. Key = NDX_SYS_* stored in tuple children[0]. */
export const SYSTEM_FIELDS: SystemFieldDef[] = [
  { key: 'NDX_SYS_DESCRIPTION', name: 'Node description', source: 'props.description', dataType: '__system_text__', icon: FileText },
  { key: 'NDX_SYS_CREATED', name: 'Created time', source: 'props.created', dataType: '__system_date__', icon: CalendarPlus },
  { key: 'NDX_SYS_LAST_EDITED', name: 'Last edited time', source: 'updatedAt', dataType: '__system_date__', icon: CalendarClock },
  { key: 'NDX_SYS_LAST_EDITED_BY', name: 'Last edited by', source: 'updatedBy', dataType: '__system_text__', icon: UserPen },
  { key: 'NDX_SYS_OWNER', name: 'Owner node', source: 'props._ownerId', dataType: '__system_node__', icon: SquareUser },
  { key: 'NDX_SYS_TAGS', name: 'Tags', source: 'meta', dataType: '__system_text__', icon: Tag },
  { key: 'NDX_SYS_WORKSPACE', name: 'Workspace', source: 'workspaceId', dataType: '__system_text__', icon: Building2 },
  { key: 'NDX_SYS_DONE_TIME', name: 'Done time', source: 'props._done', dataType: '__system_date__', icon: CalendarCheck },
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
 * Returns { text, refNodeId? } where refNodeId is set for __system_node__ types.
 */
export function resolveSystemFieldValue(
  entities: Record<string, NodexNode>,
  nodeId: string,
  sysDef: SystemFieldDef,
): { text: string; refNodeId?: string } {
  const node = entities[nodeId];
  if (!node) return { text: '' };

  switch (sysDef.source) {
    case 'props.description':
      return { text: node.props.description ?? '' };
    case 'props.created':
      return { text: formatTimestamp(node.props.created) };
    case 'updatedAt':
      return { text: formatTimestamp(node.updatedAt) };
    case 'updatedBy':
      return { text: node.updatedBy ?? '' };
    case 'props._ownerId': {
      const ownerId = node.props._ownerId;
      if (!ownerId) return { text: '' };
      const ownerNode = entities[ownerId];
      return { text: ownerNode?.props.name ?? ownerId, refNodeId: ownerId };
    }
    case 'meta': {
      if (!node.meta || node.meta.length === 0) return { text: '' };
      const tagNames: string[] = [];
      for (const cid of node.meta) {
        const tuple = entities[cid];
        if (tuple?.props._docType === 'tuple' && tuple.children?.[0] === SYS_A.NODE_SUPERTAGS && tuple.children[1]) {
          const tagDef = entities[tuple.children[1]];
          if (tagDef?.props.name) tagNames.push(tagDef.props.name);
        }
      }
      return { text: tagNames.join(', ') };
    }
    case 'workspaceId': {
      const wsId = node.workspaceId;
      const wsNode = entities[wsId];
      return { text: wsNode?.props.name ?? wsId };
    }
    case 'props._done': {
      const done = node.props._done;
      return { text: done ? formatTimestamp(done) : '' };
    }
    default:
      return { text: '' };
  }
}

/**
 * Shared field utilities: data type resolution and icon mapping.
 */
import type { LucideIcon } from 'lucide-react';
import { AlignLeft, Calendar, CheckSquare, ChevronDown, Hash, Link, List, Mail, Play, Asterisk, EyeOff, Settings2, Sparkles } from 'lucide-react';
import { SYS_A, SYS_D, SYS_V } from '../types/index.js';
import type { NodexNode } from '../types/index.js';

/**
 * Resolve the data type of an attrDef by walking its children
 * for a Tuple [SYS_A02, SYS_D*].
 */
export function resolveDataType(entities: Record<string, NodexNode>, attrDefId: string): string {
  const attrDef = entities[attrDefId];
  if (!attrDef?.children) return SYS_D.PLAIN;

  for (const childId of attrDef.children) {
    const child = entities[childId];
    if (
      child?.props._docType === 'tuple' &&
      child.children?.[0] === SYS_A.TYPE_CHOICE &&
      child.children.length >= 2
    ) {
      return child.children[1];
    }
  }
  return SYS_D.PLAIN;
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
  control: 'type_choice' | 'toggle' | 'select' | 'section_label';
  defaultValue: string;
  appliesTo: string[] | '*';
  icon?: LucideIcon;
  description?: string;
  options?: Array<{ value: string; label: string }>;
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
  // section labels — rendered by NodePanel between FieldList and OutlinerView
  {
    key: 'NDX_SECTION_PRE_OPTIONS',
    name: 'Pre-determined options',
    control: 'section_label',
    defaultValue: '',
    appliesTo: [SYS_D.OPTIONS],
    description: 'Each node above will become an option',
  },
  {
    key: 'NDX_SECTION_SOURCES',
    name: 'Sources of options',
    control: 'section_label',
    defaultValue: '',
    appliesTo: [SYS_D.OPTIONS],
    description: 'List of references and search nodes, whose children will become options',
  },
  // tuple-based config fields
  {
    key: SYS_A.AUTOCOLLECT_OPTIONS,
    name: 'Auto-collect values',
    control: 'toggle',
    icon: Sparkles,
    defaultValue: SYS_V.YES,
    appliesTo: [SYS_D.OPTIONS],
    description: 'Include auto-collected values as options',
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
];

/** O(1) lookup by config field key (SYS_A* or NDX_A*). Excludes section_label entries. */
export const ATTRDEF_CONFIG_MAP = new Map(
  ATTRDEF_CONFIG_FIELDS
    .filter(f => f.control !== 'section_label')
    .map(f => [f.key, f]),
);

/** Section label entries for NodePanel rendering. */
export const ATTRDEF_SECTION_LABELS = ATTRDEF_CONFIG_FIELDS
  .filter(f => f.control === 'section_label');

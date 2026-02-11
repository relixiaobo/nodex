/**
 * Shared field utilities: data type resolution and icon mapping.
 */
import type { LucideIcon } from 'lucide-react';
import { AlignLeft, Calendar, CheckSquare, Hash, Link, List, Mail } from 'lucide-react';
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

/** Ordered list of field types for the type selector UI. */
export const FIELD_TYPE_LIST: Array<{ value: string; label: string }> = [
  { value: SYS_D.PLAIN, label: 'Plain' },
  { value: SYS_D.OPTIONS, label: 'Options' },
  { value: SYS_D.DATE, label: 'Date' },
  { value: SYS_D.NUMBER, label: 'Number' },
  { value: SYS_D.INTEGER, label: 'Integer' },
  { value: SYS_D.CHECKBOX, label: 'Checkbox' },
  { value: SYS_D.URL, label: 'URL' },
  { value: SYS_D.EMAIL, label: 'Email' },
];

/** Get a human-readable label for a SYS_D data type constant. */
export function getFieldTypeLabel(dataType: string): string {
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
  control: 'toggle' | 'select';
  defaultValue: string;
  appliesTo: string[] | '*';
  description?: string;
  options?: Array<{ value: string; label: string }>;
}

export const ATTRDEF_CONFIG_FIELDS: ConfigFieldDef[] = [
  {
    key: SYS_A.AUTOCOLLECT_OPTIONS,
    name: 'Auto-collect values',
    control: 'toggle',
    defaultValue: SYS_V.YES,
    appliesTo: [SYS_D.OPTIONS],
    description: 'Include auto-collected values as options',
  },
  {
    key: SYS_A.NULLABLE,
    name: 'Required',
    control: 'toggle',
    defaultValue: SYS_V.NO,
    appliesTo: '*',
  },
  {
    key: SYS_A.HIDE_FIELD,
    name: 'Hide field',
    control: 'select',
    defaultValue: SYS_V.NEVER,
    appliesTo: '*',
    description: 'Minimize field when part of a supertag',
    options: [
      { value: SYS_V.NEVER, label: 'Never' },
      { value: SYS_V.ALWAYS, label: 'Always' },
      { value: SYS_V.WHEN_EMPTY, label: 'When empty' },
    ],
  },
];

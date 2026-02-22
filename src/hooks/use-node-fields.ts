/**
 * Derive field entries for a content node from LoroDoc.
 * Walks node.children to find fieldEntry nodes,
 * resolves names, values, and data types from their fieldDef.
 *
 * Uses JSON.stringify as the Zustand selector return (primitive = stable reference)
 * to avoid React 19 infinite re-render loops with useSyncExternalStore.
 */
import { useMemo } from 'react';
import { useNodeStore } from '../stores/node-store';
import {
  resolveDataType, resolveHideField, resolveRequired, resolveConfigValue,
  isSystemConfigField, ATTRDEF_CONFIG_MAP, ATTRDEF_CONFIG_FIELDS,
  TAGDEF_CONFIG_MAP, TAGDEF_CONFIG_FIELDS,
  SYSTEM_FIELD_MAP, resolveSystemFieldValue, type ConfigFieldDef,
} from '../lib/field-utils.js';
import type { NodexNode } from '../types/index.js';
import { CONTAINER_IDS, SYS_D, FIELD_TYPES } from '../types/index.js';
import * as loroDoc from '../lib/loro-doc.js';

export interface FieldEntry {
  fieldDefId: string;
  attrDefName: string;
  fieldEntryId: string;
  valueNodeId?: string;
  valueName?: string;
  dataType: string;
  /** True when the fieldDef has been trashed (moved to Trash container) */
  trashed?: boolean;
  /** Hide-field condition from fieldDef config */
  hideMode?: string;
  /** True when the field has no meaningful value (for hide-when-empty evaluation) */
  isEmpty?: boolean;
  /** True when the fieldDef config marks this field as required */
  isRequired?: boolean;
  /** True when this is a system config field (SYS_A*, NDX_A*) — read-only name */
  isSystemConfig?: boolean;
  /** Config field metadata key for looking up icon/description in FieldRow */
  configKey?: string;
  /** Explicit control type for system config rendering */
  configControl?: ConfigFieldDef['control'];
  /** For tag-template entries, references the source fieldDef id */
  templateId?: string;
}

/** Check if a visibleWhen condition is satisfied by looking at node config values. */
function isVisibleWhenSatisfied(
  condition: NonNullable<ConfigFieldDef['visibleWhen']>,
  node: NodexNode,
): boolean {
  const val = resolveConfigValue(node, condition.dependsOn);
  return val === condition.value;
}

export function computeNodeFields(
  getNode: (id: string) => NodexNode | null,
  getChildren: (id: string) => NodexNode[],
  nodeId: string,
): FieldEntry[] {
  const node = getNode(nodeId);
  if (!node?.children) return [];

  const isFieldDef = node.type === 'fieldDef';
  const isTagDef = node.type === 'tagDef';

  const fields: FieldEntry[] = [];

  for (const child of getChildren(nodeId)) {
    if (child.type !== 'fieldEntry' || !child.fieldDefId) continue;

    const keyId = child.fieldDefId;

    // System fields: read-only, auto-derived from node metadata
    const sysDef = SYSTEM_FIELD_MAP.get(keyId);
    if (sysDef) {
      const resolved = resolveSystemFieldValue(nodeId, sysDef);
      fields.push({
        fieldDefId: keyId,
        attrDefName: sysDef.name,
        fieldEntryId: child.id,
        valueName: resolved.text,
        valueNodeId: resolved.refNodeId,
        dataType: sysDef.dataType,
      });
      continue;
    }

    const fieldDef = getNode(keyId);
    if (!fieldDef || fieldDef.type !== 'fieldDef') continue;

    const isSysConfig = isSystemConfigField(keyId);
    const configDef = isSysConfig ? (ATTRDEF_CONFIG_MAP.get(keyId) ?? TAGDEF_CONFIG_MAP.get(keyId)) : undefined;

    if (configDef) {
      if (configDef.visibleWhen && !isVisibleWhenSatisfied(configDef.visibleWhen, node)) {
        continue;
      }
      if (isFieldDef && configDef.appliesTo !== '*') {
        const currentType = resolveDataType(nodeId);
        if (!configDef.appliesTo.includes(currentType)) continue;
      }
    }

    const valueChildren = getChildren(child.id);
    const valueNodeId = valueChildren[0]?.id;
    const valueNode = valueNodeId ? getNode(valueNodeId) : undefined;
    const valueName = (() => {
      if (!valueNode) return undefined;
      if (valueNode.targetId) {
        const targetNode = getNode(valueNode.targetId);
        if (targetNode?.name) return targetNode.name;
      }
      return valueNode.name;
    })();

    const trashed = !isSysConfig && (loroDoc.getParentId(keyId) === CONTAINER_IDS.TRASH);
    const hasContent = valueChildren.length > 0;

    fields.push({
      fieldDefId: keyId,
      attrDefName: fieldDef.name ?? 'Untitled',
      fieldEntryId: child.id,
      valueNodeId,
      valueName,
      dataType: resolveDataType(keyId),
      trashed,
      hideMode: isSysConfig ? undefined : resolveHideField(keyId),
      isEmpty: !hasContent,
      isRequired: isSysConfig ? undefined : resolveRequired(keyId),
      isSystemConfig: isSysConfig || undefined,
      configKey: isSysConfig ? keyId : undefined,
      configControl: configDef?.control,
      templateId: child.templateId,
    });
  }

  // Map config control type to FieldValueOutliner data type
  function configControlToDataType(control: ConfigFieldDef['control']): string {
    switch (control) {
      case 'toggle': return SYS_D.BOOLEAN;
      case 'color_picker': return SYS_D.COLOR;
      case 'number_input': return FIELD_TYPES.NUMBER;
      case 'outliner': return '__outliner__';
      default: return FIELD_TYPES.PLAIN;
    }
  }

  // For fieldDef: emit virtual entries for all applicable config fields
  if (isFieldDef) {
    const currentType = resolveDataType(nodeId);
    for (const def of ATTRDEF_CONFIG_FIELDS) {
      const applies = def.appliesTo === '*' || def.appliesTo.includes(currentType);
      if (!applies) continue;
      if (def.visibleWhen && !isVisibleWhenSatisfied(def.visibleWhen, node)) continue;
      fields.push({
        fieldDefId: def.key,
        attrDefName: def.name,
        fieldEntryId: `__virtual_${def.key}__`,
        dataType: configControlToDataType(def.control),
        isSystemConfig: true,
        configKey: def.key,
        configControl: def.control,
      });
    }
    const orderMap = new Map(ATTRDEF_CONFIG_FIELDS.map((f, i) => [f.key, i]));
    fields.sort((a, b) => (orderMap.get(a.fieldDefId) ?? Infinity) - (orderMap.get(b.fieldDefId) ?? Infinity));
  }

  // For tagDef: emit virtual entries for all config fields (outliner + non-outliner)
  if (isTagDef) {
    for (const def of TAGDEF_CONFIG_FIELDS) {
      if (def.visibleWhen && !isVisibleWhenSatisfied(def.visibleWhen, node)) continue;
      fields.push({
        fieldDefId: def.key,
        attrDefName: def.name,
        fieldEntryId: `__virtual_${def.key}__`,
        dataType: configControlToDataType(def.control),
        isSystemConfig: true,
        configKey: def.key,
        configControl: def.control,
      });
    }
    const orderMap = new Map(TAGDEF_CONFIG_FIELDS.map((f, i) => [f.key, i]));
    fields.sort((a, b) => (orderMap.get(a.fieldDefId) ?? Infinity) - (orderMap.get(b.fieldDefId) ?? Infinity));
  }

  return fields;
}

const EMPTY = '[]';

export function useNodeFields(nodeId: string): FieldEntry[] {
  const json = useNodeStore((state) => {
    void state._version;
    const fields = computeNodeFields(state.getNode, state.getChildren, nodeId);
    if (fields.length === 0) return EMPTY;
    return JSON.stringify(fields);
  });

  return useMemo(() => (json === EMPTY ? [] : JSON.parse(json) as FieldEntry[]), [json]);
}

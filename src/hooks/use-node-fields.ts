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
  isSystemConfigField, ATTRDEF_CONFIG_MAP, ATTRDEF_CONFIG_FIELDS, ATTRDEF_OUTLINER_FIELDS,
  TAGDEF_CONFIG_MAP, TAGDEF_CONFIG_FIELDS, TAGDEF_OUTLINER_FIELDS,
  SYSTEM_FIELD_MAP, resolveSystemFieldValue, type ConfigFieldDef,
} from '../lib/field-utils.js';
import type { NodexNode } from '../types/index.js';
import { CONTAINER_IDS } from '../types/index.js';
import * as loroDoc from '../lib/loro-doc.js';

export interface FieldEntry {
  attrDefId: string;
  attrDefName: string;
  tupleId: string;
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
}

/** Check if a visibleWhen condition is satisfied by looking at node config values. */
function isVisibleWhenSatisfied(
  condition: NonNullable<ConfigFieldDef['visibleWhen']>,
  node: NodexNode,
): boolean {
  const val = resolveConfigValue({}, node, condition.dependsOn);
  return val === condition.value;
}

function computeFields(
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
      const resolved = resolveSystemFieldValue({}, nodeId, sysDef);
      fields.push({
        attrDefId: keyId,
        attrDefName: sysDef.name,
        tupleId: child.id,
        valueName: resolved.text,
        valueNodeId: resolved.refNodeId,
        dataType: sysDef.dataType,
      });
      continue;
    }

    const fieldDef = getNode(keyId);
    if (!fieldDef || fieldDef.type !== 'fieldDef') continue;

    const isSysConfig = isSystemConfigField(keyId);

    if (isSysConfig) {
      const configDef = ATTRDEF_CONFIG_MAP.get(keyId) ?? TAGDEF_CONFIG_MAP.get(keyId);
      if (configDef) {
        if (configDef.visibleWhen && !isVisibleWhenSatisfied(configDef.visibleWhen, node)) {
          continue;
        }
        if (isFieldDef && configDef.appliesTo !== '*') {
          const currentType = resolveDataType({}, nodeId);
          if (!configDef.appliesTo.includes(currentType)) continue;
        }
      }
    }

    const valueChildren = getChildren(child.id);
    const valueNodeId = valueChildren[0]?.id;
    const valueNode = valueNodeId ? getNode(valueNodeId) : undefined;

    const trashed = !isSysConfig && (loroDoc.getParentId(keyId) === CONTAINER_IDS.TRASH);
    const hasContent = valueChildren.length > 0;

    fields.push({
      attrDefId: keyId,
      attrDefName: fieldDef.name ?? 'Untitled',
      tupleId: child.id,
      valueNodeId,
      valueName: valueNode?.name,
      dataType: resolveDataType({}, keyId),
      trashed,
      hideMode: isSysConfig ? undefined : resolveHideField({}, keyId),
      isEmpty: !hasContent,
      isRequired: isSysConfig ? undefined : resolveRequired({}, keyId),
      isSystemConfig: isSysConfig || undefined,
      configKey: isSysConfig ? keyId : undefined,
    });
  }

  // For fieldDef: emit virtual entries for outliner-type config fields
  if (isFieldDef) {
    const currentType = resolveDataType({}, nodeId);
    for (const def of ATTRDEF_OUTLINER_FIELDS) {
      const applies = def.appliesTo === '*' || def.appliesTo.includes(currentType);
      if (applies) {
        fields.push({
          attrDefId: def.key,
          attrDefName: def.name,
          tupleId: `__virtual_${def.key}__`,
          dataType: '__outliner__',
          isSystemConfig: true,
          configKey: def.key,
        });
      }
    }
    const orderMap = new Map(ATTRDEF_CONFIG_FIELDS.map((f, i) => [f.key, i]));
    fields.sort((a, b) => (orderMap.get(a.attrDefId) ?? Infinity) - (orderMap.get(b.attrDefId) ?? Infinity));
  }

  // For tagDef: emit virtual entries for outliner-type config fields
  if (isTagDef) {
    for (const def of TAGDEF_OUTLINER_FIELDS) {
      fields.push({
        attrDefId: def.key,
        attrDefName: def.name,
        tupleId: `__virtual_${def.key}__`,
        dataType: '__outliner__',
        isSystemConfig: true,
        configKey: def.key,
      });
    }
    const orderMap = new Map(TAGDEF_CONFIG_FIELDS.map((f, i) => [f.key, i]));
    fields.sort((a, b) => (orderMap.get(a.attrDefId) ?? Infinity) - (orderMap.get(b.attrDefId) ?? Infinity));
  }

  return fields;
}

const EMPTY = '[]';

export function useNodeFields(nodeId: string): FieldEntry[] {
  const json = useNodeStore((state) => {
    void state._version;
    const fields = computeFields(state.getNode, state.getChildren, nodeId);
    if (fields.length === 0) return EMPTY;
    return JSON.stringify(fields);
  });

  return useMemo(() => (json === EMPTY ? [] : JSON.parse(json) as FieldEntry[]), [json]);
}

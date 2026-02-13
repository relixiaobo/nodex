/**
 * Derive field entries for a content node from the local store.
 * Walks node.children to find field Tuples (non-SYS_ attrDefId keys),
 * resolves names, values, and data types.
 *
 * Uses JSON.stringify as the Zustand selector return (primitive = stable reference)
 * to avoid React 19 infinite re-render loops with useSyncExternalStore.
 */
import { useMemo } from 'react';
import { useNodeStore } from '../stores/node-store';
import { resolveDataType, resolveHideField, resolveRequired, ATTRDEF_CONFIG_MAP, ATTRDEF_CONFIG_FIELDS, ATTRDEF_OUTLINER_FIELDS, TAGDEF_CONFIG_MAP, TAGDEF_CONFIG_FIELDS, TAGDEF_OUTLINER_FIELDS } from '../lib/field-utils.js';
import type { NodexNode } from '../types/index.js';

export interface FieldEntry {
  attrDefId: string;
  attrDefName: string;
  tupleId: string;
  valueNodeId?: string;
  valueName?: string;
  dataType: string;
  assocDataId?: string;
  /** True when the attrDef has been trashed (moved to Trash container) */
  trashed?: boolean;
  /** Hide-field condition from attrDef config (SYS_V.NEVER by default) */
  hideMode?: string;
  /** True when the field has no meaningful value (for hide-when-empty evaluation) */
  isEmpty?: boolean;
  /** True when the attrDef config marks this field as required */
  isRequired?: boolean;
}

function computeFields(entities: Record<string, NodexNode>, nodeId: string): FieldEntry[] {
  const node = entities[nodeId];
  if (!node?.children) return [];

  const isAttrDef = node.props._docType === 'attrDef';
  const isTagDef = node.props._docType === 'tagDef';

  const fields: FieldEntry[] = [];
  for (const childId of node.children) {
    const child = entities[childId];
    if (child?.props._docType !== 'tuple' || !child.children?.length) continue;

    const keyId = child.children[0];

    // For attrDef nodes: recognize config tuples via ATTRDEF_CONFIG_MAP
    if (isAttrDef) {
      const configDef = ATTRDEF_CONFIG_MAP.get(keyId);
      if (configDef) {
        const currentType = resolveDataType(entities, nodeId);
        const applies = configDef.appliesTo === '*' || configDef.appliesTo.includes(currentType);
        if (applies) {
          fields.push({
            attrDefId: keyId,
            attrDefName: configDef.name,
            tupleId: childId,
            valueName: child.children[1],
            dataType: `__${configDef.control}__`,
          });
        }
        continue;
      }
    }

    // For tagDef nodes: recognize config tuples via TAGDEF_CONFIG_MAP
    if (isTagDef) {
      const configDef = TAGDEF_CONFIG_MAP.get(keyId);
      if (configDef) {
        fields.push({
          attrDefId: keyId,
          attrDefName: configDef.name,
          tupleId: childId,
          valueName: child.children[1],
          dataType: `__${configDef.control}__`,
        });
        continue;
      }
    }

    if (keyId.startsWith('SYS_') || keyId.startsWith('NDX_')) continue;

    const attrDef = entities[keyId];
    if (!attrDef || attrDef.props._docType !== 'attrDef') continue;

    const valueNodeId = child.children[1];
    const valueNode = valueNodeId ? entities[valueNodeId] : undefined;
    const assocDataId = node.associationMap?.[childId];
    const trashed = attrDef.props._ownerId?.endsWith('_TRASH') ?? false;

    // Determine if the field value is empty: no value node AND no content children in assocData
    const assocNode = assocDataId ? entities[assocDataId] : undefined;
    const hasContent = !!valueNodeId || (assocNode?.children?.some(cid => {
      const c = entities[cid];
      return c && !c.props._docType;
    }) ?? false);

    fields.push({
      attrDefId: keyId,
      attrDefName: attrDef.props.name ?? 'Untitled',
      tupleId: childId,
      valueNodeId,
      valueName: valueNode?.props.name,
      dataType: resolveDataType(entities, keyId),
      assocDataId,
      trashed,
      hideMode: resolveHideField(entities, keyId),
      isEmpty: !hasContent,
      isRequired: resolveRequired(entities, keyId),
    });
  }

  // For attrDef: emit virtual entries for outliner-type config fields (no backing tuple)
  if (isAttrDef) {
    const currentType = resolveDataType(entities, nodeId);
    for (const def of ATTRDEF_OUTLINER_FIELDS) {
      const applies = def.appliesTo === '*' || def.appliesTo.includes(currentType);
      if (applies) {
        fields.push({
          attrDefId: def.key,
          attrDefName: def.name,
          tupleId: `__virtual_${def.key}__`,
          dataType: '__outliner__',
        });
      }
    }
    // Sort config fields by canonical order defined in ATTRDEF_CONFIG_FIELDS
    const orderMap = new Map(ATTRDEF_CONFIG_FIELDS.map((f, i) => [f.key, i]));
    fields.sort((a, b) => (orderMap.get(a.attrDefId) ?? Infinity) - (orderMap.get(b.attrDefId) ?? Infinity));
  }

  // For tagDef: emit virtual entries for outliner-type config fields (default content)
  if (isTagDef) {
    for (const def of TAGDEF_OUTLINER_FIELDS) {
      fields.push({
        attrDefId: def.key,
        attrDefName: def.name,
        tupleId: `__virtual_${def.key}__`,
        dataType: '__outliner__',
      });
    }
    // Sort config fields by canonical order defined in TAGDEF_CONFIG_FIELDS
    const orderMap = new Map(TAGDEF_CONFIG_FIELDS.map((f, i) => [f.key, i]));
    fields.sort((a, b) => (orderMap.get(a.attrDefId) ?? Infinity) - (orderMap.get(b.attrDefId) ?? Infinity));
  }

  return fields;
}

const EMPTY = '[]';

export function useNodeFields(nodeId: string): FieldEntry[] {
  // Return a primitive (JSON string) from the selector to avoid infinite loops
  const json = useNodeStore((state) => {
    const fields = computeFields(state.entities, nodeId);
    if (fields.length === 0) return EMPTY;
    return JSON.stringify(fields);
  });

  return useMemo(() => (json === EMPTY ? [] : JSON.parse(json) as FieldEntry[]), [json]);
}

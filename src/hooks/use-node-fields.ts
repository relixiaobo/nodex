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
import { resolveDataType } from '../lib/field-utils.js';
import type { NodexNode } from '../types/index.js';

export interface FieldEntry {
  attrDefId: string;
  attrDefName: string;
  tupleId: string;
  valueNodeId?: string;
  valueName?: string;
  dataType: string;
  assocDataId?: string;
}

function computeFields(entities: Record<string, NodexNode>, nodeId: string): FieldEntry[] {
  const node = entities[nodeId];
  if (!node?.children) return [];

  const isAttrDef = node.props._docType === 'attrDef';

  const fields: FieldEntry[] = [];
  for (const childId of node.children) {
    const child = entities[childId];
    if (child?.props._docType !== 'tuple' || !child.children?.length) continue;

    const keyId = child.children[0];

    // For attrDef nodes: recognize the typeChoice tuple [SYS_A02, SYS_D*]
    if (isAttrDef && keyId === 'SYS_A02') {
      fields.push({
        attrDefId: 'SYS_A02',
        attrDefName: 'Field type',
        tupleId: childId,
        valueNodeId: child.children[1],
        valueName: child.children[1],
        dataType: '__type_choice__',
        assocDataId: undefined,
      });
      continue;
    }

    if (keyId.startsWith('SYS_')) continue;

    const attrDef = entities[keyId];
    if (!attrDef || attrDef.props._docType !== 'attrDef') continue;

    const valueNodeId = child.children[1];
    const valueNode = valueNodeId ? entities[valueNodeId] : undefined;
    const assocDataId = node.associationMap?.[childId];

    fields.push({
      attrDefId: keyId,
      attrDefName: attrDef.props.name ?? 'Untitled',
      tupleId: childId,
      valueNodeId,
      valueName: valueNode?.props.name,
      dataType: resolveDataType(entities, keyId),
      assocDataId,
    });
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

/**
 * Hook returning option nodes for an OPTIONS-type fieldDef.
 * Supports both options-from-supertag and predetermined + auto-collected.
 * Uses JSON-string selector pattern to avoid React 19 infinite re-render.
 */
import { useMemo } from 'react';
import { useNodeStore } from '../stores/node-store';
import {
  resolveDataType, resolveFieldOptions, resolveAutoCollectedOptions,
  resolveSourceSupertag, resolveTaggedNodes,
} from '../lib/field-utils.js';
import { SYS_D } from '../types/index.js';

export interface FieldOption {
  id: string;
  name: string;
}

const EMPTY = '[]';

export function useFieldOptions(attrDefId: string): FieldOption[] {
  const json = useNodeStore((state) => {
    void state._version;
    if (!attrDefId) return EMPTY;

    const dataType = resolveDataType({}, attrDefId);

    // Options from supertag — all nodes tagged with source supertag
    if (dataType === SYS_D.OPTIONS_FROM_SUPERTAG) {
      const tagDefId = resolveSourceSupertag({}, attrDefId);
      if (!tagDefId) return EMPTY;
      const ids = resolveTaggedNodes({}, tagDefId);
      if (ids.length === 0) return EMPTY;
      const options = ids
        .map((id) => {
          const n = state.getNode(id);
          return n ? { id, name: n.name ?? '' } : null;
        })
        .filter(Boolean);
      return JSON.stringify(options);
    }

    // Predetermined + auto-collected options
    const predeterminedIds = resolveFieldOptions({}, attrDefId);
    const autoCollectedIds = resolveAutoCollectedOptions({}, attrDefId);
    const seen = new Set<string>();
    const allIds: string[] = [];
    for (const id of predeterminedIds) {
      if (!seen.has(id)) { seen.add(id); allIds.push(id); }
    }
    for (const id of autoCollectedIds) {
      if (!seen.has(id)) { seen.add(id); allIds.push(id); }
    }
    if (allIds.length === 0) return EMPTY;
    const options = allIds
      .map((id) => {
        const node = state.getNode(id);
        return node ? { id, name: node.name ?? '' } : null;
      })
      .filter(Boolean);
    return JSON.stringify(options);
  });

  return useMemo(() => (json === EMPTY ? [] : JSON.parse(json)), [json]);
}

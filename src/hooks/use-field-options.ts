/**
 * Hook returning option nodes for an OPTIONS-type attrDef.
 * Supports both SYS_D12 (predetermined + auto-collect) and SYS_D05 (from supertag).
 * Uses JSON-string selector pattern to avoid React 19 infinite re-render.
 */
import { useMemo } from 'react';
import { useNodeStore } from '../stores/node-store';
import { resolveDataType, resolveFieldOptions, resolveAutoCollectedOptions, resolveSourceSupertag, resolveTaggedNodes } from '../lib/field-utils.js';
import { SYS_D } from '../types/index.js';

export interface FieldOption {
  id: string;
  name: string;
}

const EMPTY = '[]';

export function useFieldOptions(attrDefId: string): FieldOption[] {
  const json = useNodeStore((state) => {
    const dataType = resolveDataType(state.entities, attrDefId);

    // SYS_D05: Options from supertag — all nodes tagged with source supertag
    if (dataType === SYS_D.OPTIONS_FROM_SUPERTAG) {
      const tagDefId = resolveSourceSupertag(state.entities, attrDefId);
      if (!tagDefId) return EMPTY;
      const ids = resolveTaggedNodes(state.entities, tagDefId);
      if (ids.length === 0) return EMPTY;
      const options = ids
        .map((id) => {
          const n = state.entities[id];
          return n ? { id, name: n.props.name ?? '' } : null;
        })
        .filter(Boolean);
      return JSON.stringify(options);
    }

    // SYS_D12: Predetermined + auto-collected options
    const predeterminedIds = resolveFieldOptions(state.entities, attrDefId);
    const autoCollectedIds = resolveAutoCollectedOptions(state.entities, attrDefId);
    // Merge, dedup (auto-collected could overlap if value was also pre-determined)
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
        const node = state.entities[id];
        return node ? { id, name: node.props.name ?? '' } : null;
      })
      .filter(Boolean);
    return JSON.stringify(options);
  });

  return useMemo(() => (json === EMPTY ? [] : JSON.parse(json)), [json]);
}

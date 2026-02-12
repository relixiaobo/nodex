/**
 * Hook returning option nodes for an OPTIONS-type attrDef.
 * Uses JSON-string selector pattern to avoid React 19 infinite re-render.
 */
import { useMemo } from 'react';
import { useNodeStore } from '../stores/node-store';
import { resolveFieldOptions, resolveAutoCollectedOptions } from '../lib/field-utils.js';

export interface FieldOption {
  id: string;
  name: string;
}

const EMPTY = '[]';

export function useFieldOptions(attrDefId: string): FieldOption[] {
  const json = useNodeStore((state) => {
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

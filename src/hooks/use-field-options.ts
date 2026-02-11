/**
 * Hook returning option nodes for an OPTIONS-type attrDef.
 * Uses JSON-string selector pattern to avoid React 19 infinite re-render.
 */
import { useMemo } from 'react';
import { useNodeStore } from '../stores/node-store';
import { resolveFieldOptions } from '../lib/field-utils.js';

export interface FieldOption {
  id: string;
  name: string;
}

const EMPTY = '[]';

export function useFieldOptions(attrDefId: string): FieldOption[] {
  const json = useNodeStore((state) => {
    const optionIds = resolveFieldOptions(state.entities, attrDefId);
    if (optionIds.length === 0) return EMPTY;
    const options = optionIds
      .map((id) => {
        const node = state.entities[id];
        return node ? { id, name: node.props.name ?? '' } : null;
      })
      .filter(Boolean);
    return JSON.stringify(options);
  });

  return useMemo(() => (json === EMPTY ? [] : JSON.parse(json)), [json]);
}

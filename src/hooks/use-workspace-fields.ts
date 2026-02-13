/**
 * Get all AttrDef (field definition) nodes in the store.
 * Used by FieldNameInput for autocomplete suggestions.
 *
 * Uses JSON.stringify as selector return to avoid React 19 infinite loop.
 */
import { useMemo } from 'react';
import { useNodeStore } from '../stores/node-store';
import { resolveDataType, SYSTEM_FIELD_ENTRIES } from '../lib/field-utils.js';

const EMPTY = '[]';

export function useWorkspaceFields(): Array<{ id: string; name: string; dataType: string }> {
  const json = useNodeStore((state) => {
    const fields: Array<{ id: string; name: string; dataType: string }> = [];
    for (const [id, node] of Object.entries(state.entities)) {
      if (node.props._docType === 'attrDef') {
        fields.push({
          id,
          name: node.props.name ?? 'Untitled',
          dataType: resolveDataType(state.entities, id),
        });
      }
    }
    fields.sort((a, b) => a.name.localeCompare(b.name));
    // Append system fields after user-defined fields
    fields.push(...SYSTEM_FIELD_ENTRIES);
    if (fields.length === 0) return EMPTY;
    return JSON.stringify(fields);
  });

  return useMemo(() => (json === EMPTY ? [] : JSON.parse(json)), [json]);
}

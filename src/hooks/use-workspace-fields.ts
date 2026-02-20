/**
 * Get all FieldDef (field definition) nodes in the Loro store.
 * Used by FieldNameInput for autocomplete suggestions.
 *
 * Uses JSON.stringify as selector return to avoid React 19 infinite loop.
 */
import { useMemo } from 'react';
import { useNodeStore } from '../stores/node-store';
import { resolveDataType, SYSTEM_FIELD_ENTRIES } from '../lib/field-utils.js';
import * as loroDoc from '../lib/loro-doc.js';

const EMPTY = '[]';

export function useWorkspaceFields(): Array<{ id: string; name: string; dataType: string }> {
  const json = useNodeStore((state) => {
    void state._version;
    const fields: Array<{ id: string; name: string; dataType: string }> = [];
    for (const id of loroDoc.getAllNodeIds()) {
      const node = loroDoc.toNodexNode(id);
      if (node?.type === 'fieldDef') {
        fields.push({
          id,
          name: node.name ?? 'Untitled',
          dataType: resolveDataType(id),
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

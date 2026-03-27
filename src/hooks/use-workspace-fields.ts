/**
 * Get all FieldDef (field definition) nodes in the Loro store.
 * Used by FieldNameInput for autocomplete suggestions.
 *
 * Uses JSON.stringify as selector return to avoid React 19 infinite loop.
 */
import { useMemo, useSyncExternalStore } from 'react';
import { resolveDataType, SYSTEM_FIELD_ENTRIES } from '../lib/field-utils.js';
import { SYSTEM_NODE_IDS } from '../types/index.js';
import * as loroDoc from '../lib/loro-doc.js';

const EMPTY = '[]';

export function useWorkspaceFields(): Array<{ id: string; name: string; dataType: string }> {
  const getSnapshot = () => {
    const fields: Array<{ id: string; name: string; dataType: string }> = [];
    for (const id of loroDoc.getChildren(SYSTEM_NODE_IDS.SCHEMA)) {
      const node = loroDoc.toNodexNode(id);
      if (node?.type === 'fieldDef' && node.locked !== true) {
        fields.push({
          id,
          name: node.name ?? 'Untitled',
          dataType: resolveDataType(id),
        });
      }
    }
    fields.sort((a, b) => a.name.localeCompare(b.name));
    fields.push(...SYSTEM_FIELD_ENTRIES);
    if (fields.length === 0) return EMPTY;
    return JSON.stringify(fields);
  };
  const json = useSyncExternalStore(
    (callback) => loroDoc.subscribeSchema(callback),
    getSnapshot,
    getSnapshot,
  );

  return useMemo(() => (json === EMPTY ? [] : JSON.parse(json)), [json]);
}

/**
 * Get all TagDef nodes in the Loro store.
 * Used by TagSelector for the dropdown list.
 *
 * Uses JSON.stringify as selector return to avoid React 19 infinite loop.
 */
import { useMemo, useSyncExternalStore } from 'react';
import { SYSTEM_NODE_IDS } from '../types/index.js';
import * as loroDoc from '../lib/loro-doc.js';

const EMPTY = '[]';

export function useWorkspaceTags(): Array<{ id: string; name: string }> {
  const getSnapshot = () => {
    const tags: Array<{ id: string; name: string }> = [];
    for (const id of loroDoc.getChildren(SYSTEM_NODE_IDS.SCHEMA)) {
      const node = loroDoc.toNodexNode(id);
      if (node?.type === 'tagDef' && node.locked !== true) {
        tags.push({ id, name: node.name ?? 'Untitled' });
      }
    }
    if (tags.length === 0) return EMPTY;
    tags.sort((a, b) => a.name.localeCompare(b.name));
    return JSON.stringify(tags);
  };
  const json = useSyncExternalStore(
    (callback) => loroDoc.subscribeSchema(callback),
    getSnapshot,
    getSnapshot,
  );

  return useMemo(() => (json === EMPTY ? [] : JSON.parse(json)), [json]);
}

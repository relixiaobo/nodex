/**
 * Get all TagDef nodes in the Loro store.
 * Used by TagSelector for the dropdown list.
 *
 * Uses JSON.stringify as selector return to avoid React 19 infinite loop.
 */
import { useMemo } from 'react';
import { useNodeStore } from '../stores/node-store';
import * as loroDoc from '../lib/loro-doc.js';

const EMPTY = '[]';

export function useWorkspaceTags(): Array<{ id: string; name: string }> {
  const json = useNodeStore((state) => {
    void state._version;
    const tags: Array<{ id: string; name: string }> = [];
    for (const id of loroDoc.getAllNodeIds()) {
      const node = loroDoc.toNodexNode(id);
      if (node?.type === 'tagDef' && node.locked !== true) {
        tags.push({ id, name: node.name ?? 'Untitled' });
      }
    }
    if (tags.length === 0) return EMPTY;
    tags.sort((a, b) => a.name.localeCompare(b.name));
    return JSON.stringify(tags);
  });

  return useMemo(() => (json === EMPTY ? [] : JSON.parse(json)), [json]);
}

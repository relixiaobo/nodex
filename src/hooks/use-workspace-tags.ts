/**
 * Get all TagDef nodes in the store.
 * Used by TagSelector for the dropdown list.
 *
 * Uses JSON.stringify as selector return to avoid React 19 infinite loop.
 */
import { useMemo } from 'react';
import { useNodeStore } from '../stores/node-store';

const EMPTY = '[]';

export function useWorkspaceTags(): Array<{ id: string; name: string }> {
  const json = useNodeStore((state) => {
    const tags: Array<{ id: string; name: string }> = [];
    for (const [id, node] of Object.entries(state.entities)) {
      if (node.props._docType === 'tagDef') {
        tags.push({ id, name: node.props.name ?? 'Untitled' });
      }
    }
    if (tags.length === 0) return EMPTY;
    tags.sort((a, b) => a.name.localeCompare(b.name));
    return JSON.stringify(tags);
  });

  return useMemo(() => (json === EMPTY ? [] : JSON.parse(json)), [json]);
}

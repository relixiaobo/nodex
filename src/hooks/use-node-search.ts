/**
 * In-memory node search hook.
 *
 * Filters store entities by name, skipping system nodes (tuple, metanode,
 * etc.). Returns results with breadcrumb paths.
 *
 * Uses JSON-string selector pattern to avoid React 19 infinite re-render
 * (same as useWorkspaceTags / useNodeFields).
 */
import { useMemo } from 'react';
import { useNodeStore } from '../stores/node-store';

export interface NodeSearchResult {
  id: string;
  name: string;
  breadcrumb: string;
}

/** System doc types to skip in search results */
const SKIP_DOC_TYPES = new Set([
  'tuple', 'metanode', 'tagDef',
  'attrDef', 'workspace', 'user',
]);

export function useNodeSearch(query: string, excludeId?: string): NodeSearchResult[] {
  const json = useNodeStore((state) => {
    const q = query.trim().toLowerCase();
    if (!q) return '[]';

    const matches: NodeSearchResult[] = [];

    for (const [id, node] of Object.entries(state.entities)) {
      if (id === excludeId) continue;

      // Skip system doc types
      const dt = node.props._docType;
      if (dt && SKIP_DOC_TYPES.has(dt)) continue;

      // Skip nodes with no name
      const rawName = node.props.name ?? '';
      const plainText = rawName.replace(/<[^>]+>/g, '').trim();
      if (!plainText) continue;

      // Match by name
      if (!plainText.toLowerCase().includes(q)) continue;

      // Build breadcrumb by walking _ownerId chain (max 3 levels)
      const crumbs: string[] = [];
      let parentId = node.props._ownerId;
      let depth = 0;
      while (parentId && depth < 3) {
        const parent = state.entities[parentId];
        if (!parent) break;
        const pName = (parent.props.name ?? '').replace(/<[^>]+>/g, '').trim();
        if (pName) crumbs.unshift(pName);
        parentId = parent.props._ownerId;
        depth++;
      }

      matches.push({ id, name: plainText, breadcrumb: crumbs.join(' / ') });
      if (matches.length >= 15) break;
    }

    return JSON.stringify(matches);
  });

  return useMemo(() => JSON.parse(json) as NodeSearchResult[], [json]);
}

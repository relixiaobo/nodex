/**
 * In-memory node search hook.
 *
 * Filters Loro nodes by name, skipping structural/system types.
 * Returns results with breadcrumb paths.
 *
 * Uses JSON-string selector pattern to avoid React 19 infinite re-render.
 */
import { useMemo } from 'react';
import { useNodeStore } from '../stores/node-store';
import * as loroDoc from '../lib/loro-doc.js';

export interface NodeSearchResult {
  id: string;
  name: string;
  breadcrumb: string;
}

/** Node types to skip in search results */
const SKIP_DOC_TYPES = new Set([
  'fieldEntry', 'fieldDef', 'tagDef',
  'reference', 'workspace', 'user',
]);

export function useNodeSearch(query: string, excludeId?: string): NodeSearchResult[] {
  const json = useNodeStore((state) => {
    void state._version;
    const q = query.trim().toLowerCase();
    if (!q) return '[]';

    const matches: NodeSearchResult[] = [];
    const allIds = loroDoc.getAllNodeIds();

    for (const id of allIds) {
      if (id === excludeId) continue;

      const node = loroDoc.toNodexNode(id);
      if (!node) continue;

      // Skip structural/system node types
      if (node.type && SKIP_DOC_TYPES.has(node.type)) continue;

      // Skip nodes with no name
      const rawName = node.name ?? '';
      const plainText = rawName.replace(/<[^>]+>/g, '').trim();
      if (!plainText) continue;

      // Match by name
      if (!plainText.toLowerCase().includes(q)) continue;

      // Build breadcrumb by walking parent chain (max 3 levels)
      const crumbs: string[] = [];
      let parentId = loroDoc.getParentId(id);
      let depth = 0;
      while (parentId && depth < 3) {
        const parent = loroDoc.toNodexNode(parentId);
        if (!parent) break;
        const pName = (parent.name ?? '').replace(/<[^>]+>/g, '').trim();
        if (pName) crumbs.unshift(pName);
        parentId = loroDoc.getParentId(parentId);
        depth++;
      }

      matches.push({ id, name: plainText, breadcrumb: crumbs.join(' / ') });
      if (matches.length >= 15) break;
    }

    return JSON.stringify(matches);
  });

  return useMemo(() => JSON.parse(json) as NodeSearchResult[], [json]);
}

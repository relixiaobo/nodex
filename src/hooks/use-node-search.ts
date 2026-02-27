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
import { isWorkspaceContainer } from '../lib/tree-utils.js';

export interface NodeSearchResult {
  id: string;
  name: string;
  breadcrumb: string;
  updatedAt: number;
}

/** Structural node types to skip in search results (not meaningful as search targets). */
const SKIP_DOC_TYPES = new Set<string>([
  'fieldEntry', 'fieldDef', 'tagDef', 'reference', 'queryCondition',
]);
const MAX_RESULTS = 15;
// Bound broad queries so large workspaces don't scan all nodes on every keystroke.
// We still sort by updatedAt within this candidate pool, preserving recency behavior.
const MAX_MATCH_CANDIDATES = 120;

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

      // Skip workspace containers (LIBRARY, INBOX, etc.) and structural node types
      if (isWorkspaceContainer(id)) continue;
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

      matches.push({
        id,
        name: plainText,
        breadcrumb: crumbs.join(' / '),
        updatedAt: node.updatedAt ?? 0,
      });

      if (matches.length >= MAX_MATCH_CANDIDATES) break;
    }

    matches.sort((a, b) => {
      if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
      const byName = a.name.localeCompare(b.name, 'en');
      if (byName !== 0) return byName;
      return a.id.localeCompare(b.id, 'en');
    });

    if (matches.length > MAX_RESULTS) matches.length = MAX_RESULTS;
    return JSON.stringify(matches);
  });

  return useMemo(() => JSON.parse(json) as NodeSearchResult[], [json]);
}

/**
 * In-memory node search hook.
 *
 * Accepts a pre-built candidate list (constructed once when a panel opens)
 * and filters it by query. No O(N) scan on every keystroke.
 *
 * Callers (CommandPalette, ReferenceSelector) build candidates at open-time.
 */
import { useMemo } from 'react';
import * as loroDoc from '../lib/loro-doc.js';

export interface SearchCandidate {
  id: string;
  name: string;
}

export interface NodeSearchResult {
  id: string;
  name: string;
  breadcrumb: string;
  updatedAt: number;
}

const MAX_RESULTS = 15;
// Bound broad queries so large workspaces don't scan all candidates on every keystroke.
const MAX_MATCH_CANDIDATES = 120;

/**
 * Search pre-built candidates by query. No store subscription — pure computation.
 */
export function useNodeSearch(
  query: string,
  candidates: SearchCandidate[],
  excludeId?: string,
): NodeSearchResult[] {
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || candidates.length === 0) return [];

    const matches: NodeSearchResult[] = [];

    for (const { id, name } of candidates) {
      if (id === excludeId) continue;
      if (!name.toLowerCase().includes(q)) continue;

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

      const node = loroDoc.toNodexNode(id);
      matches.push({
        id,
        name,
        breadcrumb: crumbs.join(' / '),
        updatedAt: node?.updatedAt ?? 0,
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
    return matches;
  }, [query, candidates, excludeId]);
}

/**
 * Build search candidates from the entire LoroDoc.
 * Called once when a panel/selector opens — O(N) but not on every keystroke.
 */
export function buildSearchCandidates(opts?: {
  excludeIds?: Set<string>;
  skipTypes?: Set<string>;
}): SearchCandidate[] {
  const { excludeIds, skipTypes } = opts ?? {};
  const items: SearchCandidate[] = [];
  for (const id of loroDoc.getAllNodeIds()) {
    if (excludeIds?.has(id)) continue;
    const node = loroDoc.toNodexNode(id);
    if (!node) continue;
    if (skipTypes && node.type && skipTypes.has(node.type)) continue;
    const name = (node.name ?? '').replace(/<[^>]+>/g, '').trim();
    if (!name) continue;
    items.push({ id, name });
  }
  return items;
}

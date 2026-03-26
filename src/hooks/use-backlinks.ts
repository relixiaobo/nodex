/**
 * React hooks for backlink data.
 *
 * Uses JSON-stringify selector pattern (same as use-node-search.ts)
 * to avoid infinite re-renders in React 19 strict mode.
 */
import { useMemo } from 'react';
import { useNodeStore } from '../stores/node-store';
import { computeBacklinks, buildBacklinkCountMap, type BacklinksResult } from '../lib/backlinks.js';

// ─── Constants for stable empty references ───

const EMPTY_RESULT: BacklinksResult = { mentionedIn: [], fieldValueRefs: {}, totalCount: 0 };
const EMPTY_JSON = '{"m":[],"f":{},"t":0}';

// ─── useBacklinks ───

/**
 * Subscribe to all backlinks pointing at `nodeId`.
 * Re-computes when any node in the store changes (_version).
 */
export function useBacklinks(nodeId: string): BacklinksResult {
  const json = useNodeStore((state) => {
    const result = computeBacklinks(nodeId, state._version);
    if (result.totalCount === 0) return EMPTY_JSON;
    return JSON.stringify(result);
  });

  return useMemo(
    () => (json === EMPTY_JSON ? EMPTY_RESULT : JSON.parse(json) as BacklinksResult),
    [json],
  );
}

// ─── useBacklinkCount (single node) ───

/**
 * Subscribe to the backlink count for a single node.
 * Returns a primitive number — only re-renders when this node's count changes.
 * Uses the cached global count map (computed once per _version).
 */
export function useBacklinkCount(nodeId: string): number {
  return useNodeStore((state) => {
    const map = buildBacklinkCountMap(state._version);
    return map.get(nodeId) ?? 0;
  });
}

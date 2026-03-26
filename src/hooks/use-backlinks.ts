/**
 * React hooks for backlink data.
 *
 * Uses JSON-stringify selector pattern (same as use-node-search.ts)
 * to avoid infinite re-renders in React 19 strict mode.
 */
import { useMemo } from 'react';
import { useNodeStore } from '../stores/node-store';
import { computeBacklinks, getCachedBacklinkCount, type BacklinksResult } from '../lib/backlinks.js';

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
 * Return the backlink count for a single node.
 * Does NOT subscribe to _version — uses the cached count map if available,
 * otherwise returns 0. The map is built by view-pipeline when refCount sort
 * is active, or on navigation. This avoids O(N) scans on every keystroke.
 */
export function useBacklinkCount(nodeId: string): number {
  return useNodeStore(() => {
    // Read from cache without triggering a rebuild — O(1)
    return getCachedBacklinkCount(nodeId);
  });
}

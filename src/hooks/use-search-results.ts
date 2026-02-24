import { useMemo } from 'react';
import { useNodeStore } from '../stores/node-store.js';
import { executeSearch } from '../lib/search-engine.js';

/**
 * Subscribes to search results for a search node.
 * Re-evaluates whenever the Loro data version changes.
 */
export function useSearchResults(searchNodeId: string): string[] {
  const version = useNodeStore((s) => s._version);
  return useMemo(() => executeSearch(searchNodeId), [searchNodeId, version]);
}

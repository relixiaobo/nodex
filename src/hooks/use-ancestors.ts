/**
 * Hook for computing the ancestor breadcrumb chain of a node.
 *
 * Uses JSON.stringify selector (same pattern as useNodeFields) to avoid
 * Zustand infinite re-render loops with useSyncExternalStore.
 */
import { useMemo } from 'react';
import { useNodeStore } from '../stores/node-store';
import { getAncestorChain, type AncestorInfo } from '../lib/tree-utils';

interface AncestorResult {
  ancestors: AncestorInfo[];
  rootContainerId: string | null;
}

const EMPTY: AncestorResult = { ancestors: [], rootContainerId: null };
const EMPTY_JSON = JSON.stringify(EMPTY);

export function useAncestors(nodeId: string | null): AncestorResult {
  const json = useNodeStore((state) => {
    if (!nodeId) return EMPTY_JSON;
    const result = getAncestorChain(nodeId, state.entities);
    if (result.ancestors.length === 0 && !result.rootContainerId) return EMPTY_JSON;
    return JSON.stringify(result);
  });

  return useMemo(
    () => (json === EMPTY_JSON ? EMPTY : JSON.parse(json) as AncestorResult),
    [json],
  );
}

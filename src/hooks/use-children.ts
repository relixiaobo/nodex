/**
 * Hook to subscribe to a node's children.
 * Lazily fetches children from Supabase when they're missing from the cache.
 */
import { useEffect, useRef } from 'react';
import { useNodeStore } from '../stores/node-store';

export function useChildren(nodeId: string | null) {
  const node = useNodeStore((s) => (nodeId ? s.entities[nodeId] : undefined));
  const childIds = node?.children ?? [];
  const fetchChildren = useNodeStore((s) => s.fetchChildren);
  const entities = useNodeStore((s) => s.entities);
  const fetchedRef = useRef<string | null>(null);

  // Check if any children are missing from the cache
  const hasMissing = childIds.some((id) => !entities[id]);

  useEffect(() => {
    if (nodeId && hasMissing && fetchedRef.current !== nodeId) {
      fetchedRef.current = nodeId;
      fetchChildren(nodeId);
    }
  }, [nodeId, hasMissing, fetchChildren]);

  // Reset fetch tracker when nodeId changes
  useEffect(() => {
    fetchedRef.current = null;
  }, [nodeId]);

  return childIds
    .map((id) => entities[id])
    .filter(Boolean);
}

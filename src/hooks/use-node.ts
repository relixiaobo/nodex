/**
 * Hook to subscribe to a single node by ID.
 * Lazily fetches from Supabase if not cached.
 */
import { useEffect } from 'react';
import { useNodeStore } from '../stores/node-store';

export function useNode(nodeId: string | null) {
  const node = useNodeStore((s) => (nodeId ? s.entities[nodeId] : undefined));
  const fetchNode = useNodeStore((s) => s.fetchNode);

  useEffect(() => {
    if (nodeId && !node) {
      fetchNode(nodeId);
    }
  }, [nodeId, node, fetchNode]);

  return node ?? null;
}

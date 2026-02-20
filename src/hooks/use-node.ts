/**
 * Hook to subscribe to a single node by ID.
 * Reads from LoroDoc synchronously; re-renders when _version changes.
 */
import { useNodeStore } from '../stores/node-store';

export function useNode(nodeId: string | null) {
  return useNodeStore((s) => {
    void s._version; // subscribe for re-renders on Loro changes
    return nodeId ? s.getNode(nodeId) : null;
  });
}

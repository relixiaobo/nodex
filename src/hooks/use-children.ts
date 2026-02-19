/**
 * Hook to subscribe to a node's children.
 * Reads from LoroDoc synchronously; re-renders when _version changes.
 */
import { useNodeStore } from '../stores/node-store';

export function useChildren(nodeId: string | null) {
  return useNodeStore((s) => {
    void s._version; // subscribe for re-renders on Loro changes
    return nodeId ? s.getChildren(nodeId) : [];
  });
}

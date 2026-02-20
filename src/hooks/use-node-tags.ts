/**
 * Derive tag IDs for a content node.
 * In the Loro model, tags are stored directly in node.tags: string[].
 */
import { useNodeStore } from '../stores/node-store';

export function useNodeTags(nodeId: string): string[] {
  return useNodeStore((state) => {
    void state._version;
    const node = state.getNode(nodeId);
    return node?.tags ?? [];
  });
}

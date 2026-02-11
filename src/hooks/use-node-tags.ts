/**
 * Derive tag IDs for a content node by traversing the metanode chain
 * in the local store. No async fetching — synchronous selector.
 */
import { useNodeStore } from '../stores/node-store';
import { useShallow } from 'zustand/react/shallow';
import { SYS_A } from '../types/index.js';

export function useNodeTags(nodeId: string): string[] {
  return useNodeStore(useShallow((state) => {
    const node = state.entities[nodeId];
    if (!node?.props._metaNodeId) return [];

    const metanode = state.entities[node.props._metaNodeId];
    if (!metanode?.children) return [];

    const tagIds: string[] = [];
    for (const childId of metanode.children) {
      const tuple = state.entities[childId];
      if (
        tuple?.props._docType === 'tuple' &&
        tuple.children &&
        tuple.children[0] === SYS_A.NODE_SUPERTAGS &&
        tuple.children.length >= 2
      ) {
        tagIds.push(tuple.children[1]);
      }
    }
    return tagIds;
  }));
}

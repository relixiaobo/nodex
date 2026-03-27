/**
 * Hook to subscribe to a node's children.
 * Re-renders only when this render scope changes.
 */
import { useSyncExternalStore } from 'react';
import type { NodexNode } from '../types/index.js';
import * as loroDoc from '../lib/loro-doc.js';
import { useNodeStore } from '../stores/node-store';

const EMPTY: NodexNode[] = [];

export function useChildren(nodeId: string | null) {
  const getSnapshot = () => (nodeId ? useNodeStore.getState().getChildren(nodeId) : EMPTY);
  return useSyncExternalStore(
    (callback) => (nodeId ? loroDoc.subscribeScope(nodeId, callback) : () => {}),
    getSnapshot,
    getSnapshot,
  );
}

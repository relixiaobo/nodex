/**
 * Hook to subscribe to a single node by ID.
 * Reads from LoroDoc synchronously; re-renders only when this node snapshot changes.
 */
import { useSyncExternalStore } from 'react';
import * as loroDoc from '../lib/loro-doc.js';

export function useNode(nodeId: string | null) {
  const getSnapshot = () => (nodeId ? loroDoc.toNodexNode(nodeId) : null);
  return useSyncExternalStore(
    (callback) => (nodeId ? loroDoc.subscribeNode(nodeId, callback) : () => {}),
    getSnapshot,
    getSnapshot,
  );
}

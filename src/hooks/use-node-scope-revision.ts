import { useSyncExternalStore } from 'react';
import * as loroDoc from '../lib/loro-doc.js';

export function useNodeScopeRevision(nodeId: string | null): number {
  const getSnapshot = () => (nodeId ? loroDoc.getScopeRevision(nodeId) : 0);
  return useSyncExternalStore(
    (callback) => (nodeId ? loroDoc.subscribeScope(nodeId, callback) : () => {}),
    getSnapshot,
    getSnapshot,
  );
}

export function useSchemaRevision(): number {
  const getSnapshot = () => loroDoc.getSchemaRevision();
  return useSyncExternalStore(
    (callback) => loroDoc.subscribeSchema(callback),
    getSnapshot,
    getSnapshot,
  );
}

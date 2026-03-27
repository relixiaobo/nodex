/**
 * Derive tag IDs for a content node.
 * In the Loro model, tags are stored directly in node.tags: string[].
 */
import { useSyncExternalStore } from 'react';
import * as loroDoc from '../lib/loro-doc.js';

const EMPTY_TAGS: string[] = [];

export function useNodeTags(nodeId: string): string[] {
  const getSnapshot = () => loroDoc.toNodexNode(nodeId)?.tags ?? EMPTY_TAGS;
  return useSyncExternalStore(
    (callback) => loroDoc.subscribeNode(nodeId, callback),
    getSnapshot,
    getSnapshot,
  );
}

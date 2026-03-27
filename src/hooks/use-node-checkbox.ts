/**
 * Hook to derive checkbox visibility and done state for a node.
 *
 * In the new Loro model:
 * - Done state: node.completedAt (undefined = no checkbox, 0 = undone, >0 = done)
 * - Tag-driven: node.tags[] → tagDef.showCheckbox
 *
 * Uses a stable fingerprint to avoid infinite re-render.
 */
import { useMemo, useSyncExternalStore } from 'react';
import * as loroDoc from '../lib/loro-doc.js';
import { shouldNodeShowCheckbox, type CheckboxState } from '../lib/checkbox-utils.js';

export function useNodeCheckbox(nodeId: string): CheckboxState {
  // Build a stable fingerprint of all data the pure function depends on.
  const getSnapshot = () => {
    const node = loroDoc.toNodexNode(nodeId);
    if (!node) return '';
    return `${node.completedAt ?? 'x'}|${(node.tags ?? []).join(',')}|${loroDoc.getSchemaRevision()}`;
  };
  const fingerprint = useSyncExternalStore(
    (callback) => {
      const unsubNode = loroDoc.subscribeNode(nodeId, callback);
      const unsubSchema = loroDoc.subscribeSchema(callback);
      return () => {
        unsubNode();
        unsubSchema();
      };
    },
    getSnapshot,
    getSnapshot,
  );

  return useMemo(() => {
    const node = loroDoc.toNodexNode(nodeId);
    if (!node) return { showCheckbox: false, isDone: false };
    return shouldNodeShowCheckbox(node);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, fingerprint]);
}

/**
 * Hook to derive checkbox visibility and done state for a node.
 *
 * In the new Loro model:
 * - Done state: node.completedAt (undefined = no checkbox, 0 = undone, >0 = done)
 * - Tag-driven: node.tags[] → tagDef.showCheckbox
 *
 * Uses a stable fingerprint to avoid infinite re-render.
 */
import { useMemo } from 'react';
import { useNodeStore } from '../stores/node-store.js';
import { shouldNodeShowCheckbox, type CheckboxState } from '../lib/checkbox-utils.js';

export function useNodeCheckbox(nodeId: string): CheckboxState {
  // Build a stable fingerprint of all data the pure function depends on.
  const fingerprint = useNodeStore((s) => {
    void s._version;
    const node = s.getNode(nodeId);
    if (!node) return '';
    // Include completedAt and tags for checkbox visibility
    return `${node.completedAt ?? 'x'}|${(node.tags ?? []).join(',')}`;
  });

  return useMemo(() => {
    const node = useNodeStore.getState().getNode(nodeId);
    if (!node) return { showCheckbox: false, isDone: false };
    return shouldNodeShowCheckbox(node);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, fingerprint]);
}

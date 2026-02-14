/**
 * Hook to derive checkbox visibility and done state for a node.
 *
 * Depends on: node._done, node.metanode.children, tagDef.children (multi-layer).
 * Uses JSON.stringify fingerprint to avoid infinite re-render from Zustand selector
 * returning a new object reference every time.
 */
import { useMemo } from 'react';
import { useNodeStore } from '../stores/node-store.js';
import { shouldNodeShowCheckbox, type CheckboxState } from '../lib/checkbox-utils.js';

export function useNodeCheckbox(nodeId: string): CheckboxState {
  // Build a stable fingerprint of all data the pure function depends on.
  // This avoids creating a new object on every render (Zustand + React 19 gotcha).
  const fingerprint = useNodeStore((s) => {
    const node = s.entities[nodeId];
    if (!node) return '';

    // Collect relevant data: _done (3 states), metanode children, tagDef config tuples
    // Must distinguish undefined / 0 / >0 for the three-state checkbox model
    const parts: string[] = [String(node.props._done ?? 'x')];

    const metaId = node.props._metaNodeId;
    if (metaId) {
      const meta = s.entities[metaId];
      if (meta?.children) {
        for (const tid of meta.children) {
          const tuple = s.entities[tid];
          if (tuple?.children) {
            parts.push(tuple.children.join(','));
          }
        }
      }
    }

    return parts.join('|');
  });

  return useMemo(() => {
    const entities = useNodeStore.getState().entities;
    return shouldNodeShowCheckbox(nodeId, entities);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, fingerprint]);
}

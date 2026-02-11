/**
 * Lightweight hook to check if a node has any field tuples.
 * Used by OutlinerItem to conditionally render FieldList.
 */
import { useNodeStore } from '../stores/node-store';

const ATTRDEF_CONFIG_KEYS = new Set(['SYS_A02', 'SYS_A01', 'SYS_A44', 'NDX_A01']);

export function useHasFields(nodeId: string): boolean {
  return useNodeStore((state) => {
    const node = state.entities[nodeId];
    if (!node?.children) return false;

    const isAttrDef = node.props._docType === 'attrDef';

    for (const childId of node.children) {
      const child = state.entities[childId];
      if (child?.props._docType !== 'tuple' || !child.children?.length) continue;
      const keyId = child.children[0];
      // attrDef nodes: typeChoice + config tuples count as fields
      if (isAttrDef && ATTRDEF_CONFIG_KEYS.has(keyId)) return true;
      if (!keyId.startsWith('SYS_') && !keyId.startsWith('NDX_') && state.entities[keyId]?.props._docType === 'attrDef') {
        return true;
      }
    }
    return false;
  });
}

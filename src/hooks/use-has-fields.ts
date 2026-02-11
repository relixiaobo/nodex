/**
 * Lightweight hook to check if a node has any field tuples.
 * Used by OutlinerItem to conditionally render FieldList.
 */
import { useNodeStore } from '../stores/node-store';

export function useHasFields(nodeId: string): boolean {
  return useNodeStore((state) => {
    const node = state.entities[nodeId];
    if (!node?.children) return false;

    const isAttrDef = node.props._docType === 'attrDef';

    for (const childId of node.children) {
      const child = state.entities[childId];
      if (child?.props._docType !== 'tuple' || !child.children?.length) continue;
      const keyId = child.children[0];
      // attrDef nodes: typeChoice tuple [SYS_A02, SYS_D*] counts as a field
      if (isAttrDef && keyId === 'SYS_A02') return true;
      if (!keyId.startsWith('SYS_') && state.entities[keyId]?.props._docType === 'attrDef') {
        return true;
      }
    }
    return false;
  });
}

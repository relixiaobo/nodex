/**
 * Lightweight hook to check if a node has any field tuples.
 * Used by OutlinerItem to conditionally render FieldList.
 */
import { useNodeStore } from '../stores/node-store';
import { ATTRDEF_CONFIG_MAP } from '../lib/field-utils.js';

export function useHasFields(nodeId: string): boolean {
  return useNodeStore((state) => {
    void state._version;
    const node = state.getNode(nodeId);
    if (!node?.children) return false;

    const isFieldDef = node.type === 'fieldDef';

    for (const childId of node.children) {
      const child = state.getNode(childId);
      if (child?.type !== 'fieldEntry' || !child.fieldDefId) continue;
      const keyId = child.fieldDefId;
      // fieldDef nodes: config fieldEntries from SYS_T02 template count as fields
      if (isFieldDef && ATTRDEF_CONFIG_MAP.has(keyId)) return true;
      if (!keyId.startsWith('SYS_') && !keyId.startsWith('NDX_A') && state.getNode(keyId)?.type === 'fieldDef') {
        return true;
      }
    }
    return false;
  });
}

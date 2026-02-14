/**
 * Pure functions for checkbox visibility and done-state derivation.
 *
 * A node shows a checkbox when:
 * 1. Any of its supertags has SYS_A55 (SHOW_CHECKBOX) = SYS_V03 (YES), OR
 * 2. The node's _done prop is set (manual toggle via Cmd+Enter).
 */
import type { NodexNode } from '../types/node.js';
import { SYS_A, SYS_V } from '../types/index.js';

export interface CheckboxState {
  showCheckbox: boolean;
  isDone: boolean;
}

/**
 * Determine whether a node should display a checkbox and its done state.
 *
 * Walk: node → metanode → tuples[SYS_A13, tagDefId] → tagDef.children → tuples[SYS_A55, SYS_V03]
 */
export function shouldNodeShowCheckbox(
  nodeId: string,
  entities: Record<string, NodexNode>,
): CheckboxState {
  const node = entities[nodeId];
  if (!node) return { showCheckbox: false, isDone: false };

  const isDone = !!node.props._done;

  // Check supertags for SYS_A55 = YES
  const metaNodeId = node.props._metaNodeId;
  if (metaNodeId) {
    const meta = entities[metaNodeId];
    if (meta?.children) {
      for (const tupleId of meta.children) {
        const tuple = entities[tupleId];
        if (!tuple?.children || tuple.children.length < 2) continue;
        if (tuple.children[0] !== SYS_A.NODE_SUPERTAGS) continue;

        // tuple.children[1] = tagDefId
        const tagDefId = tuple.children[1];
        if (hasShowCheckbox(tagDefId, entities)) {
          return { showCheckbox: true, isDone };
        }
      }
    }
  }

  // No tag has SYS_A55=YES, but _done is set → show checkbox (manual toggle)
  if (isDone) return { showCheckbox: true, isDone: true };

  return { showCheckbox: false, isDone: false };
}

/**
 * Check if a tagDef has a config tuple [SYS_A55, SYS_V03] in its children.
 */
function hasShowCheckbox(
  tagDefId: string,
  entities: Record<string, NodexNode>,
): boolean {
  const tagDef = entities[tagDefId];
  if (!tagDef?.children) return false;

  for (const childId of tagDef.children) {
    const child = entities[childId];
    if (!child?.children || child.children.length < 2) continue;
    if (child.children[0] === SYS_A.SHOW_CHECKBOX && child.children[1] === SYS_V.YES) {
      return true;
    }
  }
  return false;
}

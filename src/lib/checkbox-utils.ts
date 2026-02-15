/**
 * Pure functions for checkbox visibility, done-state, and state transitions.
 *
 * ## Three-state model
 *
 * Each node has one of three checkbox states:
 *
 * | `_done` value | State       | Visual                          |
 * |---------------|-------------|---------------------------------|
 * | `undefined`   | No checkbox | Normal text, no checkbox shown  |
 * | `0`           | Undone      | Empty checkbox, normal text     |
 * | `> 0` (ts)    | Done        | Green check, dimmed text        |
 *
 * `_done = 0` is a sentinel: epoch-zero is never a valid completion time,
 * so it safely encodes "has checkbox, not yet done".
 *
 * ## Visibility rules
 *
 * A checkbox is visible when:
 * 1. Any supertag has SYS_A55 = YES (tag-driven, always visible), OR
 * 2. `_done !== undefined` (manual, added via Cmd+Enter)
 *
 * ## Interactions
 *
 * - **Click checkbox**: toggles between undone ↔ done (never removes checkbox)
 * - **Cmd+Enter** (manual nodes): cycles No → Undone → Done → No
 * - **Cmd+Enter** (tag-driven nodes): toggles undone ↔ done (tag keeps checkbox)
 */
import type { NodexNode } from '../types/node.js';
import { SYS_A, SYS_V } from '../types/index.js';
import { getExtendsChain } from './field-utils.js';

export interface CheckboxState {
  showCheckbox: boolean;
  isDone: boolean;
}

/**
 * Determine checkbox visibility and done state for a node.
 */
export function shouldNodeShowCheckbox(
  nodeId: string,
  entities: Record<string, NodexNode>,
): CheckboxState {
  const node = entities[nodeId];
  if (!node) return { showCheckbox: false, isDone: false };

  const isDone = node.props._done !== undefined && node.props._done > 0;

  // Tag-driven: any supertag has SYS_A55 = YES
  if (hasTagShowCheckbox(nodeId, entities)) {
    return { showCheckbox: true, isDone };
  }

  // Manual: _done !== undefined (includes _done = 0 for undone)
  if (node.props._done !== undefined) {
    return { showCheckbox: true, isDone };
  }

  return { showCheckbox: false, isDone: false };
}

/**
 * Check if any of the node's supertags has SYS_A55 = YES.
 */
export function hasTagShowCheckbox(
  nodeId: string,
  entities: Record<string, NodexNode>,
): boolean {
  const node = entities[nodeId];
  if (!node) return false;

  const metaNodeId = node.props._metaNodeId;
  if (!metaNodeId) return false;

  const meta = entities[metaNodeId];
  if (!meta?.children) return false;

  for (const tupleId of meta.children) {
    const tuple = entities[tupleId];
    if (!tuple?.children || tuple.children.length < 2) continue;
    if (tuple.children[0] !== SYS_A.NODE_SUPERTAGS) continue;

    const tagDefId = tuple.children[1];
    if (tagDefHasShowCheckbox(tagDefId, entities)) {
      return true;
    }
  }

  return false;
}

/**
 * Resolve next `_done` value when clicking the checkbox.
 *
 * Click only toggles between undone ↔ done. It never removes the checkbox.
 *
 * - Tag-driven: done → `undefined` (tag keeps checkbox visible), undone → `Date.now()`
 * - Manual: done → `0` (keep checkbox, undone), undone → `Date.now()`
 */
export function resolveCheckboxClick(
  currentDone: number | undefined,
  hasTag: boolean,
): number | undefined {
  if (currentDone !== undefined && currentDone > 0) {
    // Was done → undone
    return hasTag ? undefined : 0;
  }
  // Was undone → done
  return Date.now();
}

/**
 * Resolve next `_done` value for Cmd+Enter.
 *
 * - Tag-driven: 2-state toggle (undone ↔ done), checkbox always visible from tag
 * - Manual: 3-state cycle (No → Undone → Done → No)
 */
export function resolveCmdEnterCycle(
  currentDone: number | undefined,
  hasTag: boolean,
): number | undefined {
  if (hasTag) {
    // Tag-driven: 2-state toggle
    return (currentDone !== undefined && currentDone > 0) ? undefined : Date.now();
  }
  // Manual: 3-state cycle
  if (currentDone === undefined) return 0;           // No → Undone
  if (currentDone === 0) return Date.now();           // Undone → Done
  return undefined;                                   // Done → No
}

// ─── Done State Mapping ───

export interface DoneStateMapping {
  tagDefId: string;
  attrDefId: string;
  checkedOptionId: string;
  uncheckedOptionId?: string;
}

/**
 * Get all done-state mapping configs from a node's supertags (including Extend chain).
 *
 * Path: node → metanode → SYS_A13 tuples → tagDefId → tagDef.children → NDX_A06 tuple
 * Also walks the Extend chain for each tag.
 */
export function getDoneStateMappings(
  nodeId: string,
  entities: Record<string, NodexNode>,
): DoneStateMapping[] {
  const node = entities[nodeId];
  if (!node) return [];

  const metaNodeId = node.props._metaNodeId;
  if (!metaNodeId) return [];

  const meta = entities[metaNodeId];
  if (!meta?.children) return [];

  const result: DoneStateMapping[] = [];

  for (const tupleId of meta.children) {
    const tuple = entities[tupleId];
    if (!tuple?.children || tuple.children.length < 2) continue;
    if (tuple.children[0] !== SYS_A.NODE_SUPERTAGS) continue;

    const tagDefId = tuple.children[1];
    // Collect mappings from this tag and its entire Extend chain
    const chain = getExtendsChain(entities, tagDefId);
    const allTagDefs = [...chain, tagDefId];

    for (const tdId of allTagDefs) {
      const td = entities[tdId];
      if (!td?.children) continue;

      for (const childId of td.children) {
        const child = entities[childId];
        if (!child?.children || child.children.length < 3) continue;
        if (child.props._docType !== 'tuple') continue;
        if (child.children[0] !== SYS_A.DONE_STATE_MAPPING) continue;

        result.push({
          tagDefId: tdId,
          attrDefId: child.children[1],
          checkedOptionId: child.children[2],
          uncheckedOptionId: child.children[3],
        });
      }
    }
  }

  return result;
}

/**
 * Forward mapping: checkbox state changed → which field values to update.
 *
 * When isDone=true, returns the checkedOptionId for each mapping.
 * When isDone=false, returns the uncheckedOptionId (if configured).
 */
export function resolveForwardDoneMapping(
  nodeId: string,
  isDone: boolean,
  entities: Record<string, NodexNode>,
): Array<{ attrDefId: string; optionNodeId: string }> {
  const mappings = getDoneStateMappings(nodeId, entities);
  const result: Array<{ attrDefId: string; optionNodeId: string }> = [];

  for (const m of mappings) {
    if (isDone) {
      result.push({ attrDefId: m.attrDefId, optionNodeId: m.checkedOptionId });
    } else if (m.uncheckedOptionId) {
      result.push({ attrDefId: m.attrDefId, optionNodeId: m.uncheckedOptionId });
    }
  }

  return result;
}

/**
 * Reverse mapping: Options field value changed → should checkbox change?
 *
 * Returns { newDone: true } if the new option matches checkedOptionId,
 * { newDone: false } if it matches uncheckedOptionId,
 * or null if no mapping applies.
 */
export function resolveReverseDoneMapping(
  nodeId: string,
  attrDefId: string,
  newOptionId: string,
  entities: Record<string, NodexNode>,
): { newDone: boolean } | null {
  const mappings = getDoneStateMappings(nodeId, entities);

  for (const m of mappings) {
    if (m.attrDefId !== attrDefId) continue;
    if (newOptionId === m.checkedOptionId) return { newDone: true };
    if (m.uncheckedOptionId && newOptionId === m.uncheckedOptionId) return { newDone: false };
  }

  return null;
}

// ─── Internal helpers ───

function tagDefHasShowCheckbox(
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

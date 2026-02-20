/**
 * Pure functions for checkbox visibility, done-state, and state transitions.
 *
 * ## Three-state model
 *
 * Each node has one of three checkbox states:
 *
 * | `completedAt` value | State       | Visual                          |
 * |---------------------|-------------|---------------------------------|
 * | `undefined`         | No checkbox | Normal text, no checkbox shown  |
 * | `0`                 | Undone      | Empty checkbox, normal text     |
 * | `> 0` (ts)          | Done        | Green check, dimmed text        |
 *
 * `completedAt = 0` is a sentinel: epoch-zero is never a valid completion time,
 * so it safely encodes "has checkbox, not yet done".
 *
 * ## Visibility rules
 *
 * A checkbox is visible when:
 * 1. Any supertag has showCheckbox = true (tag-driven, always visible), OR
 * 2. `completedAt !== undefined` (manual, added via Cmd+Enter)
 *
 * ## Interactions
 *
 * - **Click checkbox**: toggles between undone ↔ done (never removes checkbox)
 * - **Cmd+Enter** (manual nodes): cycles No → Undone → Done → No
 * - **Cmd+Enter** (tag-driven nodes): toggles undone ↔ done (tag keeps checkbox)
 */
import type { NodexNode } from '../types/node.js';
import * as loroDoc from './loro-doc.js';

export interface CheckboxState {
  showCheckbox: boolean;
  isDone: boolean;
}

/**
 * Determine checkbox visibility and done state for a node.
 */
export function shouldNodeShowCheckbox(node: NodexNode): CheckboxState {
  const isDone = node.completedAt !== undefined && node.completedAt > 0;

  // Tag-driven: any supertag has showCheckbox = true
  if (hasTagShowCheckbox(node)) {
    return { showCheckbox: true, isDone };
  }

  // Manual: completedAt !== undefined (includes 0 for undone sentinel)
  if (node.completedAt !== undefined) {
    return { showCheckbox: true, isDone };
  }

  return { showCheckbox: false, isDone: false };
}

/**
 * Check if any of the node's supertags has showCheckbox = true.
 * Also walks each tagDef's extends chain.
 */
export function hasTagShowCheckbox(node: NodexNode): boolean {
  for (const tagDefId of node.tags) {
    if (tagDefHasShowCheckbox(tagDefId)) return true;
  }
  return false;
}

function tagDefHasShowCheckbox(tagDefId: string, visited = new Set<string>()): boolean {
  if (visited.has(tagDefId)) return false;
  visited.add(tagDefId);
  const td = loroDoc.toNodexNode(tagDefId);
  if (!td) return false;
  if (td.showCheckbox) return true;
  if (td.extends) return tagDefHasShowCheckbox(td.extends, visited);
  return false;
}

// ─── Click / Cycle results ───

export interface CheckboxClickResult {
  completedAt: number | undefined;
  /** Forward done-state mappings: field values to set when done state changes. */
  doneMappings?: Array<{ fieldDefId: string; optionId: string }>;
}

/**
 * Resolve result when clicking the checkbox.
 *
 * Click only toggles between undone ↔ done. It never removes the checkbox.
 *
 * - Tag-driven: done → undefined (tag keeps checkbox visible), undone → now + forward mappings
 * - Manual: done → 0 (keep checkbox, undone), undone → now
 */
export function resolveCheckboxClick(node: NodexNode): CheckboxClickResult {
  const hasTag = hasTagShowCheckbox(node);
  const isDone = node.completedAt !== undefined && node.completedAt > 0;

  if (isDone) {
    // Done → undone
    return { completedAt: hasTag ? undefined : 0 };
  }

  // Undone → done: compute forward mappings
  const now = Date.now();
  const doneMappings = resolveForwardDoneMapping(node, true);
  return {
    completedAt: now,
    doneMappings: doneMappings.length > 0 ? doneMappings : undefined,
  };
}

/**
 * Resolve result for Cmd+Enter cycle.
 *
 * - Tag-driven: 2-state toggle (undone ↔ done)
 * - Manual: 3-state cycle (No → Undone → Done → No)
 */
export function resolveCmdEnterCycle(node: NodexNode): { completedAt: number | undefined } {
  const hasTag = hasTagShowCheckbox(node);
  const isDone = node.completedAt !== undefined && node.completedAt > 0;

  if (hasTag) {
    // Tag-driven: 2-state toggle
    return { completedAt: isDone ? undefined : Date.now() };
  }

  // Manual: 3-state cycle
  if (node.completedAt === undefined) return { completedAt: 0 };       // No → Undone
  if (node.completedAt === 0) return { completedAt: Date.now() };      // Undone → Done
  return { completedAt: undefined };                                     // Done → No
}

// ─── Done State Mapping ───

export interface DoneStateMapping {
  tagDefId: string;
  fieldDefId: string;
  checkedOptionIds: string[];
  uncheckedOptionIds: string[];
}

/**
 * Get all done-state mapping configs from a node's supertags (including Extend chain).
 * Reads from LoroDoc's DoneMapping storage (set via loroDoc.addDoneMappingEntry).
 */
export function getDoneStateMappings(node: NodexNode): DoneStateMapping[] {
  const result: DoneStateMapping[] = [];

  for (const tagDefId of node.tags) {
    const tagDef = loroDoc.toNodexNode(tagDefId);
    if (!tagDef?.doneStateEnabled) continue;

    // Collect from tagDef and its entire extends chain
    const chain = getExtendsChainWithSelf(tagDefId);
    for (const tdId of chain) {
      const td = loroDoc.toNodexNode(tdId);
      if (!td?.doneStateEnabled) continue;

      const checkedEntries = loroDoc.getDoneMappings(tdId, true);
      const uncheckedEntries = loroDoc.getDoneMappings(tdId, false);

      // Group by fieldDefId
      const byField = new Map<string, { checked: string[]; unchecked: string[] }>();
      for (const e of checkedEntries) {
        if (!byField.has(e.fieldDefId)) byField.set(e.fieldDefId, { checked: [], unchecked: [] });
        byField.get(e.fieldDefId)!.checked.push(e.optionId);
      }
      for (const e of uncheckedEntries) {
        if (!byField.has(e.fieldDefId)) byField.set(e.fieldDefId, { checked: [], unchecked: [] });
        byField.get(e.fieldDefId)!.unchecked.push(e.optionId);
      }

      for (const [fieldDefId, { checked, unchecked }] of byField) {
        result.push({
          tagDefId: tdId,
          fieldDefId,
          checkedOptionIds: checked,
          uncheckedOptionIds: unchecked,
        });
      }
    }
  }

  return result;
}

function getExtendsChainWithSelf(tagDefId: string): string[] {
  const chain: string[] = [];
  const visited = new Set<string>();

  function walk(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    chain.push(id);
    const td = loroDoc.toNodexNode(id);
    if (td?.extends) walk(td.extends);
  }
  walk(tagDefId);
  return chain;
}

/**
 * Forward mapping: checkbox state changed → which field values to update.
 *
 * When isDone=true, returns the first checkedOptionId for each mapping.
 * When isDone=false, returns the first uncheckedOptionId (if configured).
 */
export function resolveForwardDoneMapping(
  node: NodexNode,
  isDone: boolean,
): Array<{ fieldDefId: string; optionId: string }> {
  const mappings = getDoneStateMappings(node);
  const result: Array<{ fieldDefId: string; optionId: string }> = [];

  for (const m of mappings) {
    if (isDone) {
      if (m.checkedOptionIds.length > 0) {
        result.push({ fieldDefId: m.fieldDefId, optionId: m.checkedOptionIds[0] });
      }
    } else {
      if (m.uncheckedOptionIds.length > 0) {
        result.push({ fieldDefId: m.fieldDefId, optionId: m.uncheckedOptionIds[0] });
      }
    }
  }

  return result;
}

/**
 * Reverse mapping: Options field value changed → should checkbox change?
 *
 * Returns { newDone: true } if the new option matches ANY checkedOptionId,
 * { newDone: false } if it matches ANY uncheckedOptionId,
 * or null if no mapping applies.
 */
export function resolveReverseDoneMapping(
  node: NodexNode,
  fieldDefId: string,
  newOptionId: string,
): { newDone: boolean } | null {
  const mappings = getDoneStateMappings(node);

  for (const m of mappings) {
    if (m.fieldDefId !== fieldDefId) continue;
    if (m.checkedOptionIds.includes(newOptionId)) return { newDone: true };
    if (m.uncheckedOptionIds.includes(newOptionId)) return { newDone: false };
  }

  return null;
}

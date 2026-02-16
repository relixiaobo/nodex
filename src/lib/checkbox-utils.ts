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
import { getExtendsChain, resolveConfigValue } from './field-utils.js';

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
  checkedOptionIds: string[];
  uncheckedOptionIds: string[];
}

/**
 * Check if a tagDef has the Done State Mapping toggle enabled (NDX_A06 = YES).
 * Returns true if toggle is ON, false if OFF or absent.
 * Also returns true for legacy format where NDX_A06 tuple has >= 3 children (old model).
 */
function hasDoneMappingEnabled(
  tagDefId: string,
  entities: Record<string, NodexNode>,
): boolean {
  const td = entities[tagDefId];
  if (!td) return false;
  const val = resolveConfigValue(entities, td, SYS_A.DONE_STATE_MAPPING);
  if (val === SYS_V.YES) return true;
  if (val === SYS_V.NO || val === undefined) return false;
  // Legacy format: value is an attrDefId (not SYS_V*) → treat as enabled
  return true;
}

/**
 * Collect legacy NDX_A06 mappings from a single tagDef (old format: children.length >= 3).
 */
function collectLegacyMappings(
  tdId: string,
  entities: Record<string, NodexNode>,
): DoneStateMapping[] {
  const td = entities[tdId];
  if (!td?.children) return [];

  const result: DoneStateMapping[] = [];
  for (const childId of td.children) {
    const child = entities[childId];
    if (!child?.children || child.children.length < 3) continue;
    if (child.props._docType !== 'tuple') continue;
    if (child.children[0] !== SYS_A.DONE_STATE_MAPPING) continue;

    result.push({
      tagDefId: tdId,
      attrDefId: child.children[1],
      checkedOptionIds: [child.children[2]],
      uncheckedOptionIds: child.children[3] ? [child.children[3]] : [],
    });
  }
  return result;
}

/**
 * Collect new-format NDX_A07/NDX_A08 mappings from a single tagDef.
 * NDX_A07/A08 tuples are nested children of the NDX_A06 toggle tuple.
 * Groups by attrDefId into one DoneStateMapping per field.
 */
function collectNewMappings(
  tdId: string,
  entities: Record<string, NodexNode>,
): DoneStateMapping[] {
  const td = entities[tdId];
  if (!td?.children) return [];

  // Collect mapping entries from two sources:
  // 1. Nested children of NDX_A06 toggle tuple (legacy nested format)
  // 2. AssociatedData of NDX_A07/NDX_A08 field tuples (unified format)
  const byAttrDef = new Map<string, { checked: string[]; unchecked: string[] }>();

  function addEntry(key: string, attrDefId: string, optionId: string) {
    if (!byAttrDef.has(attrDefId)) {
      byAttrDef.set(attrDefId, { checked: [], unchecked: [] });
    }
    const entry = byAttrDef.get(attrDefId)!;
    if (key === SYS_A.DONE_MAP_CHECKED) {
      entry.checked.push(optionId);
    } else {
      entry.unchecked.push(optionId);
    }
  }

  for (const childId of td.children) {
    const child = entities[childId];
    if (!child?.children || child.props._docType !== 'tuple') continue;
    const childKey = child.children[0];

    // Source 1: NDX_A06 toggle tuple with nested children (children[2+] are entry IDs)
    if (childKey === SYS_A.DONE_STATE_MAPPING) {
      for (const nestedId of child.children) {
        const nested = entities[nestedId];
        if (!nested?.children || nested.children.length < 3) continue;
        if (nested.props._docType !== 'tuple') continue;
        const nKey = nested.children[0];
        if (nKey !== SYS_A.DONE_MAP_CHECKED && nKey !== SYS_A.DONE_MAP_UNCHECKED) continue;
        addEntry(nKey, nested.children[1], nested.children[2]);
      }
      continue;
    }

    // Source 2: NDX_A07/A08 field tuples — entries in AssociatedData (unified format)
    if (childKey === SYS_A.DONE_MAP_CHECKED || childKey === SYS_A.DONE_MAP_UNCHECKED) {
      const assocId = td.associationMap?.[childId];
      if (assocId) {
        const assoc = entities[assocId];
        if (assoc?.children) {
          for (const entryId of assoc.children) {
            const entry = entities[entryId];
            if (entry?.children && entry.children.length >= 3 && entry.props._docType === 'tuple') {
              addEntry(childKey, entry.children[1], entry.children[2]);
            }
          }
        }
      }
    }
  }

  const result: DoneStateMapping[] = [];
  for (const [attrDefId, { checked, unchecked }] of byAttrDef) {
    result.push({
      tagDefId: tdId,
      attrDefId,
      checkedOptionIds: checked,
      uncheckedOptionIds: unchecked,
    });
  }
  return result;
}

/**
 * Detect whether a tagDef uses legacy (NDX_A06 with >= 3 children) or new format.
 */
function isLegacyFormat(tdId: string, entities: Record<string, NodexNode>): boolean {
  const td = entities[tdId];
  if (!td?.children) return false;

  for (const childId of td.children) {
    const child = entities[childId];
    if (!child?.children || child.children.length < 3) continue;
    if (child.props._docType !== 'tuple') continue;
    if (child.children[0] !== SYS_A.DONE_STATE_MAPPING) continue;
    // New nested format has SYS_V.YES/NO as children[1]; legacy has attrDefId
    if (child.children[1] === SYS_V.YES || child.children[1] === SYS_V.NO) return false;
    return true;
  }
  return false;
}

/**
 * Get all done-state mapping configs from a node's supertags (including Extend chain).
 *
 * New format: NDX_A06 toggle + NDX_A07/NDX_A08 multi-value tuples.
 * Legacy format: NDX_A06 tuple with [key, attrDefId, checkedOptionId, uncheckedOptionId?].
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
      // Check if the toggle is enabled (for new format) or has legacy mapping
      if (!hasDoneMappingEnabled(tdId, entities)) continue;

      if (isLegacyFormat(tdId, entities)) {
        result.push(...collectLegacyMappings(tdId, entities));
      } else {
        result.push(...collectNewMappings(tdId, entities));
      }
    }
  }

  return result;
}

/**
 * Forward mapping: checkbox state changed → which field values to update.
 *
 * When isDone=true, returns the first checkedOptionId for each mapping.
 * When isDone=false, returns the first uncheckedOptionId (if configured).
 * Skips mappings where the relevant array is empty.
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
      if (m.checkedOptionIds.length > 0) {
        result.push({ attrDefId: m.attrDefId, optionNodeId: m.checkedOptionIds[0] });
      }
    } else {
      if (m.uncheckedOptionIds.length > 0) {
        result.push({ attrDefId: m.attrDefId, optionNodeId: m.uncheckedOptionIds[0] });
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
  nodeId: string,
  attrDefId: string,
  newOptionId: string,
  entities: Record<string, NodexNode>,
): { newDone: boolean } | null {
  const mappings = getDoneStateMappings(nodeId, entities);

  for (const m of mappings) {
    if (m.attrDefId !== attrDefId) continue;
    if (m.checkedOptionIds.includes(newOptionId)) return { newDone: true };
    if (m.uncheckedOptionIds.includes(newOptionId)) return { newDone: false };
  }

  return null;
}

// ─── Internal helpers ───

function tagDefHasShowCheckbox(
  tagDefId: string,
  entities: Record<string, NodexNode>,
): boolean {
  const tagDef = entities[tagDefId];
  if (!tagDef) return false;
  return resolveConfigValue(entities, tagDef, SYS_A.SHOW_CHECKBOX) === SYS_V.YES;
}

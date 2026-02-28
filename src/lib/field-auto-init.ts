/**
 * Field auto-initialization strategy resolvers.
 *
 * When a tag is applied and a fieldDef has autoInitialize set to a strategy name,
 * these functions resolve the initial value for the field.
 */
import { AUTO_INIT_STRATEGY, type AutoInitStrategy } from '../types/index.js';
import * as loroDoc from './loro-doc.js';

// ─── Structured result type ───

export type AutoInitResult =
  | { kind: 'text'; value: string }
  | { kind: 'reference'; targetId: string };

/**
 * Resolve the auto-init value for a field based on the configured strategy.
 * Returns a structured result or null if the strategy can't produce a value.
 */
export function resolveAutoInitValue(
  nodeId: string,
  fieldDefId: string,
  strategy: AutoInitStrategy,
): AutoInitResult | null {
  switch (strategy) {
    case AUTO_INIT_STRATEGY.ANCESTOR_SUPERTAG_REF:
      return resolveAncestorSupertagRef(nodeId, fieldDefId);
    case AUTO_INIT_STRATEGY.CURRENT_DATE:
      return wrapText(resolveCurrentDate());
    case AUTO_INIT_STRATEGY.ANCESTOR_DAY_NODE:
      return wrapText(resolveAncestorDayNode(nodeId));
    case AUTO_INIT_STRATEGY.ANCESTOR_FIELD_VALUE:
      return wrapText(resolveAncestorFieldValue(nodeId, fieldDefId));
    default:
      return null;
  }
}

/** Wrap a nullable string as a text result. */
function wrapText(value: string | null): AutoInitResult | null {
  return value ? { kind: 'text', value } : null;
}

// ─── Strategy resolvers ───

/** Return today's date as ISO date string (YYYY-MM-DD). */
function resolveCurrentDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Walk up the parent chain to find a Day node ancestor.
 * Day nodes have `props.docType === 'date'` and store their date in `name`.
 * Returns the date string or null.
 */
function resolveAncestorDayNode(nodeId: string): string | null {
  const visited = new Set<string>();
  let current = loroDoc.getParentId(nodeId);

  while (current && !visited.has(current)) {
    visited.add(current);
    const node = loroDoc.toNodexNode(current);
    if (!node) break;

    // Day nodes are tagged with sys:day and have a date-like name (YYYY-MM-DD)
    if (node.tags.includes('sys:day') && node.name) {
      return node.name;
    }

    current = loroDoc.getParentId(current);
  }

  return null;
}

/**
 * Walk up the parent chain to find an ancestor that has a fieldEntry
 * for the same fieldDefId with a non-empty value.
 * Returns the first value node's name (text content), or null.
 */
function resolveAncestorFieldValue(nodeId: string, fieldDefId: string): string | null {
  const visited = new Set<string>();
  let current = loroDoc.getParentId(nodeId);

  while (current && !visited.has(current)) {
    visited.add(current);

    // Look for a fieldEntry with matching fieldDefId
    const children = loroDoc.getChildren(current);
    for (const cid of children) {
      const child = loroDoc.toNodexNode(cid);
      if (child?.type !== 'fieldEntry' || child.fieldDefId !== fieldDefId) continue;

      // Found a matching fieldEntry — check for value children
      const valueChildren = loroDoc.getChildren(cid);
      if (valueChildren.length > 0) {
        const firstValue = loroDoc.toNodexNode(valueChildren[0]);
        if (firstValue?.name) return firstValue.name;
        // For option references, return targetId
        if (firstValue?.targetId) return firstValue.targetId;
      }
    }

    current = loroDoc.getParentId(current);
  }

  return null;
}

/**
 * Walk up the parent chain to find the nearest ancestor tagged with
 * the fieldDef's sourceSupertag. Returns a reference result.
 */
function resolveAncestorSupertagRef(nodeId: string, fieldDefId: string): AutoInitResult | null {
  const fieldDef = loroDoc.toNodexNode(fieldDefId);
  const targetTagDefId = fieldDef?.sourceSupertag;
  if (!targetTagDefId) return null;

  const visited = new Set<string>();
  let current = loroDoc.getParentId(nodeId);

  while (current && !visited.has(current)) {
    visited.add(current);
    const node = loroDoc.toNodexNode(current);
    if (!node) break;

    if (node.tags.includes(targetTagDefId)) {
      return { kind: 'reference', targetId: current };
    }

    current = loroDoc.getParentId(current);
  }

  return null;
}

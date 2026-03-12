/**
 * Shared utilities for AI tools — extracted from node-tool.ts.
 *
 * Contains tag resolution, field resolution, and common helpers
 * used across create, read, edit, delete, and search tools.
 */
import { nanoid } from 'nanoid';
import { FIELD_TYPES, SYSTEM_NODE_IDS } from '../../types/index.js';
import { fuzzySort } from '../fuzzy-search.js';
import * as loroDoc from '../loro-doc.js';
import { AI_COMMIT_ORIGIN, commitDoc, withCommitOrigin } from '../loro-doc.js';
import { isNodeInTrash, isWorkspaceHomeNode } from '../node-capabilities.js';
import { isOutlinerContentNodeType } from '../node-type-utils.js';
import { resolveDataType } from '../field-utils.js';
import { computeNodeFields } from '../../hooks/use-node-fields.js';
import { applyTagMutationsNoCommit, syncTemplateMutationsNoCommit, useNodeStore } from '../../stores/node-store.js';

// ─── Constants ───

export const MAX_READ_DEPTH = 3;
export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 20;

// ─── Tag helpers ───

export function normalizeTagName(tagName: string): string {
  return tagName.replace(/^#/, '').trim().toLowerCase();
}

export function findTagDefIdByName(tagName: string): string | null {
  const normalized = normalizeTagName(tagName);
  const candidates = loroDoc.getChildren(SYSTEM_NODE_IDS.SCHEMA)
    .map((childId) => loroDoc.toNodexNode(childId))
    .filter((node): node is NonNullable<ReturnType<typeof loroDoc.toNodexNode>> => node !== null && node.type === 'tagDef');

  const exact = candidates.find((node) => normalizeTagName(node.name ?? '') === normalized);
  if (exact) return exact.id;

  const fuzzy = fuzzySort(
    candidates.map((node) => ({ id: node.id, name: node.name ?? '' })),
    normalized,
    (item) => item.name,
    1,
  )[0];

  if (fuzzy && fuzzy._fuzzyScore >= 10) {
    return fuzzy.id;
  }

  return null;
}

export function ensureTagDefIdByName(tagName: string): string {
  const existing = findTagDefIdByName(tagName);
  if (existing) return existing;

  const created = withCommitOrigin(AI_COMMIT_ORIGIN, () =>
    useNodeStore.getState().createTagDef(normalizeTagName(tagName)),
  );
  return created.id;
}

export function getTagDisplayNames(tagIds: string[]): string[] {
  return tagIds
    .map((tagId) => loroDoc.toNodexNode(tagId)?.name?.trim() ?? '')
    .filter(Boolean);
}

// ─── Text helpers ───

export function stripReferenceMarkup(text: string): string {
  return text.replace(/<(ref|cite)\s+id="[^"]+">([\s\S]*?)<\/\1>/g, '$2');
}

const DIRECT_NODE_DATA_BLOCKED_KEYS = new Set([
  'id',
  'children',
  'tags',
  'createdAt',
  'updatedAt',
  'name',
  'richText',
  'marks',
  'inlineRefs',
]);

interface SanitizeDirectNodeDataOptions {
  allowType?: boolean;
}

export function sanitizeDirectNodeDataPatch(
  data: Record<string, unknown> | undefined,
  options: SanitizeDirectNodeDataOptions = {},
): {
  safeData: Record<string, unknown>;
  blockedKeys: string[];
} {
  if (!data) {
    return { safeData: {}, blockedKeys: [] };
  }

  const blockedKeys: string[] = [];
  const safeData: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (DIRECT_NODE_DATA_BLOCKED_KEYS.has(key) || (key === 'type' && !options.allowType)) {
      blockedKeys.push(key);
      continue;
    }

    if (key === 'description' && typeof value === 'string') {
      safeData.description = stripReferenceMarkup(value) || undefined;
      continue;
    }

    safeData[key] = value;
  }

  return { safeData, blockedKeys };
}

// ─── Node inspection helpers ───

export function toCheckedValue(nodeId: string): boolean | null {
  const node = loroDoc.toNodexNode(nodeId);
  if (!node) return null;
  if (node.completedAt == null) return null;
  return node.completedAt > 0;
}

export function isSearchCandidate(nodeId: string): boolean {
  if (isWorkspaceHomeNode(nodeId)) return false;
  if (isNodeInTrash(nodeId)) return false;
  const node = loroDoc.toNodexNode(nodeId);
  if (!node) return false;
  if (node.locked) return false;
  return isOutlinerContentNodeType(node.type);
}

// ─── Checked state ───

export function updateCheckedState(nodeId: string, checked: boolean | null): boolean {
  const node = loroDoc.toNodexNode(nodeId);
  if (!node) return false;

  const nextCompletedAt = checked === null ? undefined : (checked ? Date.now() : 0);
  if (nextCompletedAt === undefined) {
    loroDoc.deleteNodeData(nodeId, 'completedAt');
  } else {
    loroDoc.setNodeData(nodeId, 'completedAt', nextCompletedAt);
  }
  return true;
}

// ─── Field resolution + setting ───

/**
 * Find a fieldDef ID by display name, searching across a node's applied tags.
 * Returns null if no matching fieldDef found.
 */
function findFieldDefByName(nodeId: string, fieldName: string): string | null {
  const store = useNodeStore.getState();
  const fields = computeNodeFields(store.getNode, store.getChildren, nodeId);
  const normalized = fieldName.trim().toLowerCase();

  // Exact match first
  const exact = fields.find((f) => f.attrDefName.trim().toLowerCase() === normalized);
  if (exact) return exact.fieldDefId;

  // Fuzzy fallback
  const fuzzy = fuzzySort(
    fields.map((f) => ({ id: f.fieldDefId, name: f.attrDefName })),
    normalized,
    (item) => item.name,
    1,
  )[0];

  if (fuzzy && fuzzy._fuzzyScore >= 10) {
    return fuzzy.id;
  }

  return null;
}

/**
 * Find the fieldEntry ID for a given fieldDef on a node.
 */
function findFieldEntryId(nodeId: string, fieldDefId: string): string | null {
  const children = loroDoc.getChildren(nodeId);
  for (const cid of children) {
    const c = loroDoc.toNodexNode(cid);
    if (c?.type === 'fieldEntry' && c.fieldDefId === fieldDefId) {
      return cid;
    }
  }
  return null;
}

/**
 * Find an existing option node under a fieldDef by display name.
 */
function findOptionByName(fieldDefId: string, optionName: string): string | null {
  const normalized = optionName.trim().toLowerCase();
  const children = loroDoc.getChildren(fieldDefId);
  for (const cid of children) {
    const child = loroDoc.toNodexNode(cid);
    if (child?.name && child.name.trim().toLowerCase() === normalized) {
      return cid;
    }
  }
  return null;
}

export interface FieldSetResult {
  resolved: string[];
  created: string[];
  unresolved: string[];
}

/**
 * Infer field type from the field name and value.
 * - date/deadline/due → date
 * - url/link/website → url
 * - email → email
 * - count/number/amount/price/cost/qty/quantity → number
 * - otherwise → options (most versatile for categorical values like status/priority)
 */
function inferFieldType(fieldName: string, value: string): string {
  const n = fieldName.trim().toLowerCase();
  const v = value.trim().toLowerCase();

  // Date patterns
  if (/\b(date|deadline|due|start|end|expire|created|updated|birthday)\b/.test(n)) {
    return FIELD_TYPES.DATE;
  }

  // URL patterns
  if (/\b(url|link|website|homepage)\b/.test(n) || /^https?:\/\//.test(v)) {
    return FIELD_TYPES.URL;
  }

  // Email patterns
  if (/\b(email|e-mail)\b/.test(n) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    return FIELD_TYPES.EMAIL;
  }

  // Number patterns
  if (/\b(count|number|amount|price|cost|qty|quantity|score|rating|age|weight|height)\b/.test(n)) {
    return FIELD_TYPES.NUMBER;
  }

  // Default: options (status, priority, category, type, etc.)
  return FIELD_TYPES.OPTIONS;
}

/**
 * Create a fieldDef under a tagDef without committing.
 * Field type is inferred from name and value.
 */
function createFieldDefNoCommit(fieldName: string, tagDefId: string, value: string): string {
  const id = nanoid();
  loroDoc.createNode(id, tagDefId);
  loroDoc.setNodeDataBatch(id, {
    type: 'fieldDef',
    name: fieldName.trim(),
    fieldType: inferFieldType(fieldName, value),
    cardinality: 'single',
    nullable: true,
  });
  return id;
}

/**
 * Resolve and set fields on a node by display name → value.
 * Handles type dispatch: options → selectFieldOption + autoCollect; plain → setFieldValue.
 *
 * When a field name can't be found on existing tag definitions, and the node
 * has at least one tag, auto-creates the fieldDef under the first tag with
 * type inferred from name/value. This lets the AI bootstrap new schemas.
 *
 * Must be called inside withCommitOrigin(AI_COMMIT_ORIGIN, ...).
 */
export function resolveAndSetFields(
  nodeId: string,
  fields: Record<string, string>,
): FieldSetResult {
  const store = useNodeStore.getState();
  const resolved: string[] = [];
  const created: string[] = [];
  const unresolved: string[] = [];

  for (const [fieldName, value] of Object.entries(fields)) {
    let fieldDefId = findFieldDefByName(nodeId, fieldName);

    // Auto-create: if field doesn't exist but node has a tag, create the fieldDef
    if (!fieldDefId) {
      const node = loroDoc.toNodexNode(nodeId);
      const firstTagId = node?.tags?.[0];
      if (firstTagId) {
        fieldDefId = createFieldDefNoCommit(fieldName, firstTagId, value);
        // Sync template so the node picks up the new field definition
        syncTemplateMutationsNoCommit(nodeId);
        created.push(fieldName);
      } else {
        unresolved.push(fieldName);
        continue;
      }
    }

    const dataType = resolveDataType(fieldDefId);

    if (dataType === FIELD_TYPES.OPTIONS || dataType === FIELD_TYPES.OPTIONS_FROM_SUPERTAG) {
      // Options field: find or auto-collect the option, then select it
      const feId = findFieldEntryId(nodeId, fieldDefId);
      const existingOption = findOptionByName(fieldDefId, value);

      if (existingOption) {
        // Option exists — select it via the fieldEntry
        if (feId) {
          store.selectFieldOption(feId, existingOption);
        } else {
          // No fieldEntry yet — use setOptionsFieldValue which creates one
          store.setOptionsFieldValue(nodeId, fieldDefId, existingOption);
        }
      } else {
        // Option doesn't exist — auto-collect (creates option + sets value)
        store.autoCollectOption(nodeId, fieldDefId, value.trim());
      }
    } else {
      // Plain/URL/password/etc — set as text value
      store.setFieldValue(nodeId, fieldDefId, [value]);
    }
    resolved.push(fieldName);
  }

  return { resolved, created, unresolved };
}

// ─── Result formatting ───

export function formatResultText(result: unknown): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Shared utilities for AI tools — extracted from node-tool.ts.
 *
 * Contains tag resolution, field resolution, and common helpers
 * used across create, read, edit, delete, and search tools.
 */
import { Type } from '@mariozechner/pi-ai';
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
import type { ParsedTanaPasteField, ParsedTanaPasteValue } from './tana-paste-parser.js';

// ─── Constants ───

export const MAX_READ_DEPTH = 3;
export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 20;

// ─── Search rules schema (shared between node_search and node_create type="search") ───

export const searchRulesSchema = Type.Object({
  query: Type.Optional(Type.String({ description: 'Text filter on node name and description.' })),
  searchTags: Type.Optional(Type.Array(Type.String(), { description: 'Tag display names. AND logic — results must have ALL tags. Unknown tags are skipped and reported.' })),
  fields: Type.Optional(Type.Record(Type.String(), Type.String(), { description: 'Field value filters by display name, e.g. {"Status": "Done"}. Unknown fields are skipped and reported.' })),
  linkedTo: Type.Optional(Type.String({ description: 'Node ID — find nodes that reference (link to) this node.' })),
  scopeId: Type.Optional(Type.String({ description: 'Node ID — restrict results to this node and its descendants.' })),
  parentId: Type.Optional(Type.String({ description: 'Deprecated alias for scopeId.' })),
  after: Type.Optional(Type.String({ description: 'Creation date lower bound (inclusive). Format: YYYY-MM-DD, e.g. "2026-03-01".' })),
  before: Type.Optional(Type.String({ description: 'Creation date upper bound (inclusive). Format: YYYY-MM-DD, e.g. "2026-03-31".' })),
  sortBy: Type.Optional(Type.String({ description: 'Sort order. Format: "field" or "field:order". Fields: relevance, created, modified, name, refCount. Order: asc or desc (default desc). Example: "created:desc".' })),
}, { description: 'Search conditions. Used by both node_search (one-time query) and node_create type="search" (persisted live query). Example: { searchTags: ["task"], fields: {"Status": "Todo"} }' });

export type SearchRules = typeof searchRulesSchema.static;

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

export function findFieldDefIdInSchema(fieldName: string): string | null {
  const normalized = fieldName.trim().toLowerCase();
  for (const tagDefId of loroDoc.getChildren(SYSTEM_NODE_IDS.SCHEMA)) {
    const tagDef = loroDoc.toNodexNode(tagDefId);
    if (tagDef?.type !== 'tagDef') continue;
    for (const childId of loroDoc.getChildren(tagDefId)) {
      const child = loroDoc.toNodexNode(childId);
      if (child?.type === 'fieldDef' && (child.name ?? '').trim().toLowerCase() === normalized) {
        return child.id;
      }
    }
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

function ensureFieldEntryIdNoCommit(nodeId: string, fieldDefId: string): string {
  const existing = findFieldEntryId(nodeId, fieldDefId);
  if (existing) return existing;
  const fieldEntryId = nanoid();
  loroDoc.createNode(fieldEntryId, nodeId);
  loroDoc.setNodeDataBatch(fieldEntryId, { type: 'fieldEntry', fieldDefId });
  return fieldEntryId;
}

function clearFieldEntryChildrenNoCommit(fieldEntryId: string): void {
  const oldChildren = loroDoc.getChildren(fieldEntryId);
  for (const oldId of oldChildren) {
    loroDoc.deleteNode(oldId);
  }
}

function createValueNodeNoCommit(parentId: string, value: ParsedTanaPasteValue): void {
  const valueNodeId = nanoid();
  loroDoc.createNode(valueNodeId, parentId);

  if (value.targetId) {
    loroDoc.setNodeData(valueNodeId, 'targetId', value.targetId);
    return;
  }

  if (value.inlineRefs.length > 0) {
    loroDoc.setNodeRichTextContent(valueNodeId, value.text, [], value.inlineRefs);
    return;
  }

  loroDoc.setNodeData(valueNodeId, 'name', value.text);
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

function ensureFieldDefIdForNode(
  nodeId: string,
  fieldName: string,
  sampleValue: string,
): { fieldDefId: string | null; created: boolean } {
  let fieldDefId = findFieldDefByName(nodeId, fieldName);
  if (fieldDefId) {
    return { fieldDefId, created: false };
  }

  const node = loroDoc.toNodexNode(nodeId);
  const firstTagId = node?.tags?.[0];
  if (!firstTagId) {
    return { fieldDefId: null, created: false };
  }

  fieldDefId = createFieldDefNoCommit(fieldName, firstTagId, sampleValue);
  syncTemplateMutationsNoCommit(nodeId);
  return { fieldDefId, created: true };
}

function setFieldValuesNoCommit(
  nodeId: string,
  fieldDefId: string,
  values: ParsedTanaPasteValue[],
): void {
  const dataType = resolveDataType(fieldDefId);
  const fieldEntryId = ensureFieldEntryIdNoCommit(nodeId, fieldDefId);
  clearFieldEntryChildrenNoCommit(fieldEntryId);

  if (values.length === 0) {
    return;
  }

  const shouldUseOptionsTargets = (
    dataType === FIELD_TYPES.OPTIONS || dataType === FIELD_TYPES.OPTIONS_FROM_SUPERTAG
  ) && values.every((value) => !value.targetId && value.inlineRefs.length === 0);

  if (shouldUseOptionsTargets) {
    for (const value of values) {
      const optionName = value.text.trim();
      if (!optionName) continue;
      let optionId = findOptionByName(fieldDefId, optionName);
      if (!optionId) {
        optionId = nanoid();
        loroDoc.createNode(optionId, fieldDefId);
        loroDoc.setNodeDataBatch(optionId, { name: optionName, autoCollected: true });
      }

      const valueNodeId = nanoid();
      loroDoc.createNode(valueNodeId, fieldEntryId);
      loroDoc.setNodeData(valueNodeId, 'targetId', optionId);
    }
    return;
  }

  for (const value of values) {
    createValueNodeNoCommit(fieldEntryId, value);
  }
}

export function resolveAndApplyFieldMutationsNoCommit(
  nodeId: string,
  fields: ParsedTanaPasteField[],
): FieldSetResult {
  const resolved: string[] = [];
  const created: string[] = [];
  const unresolved: string[] = [];

  for (const field of fields) {
    const sampleValue = field.values[0]?.text ?? '';
    const ensured = ensureFieldDefIdForNode(nodeId, field.name, sampleValue);
    if (!ensured.fieldDefId) {
      unresolved.push(field.name);
      continue;
    }

    if (ensured.created) {
      created.push(field.name);
    }

    setFieldValuesNoCommit(nodeId, ensured.fieldDefId, field.clear ? [] : field.values);
    resolved.push(field.name);
  }

  return { resolved, created, unresolved };
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
  const parsedFields: ParsedTanaPasteField[] = Object.entries(fields).map(([fieldName, value]) => ({
    name: fieldName,
    values: [{ text: value, inlineRefs: [] }],
    clear: false,
  }));
  return resolveAndApplyFieldMutationsNoCommit(nodeId, parsedFields);
}

export interface ParsedSortBy {
  field: 'relevance' | 'created' | 'modified' | 'name' | 'refCount';
  order: 'asc' | 'desc';
}

export function parseSortBy(sortBy: string | undefined): ParsedSortBy | null {
  if (!sortBy) return null;
  const trimmed = sortBy.trim();
  if (!trimmed) return null;

  const [rawField, rawOrder] = trimmed.split(':');
  const field = rawField?.trim() as ParsedSortBy['field'] | undefined;
  if (!field || !['relevance', 'created', 'modified', 'name', 'refCount'].includes(field)) {
    throw new Error(`Invalid sortBy field: ${rawField}`);
  }

  const order = (rawOrder?.trim() || 'desc') as ParsedSortBy['order'];
  if (order !== 'asc' && order !== 'desc') {
    throw new Error(`Invalid sortBy order: ${rawOrder}`);
  }

  return { field, order };
}

// ─── AI operation log (for undo reporting) ───

interface AiOpEntry {
  tool: string;
  nodeId: string;
  name: string;
}

const aiOpStack: AiOpEntry[] = [];

/** Push an operation record after a successful write tool call. */
export function pushAiOp(tool: string, nodeId: string, name: string): void {
  aiOpStack.push({ tool, nodeId, name });
}

/** Pop the most recent operation record (called by undo). */
export function popAiOp(): AiOpEntry | undefined {
  return aiOpStack.pop();
}

/** Reset the operation log (for tests). */
export function resetAiOpLog(): void {
  aiOpStack.length = 0;
}

// ─── Result formatting ───

export function formatResultText(result: unknown): string {
  return JSON.stringify(result, null, 2);
}

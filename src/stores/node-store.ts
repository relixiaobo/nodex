/**
 * soma 节点 Store — Loro 迁移后新版本
 *
 * 薄 Zustand wrapper，底层数据全部存在 LoroDoc 中。
 * - 不持有 entities 数据（getNode/getChildren 实时从 Loro 读取）
 * - 所有操作同步（Loro WASM 无网络 I/O）
 * - _version 计数器触发 React re-render
 */
import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { NodexNode, TextMark, InlineRefEntry, FieldType } from '../types/index.js';
import { CONTAINER_IDS, SYS_A, SYS_V, isJournalSystemTagId } from '../types/index.js';
import { isWorkspaceContainer } from '../lib/tree-utils.js';
import { getNodeCapabilities } from '../lib/node-capabilities.js';
import * as loroDoc from '../lib/loro-doc.js';
import { getTreeReferenceBlockReason } from '../lib/reference-rules.js';
import { resolveCheckboxClick, resolveCmdEnterCycle, resolveForwardDoneMapping, resolveReverseDoneMapping } from '../lib/checkbox-utils.js';
import { nextAutoColorKey } from '../lib/tag-colors.js';
import { runSearch } from '../lib/search-engine.js';
import { resolveAutoInit } from '../lib/field-auto-init.js';
import type { ParsedPasteNode } from '../lib/paste-parser.js';

// ============================================================
// Store 接口
// ============================================================

interface NodeStore {
  /** 版本计数器——Loro 变更时 +1，驱动 React re-render */
  _version: number;

  // ─── 读取 ───

  getNode(id: string): NodexNode | null;
  getChildren(parentId: string): NodexNode[];

  // ─── 树操作（同步） ───

  createChild(parentId: string, index?: number, data?: Partial<NodexNode>): NodexNode;
  createSibling(siblingId: string, data?: Partial<NodexNode>): NodexNode;
  /** Batch-create sibling nodes from parsed paste nodes. Returns last created top-level node ID (or null). Single commitDoc for undo. */
  createSiblingNodesFromPaste(
    afterNodeId: string,
    nodes: ParsedPasteNode[],
    options?: { commit?: boolean },
  ): string | null;
  /** Batch-create child nodes from parsed paste nodes. Returns last created top-level node ID (or null). */
  createChildNodesFromPaste(
    parentNodeId: string,
    nodes: ParsedPasteNode[],
    options?: { commit?: boolean },
  ): string | null;
  moveNodeTo(nodeId: string, newParentId: string, index?: number): void;
  indentNode(nodeId: string): void;
  outdentNode(nodeId: string): void;
  moveNodeUp(nodeId: string): void;
  moveNodeDown(nodeId: string): void;
  trashNode(nodeId: string): void;
  restoreNode(nodeId: string): void;
  hardDeleteNode(nodeId: string): void;
  emptyTrash(): void;
  /** Deep-duplicate a node and all its descendants, inserting as next sibling. */
  duplicateNode(nodeId: string): NodexNode | null;

  // ─── 内容编辑（同步） ───

  setNodeName(id: string, name: string): void;
  updateNodeContent(id: string, data: { name?: string; marks?: TextMark[]; inlineRefs?: InlineRefEntry[] }): void;
  updateNodeDescription(id: string, description: string): void;
  setNodeCodeLanguage(nodeId: string, language: string): void;
  applyParsedPasteMetadata(nodeId: string, node: ParsedPasteNode, options?: { commit?: boolean }): void;

  // ─── 标签操作 ───

  applyTag(nodeId: string, tagDefId: string): void;
  removeTag(nodeId: string, tagDefId: string): void;
  /** Batch-apply a tag to multiple nodes. Single commitDoc for undo. */
  batchApplyTag(nodeIds: string[], tagDefId: string): void;
  /** Batch-remove a tag from multiple nodes. Single commitDoc for undo. */
  batchRemoveTag(nodeIds: string[], tagDefId: string): void;
  createTagDef(name: string, options?: { showCheckbox?: boolean; color?: string }): NodexNode;
  /** Ensure node has all template fieldEntries + content clones for its tags. */
  syncTemplateFields(nodeId: string): void;

  // ─── 字段操作 ───

  createFieldDef(name: string, fieldType: FieldType, tagDefId: string): NodexNode;

  setFieldValue(nodeId: string, fieldDefId: string, values: string[]): void;
  setOptionsFieldValue(nodeId: string, fieldDefId: string, optionNodeId: string): void;
  selectFieldOption(fieldEntryId: string, optionNodeId: string, oldOptionNodeId?: string): void;
  clearFieldValue(nodeId: string, fieldDefId: string): void;
  addFieldToNode(nodeId: string, fieldDefId: string): void;
  addUnnamedFieldToNode(nodeId: string, afterChildId?: string): { fieldEntryId: string; fieldDefId: string };
  moveFieldEntry(currentParentId: string, fieldEntryId: string, newParentId: string, position?: number): void;
  removeField(nodeId: string, fieldEntryId: string): void;
  renameFieldDef(fieldDefId: string, newName: string): void;
  changeFieldType(fieldDefId: string, newType: string): void;
  addFieldOption(fieldDefId: string, name: string): string;
  removeFieldOption(fieldDefId: string, optionId: string): void;
  autoCollectOption(nodeId: string, fieldDefId: string, name: string): string;
  /** Register a name as an auto-collected option under fieldDef (no-op if already exists). */
  registerCollectedOption(fieldDefId: string, name: string): void;
  toggleCheckboxField(fieldEntryId: string): void;
  /** 旧 replaceFieldAttrDef */
  replaceFieldDef(nodeId: string, fieldEntryId: string, oldFieldDefId: string, newFieldDefId: string): void;

  // ─── Checkbox 操作 ───

  toggleNodeDone(nodeId: string): void;
  cycleNodeCheckbox(nodeId: string): void;

  // ─── 配置操作（直接属性，不再操作 Tuple） ───

  /** 设置节点的直接配置属性（tagDef/fieldDef 的配置字段） */
  setConfigValue(nodeId: string, configKey: string, value: unknown): void;
  addDoneMappingEntry(tagDefId: string, checked: boolean, fieldDefId: string, optionId: string): void;
  removeDoneMappingEntry(tagDefId: string, checked: boolean, index: number): void;

  // ─── Reference 操作（新设计：独立 reference 树节点） ───

  addReference(parentId: string, targetNodeId: string, position?: number): string;
  removeReference(refNodeId: string): void;
  startRefConversion(refNodeId: string, parentId: string, position: number): string;
  revertRefConversion(tempNodeId: string, targetNodeId: string, parentId: string): void;

  // ─── Search Node 操作 ───

  /**
   * Create or navigate to a search node for the given tagDefId.
   * If a search node for the same tag already exists in SEARCHES, returns its ID.
   * Otherwise creates a new search node with an AND group + HAS_TAG condition,
   * runs the initial search, and materializes results as reference children.
   * @returns The search node ID
   */
  createSearchNode(tagDefId: string): string;

  /**
   * Refresh search results for a search node.
   * Runs the query, diffs against existing reference children,
   * adds new matches and removes stale ones.
   * Uses 'system:refresh' commit origin (excluded from undo stack).
   */
  refreshSearchResults(searchNodeId: string): void;
  createNodeInSearchContext(searchNodeId: string, data?: Partial<NodexNode>): NodexNode;

  // ─── View 操作 ───

  /** Get the viewDef child node ID for a parent, or null if none exists. */
  getViewDefId(parentId: string): string | null;
  /** Set sort config on a parent node's viewDef (creates viewDef if needed). */
  setSortConfig(parentId: string, field: string, direction: 'asc' | 'desc'): void;
  /** Clear sort config (removes sortField/sortDirection from viewDef). */
  clearSort(parentId: string): void;
  /** Toggle view toolbar visibility on a node. */
  toggleToolbar(nodeId: string): void;
}

// ============================================================
// 辅助：找到 fieldEntry 节点
// ============================================================

function extractHasTagIds(searchNode: NodexNode): string[] {
  const tagDefIds: string[] = [];
  const conditions = searchNode.children.map((id) => loroDoc.toNodexNode(id)).filter((n): n is NodexNode => n !== null && n.type === 'queryCondition');
  function walk(cond: NodexNode): void {
    if (cond.queryLogic) { if (cond.queryLogic === 'NOT') return; for (const childId of cond.children) { const child = loroDoc.toNodexNode(childId); if (child?.type === 'queryCondition') walk(child); } }
    else if (cond.queryOp === 'HAS_TAG' && cond.queryTagDefId) { tagDefIds.push(cond.queryTagDefId); }
  }
  for (const cond of conditions) walk(cond);
  return tagDefIds;
}

function findFieldEntry(nodeId: string, fieldDefId: string): string | null {
  const children = loroDoc.getChildren(nodeId);
  for (const cid of children) {
    const c = loroDoc.toNodexNode(cid);
    if (c?.type === 'fieldEntry' && c.fieldDefId === fieldDefId) {
      return cid;
    }
  }
  return null;
}

function normalizeLookupName(name: string): string {
  return name.trim().toLowerCase();
}

function findTagDefIdByName(name: string): string | null {
  const lookup = normalizeLookupName(name);
  if (!lookup) return null;
  const schemaChildren = loroDoc.getChildren(CONTAINER_IDS.SCHEMA);
  for (const childId of schemaChildren) {
    const child = loroDoc.toNodexNode(childId);
    if (child?.type !== 'tagDef') continue;
    if (normalizeLookupName(child.name ?? '') === lookup) return childId;
  }
  return null;
}

function ensureTagDefByNameNoCommit(name: string): string {
  const normalized = name.trim();
  if (!normalized) return '';
  const existing = findTagDefIdByName(normalized);
  if (existing) return existing;

  const id = nanoid();
  const schemaTagCount = loroDoc
    .getChildren(CONTAINER_IDS.SCHEMA)
    .filter((cid) => loroDoc.toNodexNode(cid)?.type === 'tagDef')
    .length;

  loroDoc.createNode(id, CONTAINER_IDS.SCHEMA);
  loroDoc.setNodeDataBatch(id, {
    type: 'tagDef',
    name: normalized,
    color: nextAutoColorKey(schemaTagCount),
  });
  return id;
}

function findFieldDefIdByName(fieldName: string, preferredTagIds: string[] = []): string | null {
  const lookup = normalizeLookupName(fieldName);
  if (!lookup) return null;

  // First try template field defs owned by preferred tags.
  for (const tagId of preferredTagIds) {
    const refs = getTemplateFieldDefs(tagId);
    for (const ref of refs) {
      const fieldDef = loroDoc.toNodexNode(ref.fieldDefId);
      if (fieldDef?.type !== 'fieldDef') continue;
      if (normalizeLookupName(fieldDef.name ?? '') === lookup) return ref.fieldDefId;
    }
  }

  // Fallback to global lookup.
  for (const id of loroDoc.getAllNodeIds()) {
    const node = loroDoc.toNodexNode(id);
    if (node?.type !== 'fieldDef') continue;
    if (normalizeLookupName(node.name ?? '') === lookup) return id;
  }
  return null;
}

function ensureFieldDefByNameNoCommit(fieldName: string, preferredTagIds: string[] = []): string {
  const normalized = fieldName.trim();
  if (!normalized) return '';
  const existing = findFieldDefIdByName(normalized, preferredTagIds);
  if (existing) return existing;

  const ownerId = preferredTagIds[0] ?? CONTAINER_IDS.SCHEMA;
  const id = nanoid();
  loroDoc.createNode(id, ownerId);
  loroDoc.setNodeDataBatch(id, {
    type: 'fieldDef',
    name: normalized,
    fieldType: 'plain',
    cardinality: 'single',
    nullable: true,
  });
  return id;
}

function setFieldValueNoCommit(nodeId: string, fieldDefId: string, value: string): void {
  const normalized = value.trim();
  let fieldEntryId = findFieldEntry(nodeId, fieldDefId);
  if (!fieldEntryId) {
    fieldEntryId = nanoid();
    loroDoc.createNode(fieldEntryId, nodeId);
    loroDoc.setNodeDataBatch(fieldEntryId, { type: 'fieldEntry', fieldDefId });
  }

  const oldChildren = loroDoc.getChildren(fieldEntryId);
  for (const oldId of oldChildren) {
    loroDoc.deleteNode(oldId);
  }

  if (!normalized) return;
  const valueNodeId = nanoid();
  loroDoc.createNode(valueNodeId, fieldEntryId);
  loroDoc.setNodeData(valueNodeId, 'name', normalized);
}

function applyParsedPasteMetadataMutationsNoCommit(nodeId: string, node: ParsedPasteNode): void {
  const preferredTagIds: string[] = [];
  for (const tagName of node.tags ?? []) {
    const tagDefId = ensureTagDefByNameNoCommit(tagName);
    if (!tagDefId) continue;
    preferredTagIds.push(tagDefId);
    applyTagMutationsNoCommit(nodeId, tagDefId);
  }

  const nodeTagIds = loroDoc.toNodexNode(nodeId)?.tags ?? [];
  const lookupTagIds = [...preferredTagIds, ...nodeTagIds];

  for (const field of node.fields ?? []) {
    const fieldDefId = ensureFieldDefByNameNoCommit(field.name, lookupTagIds);
    if (!fieldDefId) continue;
    setFieldValueNoCommit(nodeId, fieldDefId, field.value);
  }
}

interface TemplateFieldRef {
  /** The actual field definition ID (always the fieldDef node, may live in SCHEMA) */
  fieldDefId: string;
  /**
   * The template origin node — the child of the tagDef that owns this template field.
   * For seed-data layout: same as fieldDefId (the fieldDef IS under the tagDef).
   * For UI layout: the fieldEntry node under the tagDef (its parent IS the tagDef).
   *
   * Used as templateId on instantiated fieldEntries so that
   * getParentId(templateId) → tagDef (for icon color resolution).
   */
  templateOriginId: string;
}

/**
 * 查找 tagDef 下的模板字段定义列表。
 *
 * 支持两种布局：
 * 1. 直接 fieldDef 子节点（seed data 风格） → fieldDefId = templateOriginId = 该节点 ID
 * 2. fieldEntry 子节点（UI 创建风格：fieldDef 在 SCHEMA，tagDef 下放 fieldEntry）
 *    → fieldDefId = fieldEntry.fieldDefId, templateOriginId = fieldEntry 节点 ID
 *
 * 返回值按 fieldDefId 去重。
 */
function getTemplateFieldDefs(tagDefId: string): TemplateFieldRef[] {
  const children = loroDoc.getChildren(tagDefId);
  const seen = new Set<string>();
  const result: TemplateFieldRef[] = [];
  for (const cid of children) {
    const c = loroDoc.toNodexNode(cid);
    if (!c) continue;
    let ref: TemplateFieldRef | undefined;
    if (c.type === 'fieldDef') {
      ref = { fieldDefId: cid, templateOriginId: cid };
    } else if (c.type === 'fieldEntry' && c.fieldDefId) {
      ref = { fieldDefId: c.fieldDefId, templateOriginId: cid };
    }
    if (ref && !seen.has(ref.fieldDefId)) {
      seen.add(ref.fieldDefId);
      result.push(ref);
    }
  }
  return result;
}

/** 查找 tagDef 下的默认内容节点（仅顶层普通内容节点，不递归）。 */
function getTemplateContentNodes(tagDefId: string): string[] {
  const children = loroDoc.getChildren(tagDefId);
  return children.filter((cid) => {
    const c = loroDoc.toNodexNode(cid);
    return !!c && (c.type === undefined || c.type === 'codeBlock');
  });
}

// ============================================================
// 辅助：Field / Default Content 删除联动
// ============================================================

/**
 * Check if a fieldEntry has any user-provided value content.
 * A fieldEntry is "empty" when it has no children (value nodes).
 */
function fieldEntryHasValue(fieldEntryId: string): boolean {
  return loroDoc.getChildren(fieldEntryId).length > 0;
}

/**
 * Check if a content clone has been modified from its template.
 * Returns true if the user has customized the clone (different name, has children, etc.)
 */
function contentCloneHasCustomValue(cloneId: string, templateNodeId: string): boolean {
  const clone = loroDoc.toNodexNode(cloneId);
  const template = loroDoc.toNodexNode(templateNodeId);
  if (!clone) return false;
  if (!template) return true; // template gone, treat as customized to preserve

  // If clone has children, it's been customized
  if (loroDoc.getChildren(cloneId).length > 0) return true;

  // If name differs from template, it's been customized
  if ((clone.name ?? '') !== (template.name ?? '')) return true;

  // If description differs, it's been customized
  if ((clone.description ?? '') !== (template.description ?? '')) return true;

  return false;
}

/**
 * Find all nodes tagged with a specific tagDefId.
 * Iterates all known nodes and checks their tags array.
 */
function findNodesWithTag(tagDefId: string): string[] {
  const result: string[] = [];
  for (const id of loroDoc.getAllNodeIds()) {
    const node = loroDoc.toNodexNode(id);
    if (!node) continue;
    if (node.tags.includes(tagDefId)) result.push(id);
  }
  return result;
}

/**
 * Cascade deletion of a template field from a tagDef.
 * When a fieldDef or fieldEntry (template field) under a tagDef is removed,
 * cascade to all tagged nodes:
 * - No custom value → delete the instantiated fieldEntry
 * - Has custom value → detach from template (clear templateId)
 *
 * @param tagDefId The tagDef that owns the template
 * @param templateOriginId The ID of the template item being deleted (fieldDef or fieldEntry under tagDef)
 * @param fieldDefId The fieldDef ID referenced by the template field
 */
function cascadeTemplateFieldDeletion(tagDefId: string, templateOriginId: string, fieldDefId: string): void {
  const taggedNodeIds = findNodesWithTag(tagDefId);

  for (const nodeId of taggedNodeIds) {
    const children = loroDoc.getChildren(nodeId);
    for (const cid of children) {
      const child = loroDoc.toNodexNode(cid);
      if (!child) continue;
      if (child.type !== 'fieldEntry') continue;
      if (child.fieldDefId !== fieldDefId) continue;

      // Check if this fieldEntry came from the template
      if (child.templateId === templateOriginId) {
        if (fieldEntryHasValue(cid)) {
          // Has custom value → detach from template
          loroDoc.deleteNodeData(cid, 'templateId');
        } else {
          // No custom value → delete the fieldEntry
          loroDoc.deleteNode(cid);
        }
      }
    }
  }
}

/**
 * Cascade deletion of a template content node from a tagDef.
 * When a plain content node under a tagDef is removed,
 * cascade to all tagged nodes:
 * - No custom value → delete the content clone
 * - Has custom value → detach from template (clear templateId)
 *
 * @param tagDefId The tagDef that owns the template
 * @param templateNodeId The ID of the content node being deleted from the tagDef
 */
function cascadeTemplateContentDeletion(tagDefId: string, templateNodeId: string): void {
  const taggedNodeIds = findNodesWithTag(tagDefId);

  for (const nodeId of taggedNodeIds) {
    const children = loroDoc.getChildren(nodeId);
    for (const cid of children) {
      const child = loroDoc.toNodexNode(cid);
      if (!child) continue;
      if (child.templateId !== templateNodeId) continue;

      if (contentCloneHasCustomValue(cid, templateNodeId)) {
        // Has custom value → detach from template
        loroDoc.deleteNodeData(cid, 'templateId');
      } else {
        // No custom value → delete the clone
        loroDoc.deleteNode(cid);
      }
    }
  }
}

/**
 * When a fieldDef is hard-deleted, clean up empty fieldEntries across all nodes.
 * - FieldEntries with values: keep them (orphaned but data preserved)
 * - FieldEntries without values: delete them (no useful data)
 */
function cascadeFieldDefDeletion(fieldDefId: string): void {
  for (const id of loroDoc.getAllNodeIds()) {
    const node = loroDoc.toNodexNode(id);
    if (!node) continue;

    const children = loroDoc.getChildren(id);
    for (const cid of children) {
      const child = loroDoc.toNodexNode(cid);
      if (!child) continue;
      if (child.type !== 'fieldEntry') continue;
      if (child.fieldDefId !== fieldDefId) continue;

      if (!fieldEntryHasValue(cid)) {
        // No value → clean up
        loroDoc.deleteNode(cid);
      }
      // Has value → keep as orphaned field (will show "deleted" state in UI)
    }
  }
}

function findTemplateContentClone(nodeId: string, templateNodeId: string): string | null {
  const children = loroDoc.getChildren(nodeId);
  for (const cid of children) {
    const c = loroDoc.toNodexNode(cid);
    if (c?.templateId === templateNodeId) return cid;
  }
  return null;
}

function cloneTemplateContentNodeShallow(parentId: string, templateNodeId: string): void {
  if (findTemplateContentClone(parentId, templateNodeId)) return;

  const template = loroDoc.toNodexNode(templateNodeId);
  if (!template || (template.type !== undefined && template.type !== 'codeBlock')) return;

  const clonedId = nanoid();
  loroDoc.createNode(clonedId, parentId);
  loroDoc.setNodeDataBatch(clonedId, {
    templateId: templateNodeId,
    ...(template.type !== undefined && { type: template.type }),
    ...(template.codeLanguage !== undefined && { codeLanguage: template.codeLanguage }),
    ...(template.description !== undefined && { description: template.description }),
    ...(template.viewMode !== undefined && { viewMode: template.viewMode }),
    ...(template.editMode !== undefined && { editMode: template.editMode }),
    ...(template.flags !== undefined && { flags: template.flags }),
    ...(template.imageWidth !== undefined && { imageWidth: template.imageWidth }),
    ...(template.imageHeight !== undefined && { imageHeight: template.imageHeight }),
    ...(template.aiSummary !== undefined && { aiSummary: template.aiSummary }),
    ...(template.sourceUrl !== undefined && { sourceUrl: template.sourceUrl }),
  });

  if (template.marks || template.inlineRefs) {
    loroDoc.setNodeRichTextContent(
      clonedId,
      template.name ?? '',
      template.marks ?? [],
      template.inlineRefs ?? [],
    );
  } else if (template.name !== undefined) {
    loroDoc.setNodeData(clonedId, 'name', template.name);
  }
}

/**
 * Clone default field values from a template fieldEntry into a newly created fieldEntry.
 * Only clones from fieldEntry templates (not fieldDef, whose children are option definitions).
 */
function cloneTemplateFieldValues(newFieldEntryId: string, templateOriginId: string): void {
  const origin = loroDoc.toNodexNode(templateOriginId);
  if (!origin || origin.type !== 'fieldEntry') return;

  const templateChildren = loroDoc.getChildren(templateOriginId);
  for (const tChildId of templateChildren) {
    const tChild = loroDoc.toNodexNode(tChildId);
    if (!tChild) continue;
    const clonedId = nanoid();
    loroDoc.createNode(clonedId, newFieldEntryId);
    const batch: Record<string, unknown> = {};
    if (tChild.type !== undefined) batch.type = tChild.type;
    if (tChild.name !== undefined) batch.name = tChild.name;
    if (tChild.targetId !== undefined) batch.targetId = tChild.targetId;
    if (tChild.fieldDefId !== undefined) batch.fieldDefId = tChild.fieldDefId;
    if (Object.keys(batch).length > 0) loroDoc.setNodeDataBatch(clonedId, batch);
  }
}

/** 递归获取 tagDef 的 extends 链（包含自身） */
function getExtendsChain(tagDefId: string, visited = new Set<string>()): string[] {
  if (visited.has(tagDefId)) return [];
  visited.add(tagDefId);
  const tagDef = loroDoc.toNodexNode(tagDefId);
  if (!tagDef) return [tagDefId];
  const chain = [tagDefId];
  if (tagDef.extends) {
    chain.push(...getExtendsChain(tagDef.extends, visited));
  }
  return chain;
}

/**
 * Apply tag side effects without committing.
 * Shared by node-store.applyTag() and journal date-node creation so both paths
 * get the same template field instantiation behavior.
 */
export function applyTagMutationsNoCommit(nodeId: string, tagDefId: string): void {
  // 1. 添加标签
  loroDoc.addTag(nodeId, tagDefId);

  // 2. 处理 extends 链（继承父标签的 fieldDefs）
  const extendsChain = getExtendsChain(tagDefId);

  // 3. 为所有 fieldDef 创建 fieldEntry（若不存在），或合并默认值到已存在的空字段
  for (const chainTagId of extendsChain) {
    const fieldRefs = getTemplateFieldDefs(chainTagId);
    for (const ref of fieldRefs) {
      const existingFeId = findFieldEntry(nodeId, ref.fieldDefId);
      if (!existingFeId) {
        const feId = nanoid();
        loroDoc.createNode(feId, nodeId);
        loroDoc.setNodeDataBatch(feId, {
          type: 'fieldEntry',
          fieldDefId: ref.fieldDefId,
          templateId: ref.templateOriginId,
        });
        cloneTemplateFieldValues(feId, ref.templateOriginId);
      } else if (!fieldEntryHasValue(existingFeId)) {
        // Merge: existing field is empty, fill with new tag's template default values
        cloneTemplateFieldValues(existingFeId, ref.templateOriginId);
      }
    }
  }

  // 4. Auto-initialize: fill empty fields that have autoInitialize strategy configured
  //    Supports comma-separated multiple strategies; tried in priority order.
  for (const chainTagId of extendsChain) {
    const fieldRefs = getTemplateFieldDefs(chainTagId);
    for (const ref of fieldRefs) {
      const feId = findFieldEntry(nodeId, ref.fieldDefId);
      if (!feId || fieldEntryHasValue(feId)) continue;

      const fieldDef = loroDoc.toNodexNode(ref.fieldDefId);
      const result = resolveAutoInit(nodeId, ref.fieldDefId, fieldDef?.autoInitialize);
      if (result) {
        const valueNodeId = nanoid();
        loroDoc.createNode(valueNodeId, feId);
        if (result.kind === 'reference') {
          loroDoc.setNodeData(valueNodeId, 'targetId', result.targetId);
        } else {
          loroDoc.setNodeData(valueNodeId, 'name', result.value);
        }
      }
    }
  }

  // 5. 克隆默认内容（仅当前 tagDef 的顶层普通内容节点，shallow clone）
  // 注：继承链上的 default content 自动传播仍属于 Extend Phase 2（未实现）。
  for (const templateNodeId of getTemplateContentNodes(tagDefId)) {
    cloneTemplateContentNodeShallow(nodeId, templateNodeId);
  }

  // 6. 传播 childSupertag
  const tagDef = loroDoc.toNodexNode(tagDefId);
  void tagDef; // childSupertag 仅在 createChild/createSibling 时处理
}

/**
 * Ensure a node has all expected template fieldEntries and content clones
 * for its current tags. This handles the case where fieldDefs or content
 * were added to a tagDef AFTER the tag was already applied to the node.
 *
 * Returns true if any new items were created (caller should commitDoc).
 */
export function syncTemplateMutationsNoCommit(nodeId: string): boolean {
  const node = loroDoc.toNodexNode(nodeId);
  if (!node) return false;

  let changed = false;
  for (const tagDefId of node.tags) {
    const extendsChain = getExtendsChain(tagDefId);

    // Sync template fieldEntries
    for (const chainTagId of extendsChain) {
      const fieldRefs = getTemplateFieldDefs(chainTagId);
      for (const ref of fieldRefs) {
        if (!findFieldEntry(nodeId, ref.fieldDefId)) {
          const feId = nanoid();
          loroDoc.createNode(feId, nodeId);
          loroDoc.setNodeDataBatch(feId, {
            type: 'fieldEntry',
            fieldDefId: ref.fieldDefId,
            templateId: ref.templateOriginId,
          });
          // Note: no cloneTemplateFieldValues here — default values only apply
          // at applyTag time, not retroactively via syncTemplateFields.
          changed = true;
        }
      }
    }

    // Sync template content clones (only direct tag, not extends chain)
    for (const templateNodeId of getTemplateContentNodes(tagDefId)) {
      if (!findTemplateContentClone(nodeId, templateNodeId)) {
        cloneTemplateContentNodeShallow(nodeId, templateNodeId);
        changed = true;
      }
    }
  }
  return changed;
}

// ============================================================
// 读取缓存 — getChildren(NodexNode[]) 需要在 store 层缓存
// （loro-doc 层缓存了 string[]，但 map+filter 每次创建新数组）
// ============================================================

let _childrenNodesCacheVer = -1;
const _childrenNodesCache = new Map<string, NodexNode[]>();
const INLINE_REF_CHAR = '\uFFFC';

export function remapInlineRefsByPlaceholderOrder(
  nextText: string,
  prevInlineRefs: InlineRefEntry[] | undefined,
): InlineRefEntry[] {
  if (!prevInlineRefs || prevInlineRefs.length === 0) return [];
  const prev = [...prevInlineRefs].sort((a, b) => a.offset - b.offset);
  const nextOffsets: number[] = [];
  for (let i = 0; i < nextText.length; i++) {
    if (nextText[i] === INLINE_REF_CHAR) nextOffsets.push(i);
  }
  const len = Math.min(prev.length, nextOffsets.length);
  const remapped: InlineRefEntry[] = [];
  for (let i = 0; i < len; i++) {
    const oldRef = prev[i];
    remapped.push({
      offset: nextOffsets[i],
      targetNodeId: oldRef.targetNodeId,
      ...(oldRef.displayName ? { displayName: oldRef.displayName } : {}),
    });
  }
  return remapped;
}

// ============================================================
// Store 实现
// ============================================================

export const useNodeStore = create<NodeStore>((set, get) => {
  // 订阅 Loro 变更 → 递增 _version → 触发 React re-render
  loroDoc.subscribe(() => {
    if (!loroDoc.isDetached() && detachedStoreWarnings.size > 0) {
      detachedStoreWarnings.clear();
    }
    set(state => ({ _version: state._version + 1 }));
  });

  const detachedStoreWarnings = new Set<string>();
  function canMutate(action: string): boolean {
    if (!loroDoc.isDetached()) {
      if (detachedStoreWarnings.size > 0) {
        detachedStoreWarnings.clear();
      }
      return true;
    }
    if (!detachedStoreWarnings.has(action)) {
      detachedStoreWarnings.add(action);
      console.warn(`[node-store] detached checkout 模式下忽略写操作: ${action}`);
    }
    return false;
  }

  function detachedNodeFallback(nodeId: string): NodexNode {
    return loroDoc.toNodexNode(nodeId) ?? {
      id: nodeId,
      children: [],
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  function setFieldOptionValue(fieldEntryId: string, optionNodeId: string, applyReverseDoneMapping: boolean) {
    const oldChildren = loroDoc.getChildren(fieldEntryId);
    for (const oldId of oldChildren) loroDoc.deleteNode(oldId);

    const valId = nanoid();
    loroDoc.createNode(valId, fieldEntryId);
    loroDoc.setNodeData(valId, 'targetId', optionNodeId);

    if (!applyReverseDoneMapping) return;

    // 应用 reverse done-state mapping（勾选选项时联动 checkbox）
    const feNode = loroDoc.toNodexNode(fieldEntryId);
    if (!feNode?.fieldDefId) return;
    const parentId = loroDoc.getParentId(fieldEntryId);
    if (!parentId) return;
    const parentNode = loroDoc.toNodexNode(parentId);
    if (!parentNode) return;

    const mapping = resolveReverseDoneMapping(parentNode, feNode.fieldDefId, optionNodeId);
    if (mapping === null) return;
    if (mapping.newDone) {
      loroDoc.setNodeData(parentId, 'completedAt', Date.now());
    } else {
      loroDoc.setNodeData(parentId, 'completedAt', 0);
    }
  }

  function isMeaningfulParsedPasteNode(item: ParsedPasteNode): boolean {
    const hasName = item.type === 'codeBlock'
      ? item.name.length > 0
      : item.name.trim().length > 0;
    return (
      hasName
      || item.children.length > 0
      || (item.tags?.length ?? 0) > 0
      || (item.fields?.length ?? 0) > 0
    );
  }

  function createParsedNodesNoCommit(
    parentNodeId: string,
    items: ParsedPasteNode[],
    startIndex?: number,
  ): string | null {
    const filtered = items.filter(isMeaningfulParsedPasteNode);
    if (filtered.length === 0) return null;

    const persistParsedNodeType = (nodeId: string, item: ParsedPasteNode): void => {
      if (!item.type && !item.codeLanguage) return;
      const batch: Record<string, unknown> = {};
      if (item.type) batch.type = item.type;
      if (item.codeLanguage) batch.codeLanguage = item.codeLanguage;
      loroDoc.setNodeDataBatch(nodeId, batch);
    };

    let lastId: string | null = null;
    for (let i = 0; i < filtered.length; i++) {
      const item = filtered[i];
      const index = startIndex !== undefined ? startIndex + i : undefined;
      const id = nanoid();
      loroDoc.createNode(id, parentNodeId, index);
      persistParsedNodeType(id, item);
      loroDoc.setNodeRichTextContent(id, item.name, item.marks ?? [], item.inlineRefs ?? []);
      applyParsedPasteMetadataMutationsNoCommit(id, item);
      if (item.children.length > 0) {
        createParsedNodesNoCommit(id, item.children);
      }
      lastId = id;
    }
    return lastId;
  }

  return {
    _version: 0,

    // ─── 读取 ───

    getNode: (id) => loroDoc.toNodexNode(id),

    getChildren: (parentId) => {
      const ver = get()._version;
      if (ver !== _childrenNodesCacheVer) {
        _childrenNodesCache.clear();
        _childrenNodesCacheVer = ver;
      }
      const cached = _childrenNodesCache.get(parentId);
      if (cached) return cached;
      const ids = loroDoc.getChildren(parentId);
      const result = ids.map(id => loroDoc.toNodexNode(id)).filter((n): n is NodexNode => n !== null);
      _childrenNodesCache.set(parentId, result);
      return result;
    },

    // ─── 树操作 ───

    createChild: (parentId, index, data) => {
      if (!canMutate('createChild')) return detachedNodeFallback(parentId);
      const id = nanoid();
      loroDoc.createNode(id, parentId, index);
      if (data) {
        const { type, name, description, marks, inlineRefs, ...rest } = data;
        const batch: Record<string, unknown> = {};
        if (type !== undefined) batch.type = type;
        const supportsRichText = type === undefined || type === 'codeBlock';
        const shouldPersistLegacyName = !supportsRichText && name !== undefined && marks === undefined && inlineRefs === undefined;
        if (shouldPersistLegacyName) batch.name = name;
        if (description !== undefined) batch.description = description;
        Object.assign(batch, rest);
        if (Object.keys(batch).length > 0) {
          loroDoc.setNodeDataBatch(id, batch);
        }

        const shouldWriteRichText = supportsRichText && (name !== undefined || marks !== undefined || inlineRefs !== undefined);
        if (shouldWriteRichText) {
          loroDoc.setNodeRichTextContent(
            id,
            name ?? '',
            marks ?? [],
            inlineRefs ?? [],
          );
        }
      }

      // Auto-apply child supertags from parent's tags
      const parentNode = loroDoc.toNodexNode(parentId);
      if (parentNode) {
        for (const tagId of parentNode.tags) {
          const tagDef = loroDoc.toNodexNode(tagId);
          if (tagDef?.childSupertag) {
            get().applyTag(id, tagDef.childSupertag);
          }
        }
      }

      loroDoc.commitDoc();
      return loroDoc.toNodexNode(id)!;
    },

    createSibling: (siblingId, data) => {
      const parentId = loroDoc.getParentId(siblingId);
      if (!parentId) throw new Error('[createSibling] no parent');

      const siblings = loroDoc.getChildren(parentId);
      const idx = siblings.indexOf(siblingId);
      const insertAt = idx >= 0 ? idx + 1 : siblings.length;

      return get().createChild(parentId, insertAt, data);
    },

    createSiblingNodesFromPaste: (afterNodeId, nodes, options) => {
      if (!canMutate('createSiblingNodesFromPaste')) return null;
      const parentId = loroDoc.getParentId(afterNodeId);
      if (!parentId) return null;

      const siblings = loroDoc.getChildren(parentId);
      const baseIdx = siblings.indexOf(afterNodeId);
      const startAt = baseIdx >= 0 ? baseIdx + 1 : siblings.length;

      const lastId = createParsedNodesNoCommit(parentId, nodes, startAt);
      if (!lastId) return null;
      if (options?.commit ?? true) {
        loroDoc.commitDoc();
      }
      return lastId;
    },

    createChildNodesFromPaste: (parentNodeId, nodes, options) => {
      if (!canMutate('createChildNodesFromPaste')) return null;
      if (!loroDoc.hasNode(parentNodeId)) return null;

      const children = loroDoc.getChildren(parentNodeId);
      const startAt = children.length;
      const lastId = createParsedNodesNoCommit(parentNodeId, nodes, startAt);
      if (!lastId) return null;

      if (options?.commit ?? true) {
        loroDoc.commitDoc();
      }
      return lastId;
    },

    moveNodeTo: (nodeId, newParentId, index) => {
      if (!getNodeCapabilities(nodeId).canMove) return;
      // Guard: no self-move
      if (nodeId === newParentId) return;
      // Guard: no descendant move (prevent cycle)
      let cursor: string | null = newParentId;
      while (cursor) {
        if (cursor === nodeId) return;
        cursor = loroDoc.getParentId(cursor);
      }
      // Same-parent reordering: adjust index for removal offset
      const currentParent = loroDoc.getParentId(nodeId);
      let adjustedIndex = index;
      if (currentParent === newParentId && adjustedIndex !== undefined) {
        const siblings = loroDoc.getChildren(currentParent);
        const currentIdx = siblings.indexOf(nodeId);
        if (currentIdx !== -1 && currentIdx < adjustedIndex) {
          adjustedIndex = adjustedIndex - 1;
        }
      }
      loroDoc.moveNode(nodeId, newParentId, adjustedIndex);
      loroDoc.commitDoc();
    },

    indentNode: (nodeId) => {
      if (!getNodeCapabilities(nodeId).canMove) return;
      const parentId = loroDoc.getParentId(nodeId);
      if (!parentId) return;
      const siblings = loroDoc.getChildren(parentId);
      const idx = siblings.indexOf(nodeId);
      if (idx <= 0) return; // no previous sibling
      const newParentId = siblings[idx - 1];
      // Move to end of previous sibling's children
      const newParentChildren = loroDoc.getChildren(newParentId);
      loroDoc.moveNode(nodeId, newParentId, newParentChildren.length);
      loroDoc.commitDoc();
    },

    outdentNode: (nodeId) => {
      if (!getNodeCapabilities(nodeId).canMove) return;
      const parentId = loroDoc.getParentId(nodeId);
      if (!parentId) return;
      // Cannot outdent out of a workspace container (LIBRARY, INBOX, etc.)
      if (isWorkspaceContainer(parentId)) return;
      const grandParentId = loroDoc.getParentId(parentId);
      if (!grandParentId) return;

      // Insert after parent in grandparent's children
      const gpChildren = loroDoc.getChildren(grandParentId);
      const parentIdx = gpChildren.indexOf(parentId);
      loroDoc.moveNode(nodeId, grandParentId, parentIdx + 1);
      loroDoc.commitDoc();
    },

    moveNodeUp: (nodeId) => {
      if (!getNodeCapabilities(nodeId).canMove) return;
      const parentId = loroDoc.getParentId(nodeId);
      if (!parentId) return;
      const siblings = loroDoc.getChildren(parentId);
      const idx = siblings.indexOf(nodeId);
      if (idx <= 0) return;
      loroDoc.moveNode(nodeId, parentId, idx - 1);
      loroDoc.commitDoc();
    },

    moveNodeDown: (nodeId) => {
      if (!getNodeCapabilities(nodeId).canMove) return;
      const parentId = loroDoc.getParentId(nodeId);
      if (!parentId) return;
      const siblings = loroDoc.getChildren(parentId);
      const idx = siblings.indexOf(nodeId);
      if (idx < 0 || idx >= siblings.length - 1) return;
      loroDoc.moveNode(nodeId, parentId, idx + 1);
      loroDoc.commitDoc();
    },

    trashNode: (nodeId) => {
      if (!getNodeCapabilities(nodeId).canDelete) return;
      const node = loroDoc.toNodexNode(nodeId);
      if (node?.type === 'tagDef' && isJournalSystemTagId(nodeId)) return;
      const parentId = loroDoc.getParentId(nodeId);
      const siblings = parentId ? loroDoc.getChildren(parentId) : [];
      const index = siblings.indexOf(nodeId);

      // ─── Scenario A: Cascade template field/content deletion ───
      // When deleting a child of a tagDef, cascade to all tagged nodes.
      if (parentId) {
        const parentNode = loroDoc.toNodexNode(parentId);
        if (parentNode?.type === 'tagDef') {
          if (node?.type === 'fieldDef') {
            // Direct fieldDef child of tagDef (seed-data layout)
            cascadeTemplateFieldDeletion(parentId, nodeId, nodeId);
          } else if (node?.type === 'fieldEntry' && node.fieldDefId) {
            // fieldEntry child of tagDef (UI layout)
            cascadeTemplateFieldDeletion(parentId, nodeId, node.fieldDefId);
          } else if (node && (node.type === undefined || node.type === 'codeBlock')) {
            // Plain content node (default content)
            cascadeTemplateContentDeletion(parentId, nodeId);
          }
        }
      }

      // 记录来源以便恢复
      loroDoc.setNodeDataBatch(nodeId, {
        _trashedFrom: parentId,
        _trashedIndex: index >= 0 ? index : undefined,
      });

      loroDoc.moveNode(nodeId, CONTAINER_IDS.TRASH);
      loroDoc.commitDoc();
    },

    restoreNode: (nodeId) => {
      const node = loroDoc.toNodexNode(nodeId);
      if (!node) return;
      const from = loroDoc.getNodeData(nodeId)?._trashedFrom as string | undefined;
      const fromIndex = loroDoc.getNodeData(nodeId)?._trashedIndex as number | undefined;

      if (from && loroDoc.hasNode(from)) {
        loroDoc.moveNode(nodeId, from, fromIndex);
      } else {
        // Fallback: restore to LIBRARY
        loroDoc.moveNode(nodeId, CONTAINER_IDS.LIBRARY);
      }

      loroDoc.deleteNodeData(nodeId, '_trashedFrom');
      loroDoc.deleteNodeData(nodeId, '_trashedIndex');
      loroDoc.commitDoc();
    },

    hardDeleteNode: (nodeId: string) => {
      const parentId = loroDoc.getParentId(nodeId);
      if (parentId !== CONTAINER_IDS.TRASH) return;
      if (isWorkspaceContainer(nodeId)) return;

      // ─── Scenario B: Cascade fieldDef hard deletion ───
      // When permanently deleting a fieldDef, clean up empty fieldEntries across all nodes.
      const node = loroDoc.toNodexNode(nodeId);
      if (node?.type === 'fieldDef') {
        cascadeFieldDefDeletion(nodeId);
      }

      loroDoc.deleteNode(nodeId);
      loroDoc.commitDoc();
    },

    emptyTrash: () => {
      const trashChildren = loroDoc.getChildren(CONTAINER_IDS.TRASH);
      if (trashChildren.length === 0) return;
      for (let i = trashChildren.length - 1; i >= 0; i--) {
        loroDoc.deleteNode(trashChildren[i]);
      }
      loroDoc.commitDoc();
    },

    duplicateNode: (nodeId) => {
      const parentId = loroDoc.getParentId(nodeId);
      if (!parentId) return null;

      const siblings = loroDoc.getChildren(parentId);
      const idx = siblings.indexOf(nodeId);
      const insertAt = idx >= 0 ? idx + 1 : siblings.length;

      // Deep-clone helper: recursively copy a node and its descendants.
      // Returns the new node's ID.
      function deepClone(srcId: string, destParentId: string, destIndex?: number): string {
        const src = loroDoc.toNodexNode(srcId);
        const newId = nanoid();
        loroDoc.createNode(newId, destParentId, destIndex);

        if (src) {
          // Copy core data fields
          const batch: Record<string, unknown> = {};
          if (src.name !== undefined) batch.name = src.name;
          if (src.description !== undefined) batch.description = src.description;
          if (src.type !== undefined) batch.type = src.type;
          if (src.fieldDefId !== undefined) batch.fieldDefId = src.fieldDefId;
          if (src.targetId !== undefined) batch.targetId = src.targetId;
          if (src.color !== undefined) batch.color = src.color;
          if (src.showCheckbox !== undefined) batch.showCheckbox = src.showCheckbox;
          if (src.completedAt !== undefined) batch.completedAt = src.completedAt;
          if (src.templateId !== undefined) batch.templateId = src.templateId;

          if (Object.keys(batch).length > 0) {
            loroDoc.setNodeDataBatch(newId, batch);
          }

          // Copy rich text (marks + inlineRefs)
          if (src.name && (src.marks?.length || src.inlineRefs?.length)) {
            loroDoc.setNodeRichTextContent(
              newId,
              src.name,
              src.marks ?? [],
              src.inlineRefs ?? [],
            );
          }

          // Copy tags (stored as LoroList, not children)
          for (const tagId of src.tags) {
            loroDoc.addTag(newId, tagId);
          }
        }

        // Clone children (order preserved)
        const childIds = loroDoc.getChildren(srcId);
        for (const childId of childIds) {
          deepClone(childId, newId);
        }

        return newId;
      }

      const newId = deepClone(nodeId, parentId, insertAt);
      loroDoc.commitDoc();
      return loroDoc.toNodexNode(newId);
    },

    // ─── 内容编辑 ───

    setNodeName: (id, name) => {
      if (!getNodeCapabilities(id).canEditNode) return;
      const current = loroDoc.toNodexNode(id);
      const nextInlineRefs = remapInlineRefsByPlaceholderOrder(name, current?.inlineRefs);
      loroDoc.setNodeRichTextContent(id, name, current?.marks ?? [], nextInlineRefs);
    },

    updateNodeContent: (id, data) => {
      if (!getNodeCapabilities(id).canEditNode) return;
      const current = loroDoc.toNodexNode(id);
      const nextName = data.name ?? current?.name ?? '';
      const nextMarks = data.marks ?? current?.marks ?? [];
      const nextInlineRefs = data.inlineRefs
        ?? (data.name !== undefined
          ? remapInlineRefsByPlaceholderOrder(nextName, current?.inlineRefs)
          : current?.inlineRefs ?? []);
      if (data.name !== undefined || data.marks !== undefined || data.inlineRefs !== undefined) {
        loroDoc.setNodeRichTextContent(id, nextName, nextMarks, nextInlineRefs);
      }
    },

    updateNodeDescription: (id, description) => {
      if (!getNodeCapabilities(id).canEditNode) return;
      loroDoc.setNodeData(id, 'description', description || undefined);
    },

    setNodeCodeLanguage: (nodeId, language) => {
      loroDoc.setNodeDataBatch(nodeId, { codeLanguage: language || undefined });
      loroDoc.commitDoc();
    },

    applyParsedPasteMetadata: (nodeId, node, options) => {
      applyParsedPasteMetadataMutationsNoCommit(nodeId, node);
      if (options?.commit !== false) {
        loroDoc.commitDoc();
      }
    },

    // ─── 标签操作 ───

    applyTag: (nodeId, tagDefId) => {
      applyTagMutationsNoCommit(nodeId, tagDefId);
      loroDoc.commitDoc();
    },

    syncTemplateFields: (nodeId) => {
      if (syncTemplateMutationsNoCommit(nodeId)) {
        loroDoc.commitDoc();
      }
    },

    removeTag: (nodeId, tagDefId) => {
      const node = loroDoc.toNodexNode(nodeId);
      const hadTag = node?.tags.includes(tagDefId) ?? false;
      loroDoc.removeTag(nodeId, tagDefId);
      if (!hadTag) {
        loroDoc.commitDoc();
        return;
      }

      // 移除「仅由被移除标签贡献」的 fieldEntry，保留仍被其他标签需要的字段。
      const remainingTags = loroDoc.toNodexNode(nodeId)?.tags ?? [];
      const requiredByRemaining = new Set<string>();
      for (const remainingTagId of remainingTags) {
        for (const chainTagId of getExtendsChain(remainingTagId)) {
          for (const ref of getTemplateFieldDefs(chainTagId)) requiredByRemaining.add(ref.fieldDefId);
        }
      }

      const fieldDefsFromRemovedTag = new Set<string>();
      const extendsChain = getExtendsChain(tagDefId);
      for (const chainTagId of extendsChain) {
        for (const ref of getTemplateFieldDefs(chainTagId)) fieldDefsFromRemovedTag.add(ref.fieldDefId);
      }

      for (const fdId of fieldDefsFromRemovedTag) {
        if (requiredByRemaining.has(fdId)) continue;
        const feId = findFieldEntry(nodeId, fdId);
        if (feId) loroDoc.deleteNode(feId);
      }
      loroDoc.commitDoc();
    },

    batchApplyTag: (nodeIds, tagDefId) => {
      for (const nodeId of nodeIds) {
        applyTagMutationsNoCommit(nodeId, tagDefId);
      }
      loroDoc.commitDoc();
    },

    batchRemoveTag: (nodeIds, tagDefId) => {
      for (const nodeId of nodeIds) {
        const node = loroDoc.toNodexNode(nodeId);
        const hadTag = node?.tags.includes(tagDefId) ?? false;
        loroDoc.removeTag(nodeId, tagDefId);
        if (!hadTag) continue;

        const remainingTags = loroDoc.toNodexNode(nodeId)?.tags ?? [];
        const requiredByRemaining = new Set<string>();
        for (const remainingTagId of remainingTags) {
          for (const chainTagId of getExtendsChain(remainingTagId)) {
            for (const ref of getTemplateFieldDefs(chainTagId)) requiredByRemaining.add(ref.fieldDefId);
          }
        }

        const fieldDefsFromRemovedTag = new Set<string>();
        const extendsChain = getExtendsChain(tagDefId);
        for (const chainTagId of extendsChain) {
          for (const ref of getTemplateFieldDefs(chainTagId)) fieldDefsFromRemovedTag.add(ref.fieldDefId);
        }

        for (const fdId of fieldDefsFromRemovedTag) {
          if (requiredByRemaining.has(fdId)) continue;
          const feId = findFieldEntry(nodeId, fdId);
          if (feId) loroDoc.deleteNode(feId);
        }
      }
      loroDoc.commitDoc();
    },

    createTagDef: (name, options = {}) => {
      if (!canMutate('createTagDef')) return detachedNodeFallback(CONTAINER_IDS.SCHEMA);
      // Auto-assign color by round-robin if not explicitly provided.
      const color = options.color ?? nextAutoColorKey(
        loroDoc.getChildren(CONTAINER_IDS.SCHEMA)
          .filter((cid) => loroDoc.toNodexNode(cid)?.type === 'tagDef').length,
      );
      const id = nanoid();
      loroDoc.createNode(id, CONTAINER_IDS.SCHEMA);
      loroDoc.setNodeDataBatch(id, {
        type: 'tagDef',
        name,
        color,
        ...(options.showCheckbox !== undefined && { showCheckbox: options.showCheckbox }),
      });
      loroDoc.commitDoc();
      return loroDoc.toNodexNode(id)!;
    },

    // ─── 字段操作 ───

    createFieldDef: (name, fieldType, tagDefId) => {
      if (!canMutate('createFieldDef')) return detachedNodeFallback(tagDefId);
      const id = nanoid();
      loroDoc.createNode(id, tagDefId);
      loroDoc.setNodeDataBatch(id, {
        type: 'fieldDef',
        name,
        fieldType,
        cardinality: 'single',
        nullable: true,
      });
      loroDoc.commitDoc();
      return loroDoc.toNodexNode(id)!;
    },

    setFieldValue: (nodeId, fieldDefId, values) => {
      // 找到或创建 fieldEntry
      let feId = findFieldEntry(nodeId, fieldDefId);
      if (!feId) {
        feId = nanoid();
        loroDoc.createNode(feId, nodeId);
        loroDoc.setNodeDataBatch(feId, { type: 'fieldEntry', fieldDefId });
      }

      // 清除旧值节点
      const oldChildren = loroDoc.getChildren(feId);
      for (const oldId of oldChildren) {
        loroDoc.deleteNode(oldId);
      }

      // 创建新值节点
      for (const val of values) {
        const valId = nanoid();
        loroDoc.createNode(valId, feId);
        loroDoc.setNodeData(valId, 'name', val);
      }
      loroDoc.commitDoc();
    },

    setOptionsFieldValue: (nodeId, fieldDefId, optionNodeId) => {
      let feId = findFieldEntry(nodeId, fieldDefId);
      if (!feId) {
        feId = nanoid();
        loroDoc.createNode(feId, nodeId);
        loroDoc.setNodeDataBatch(feId, { type: 'fieldEntry', fieldDefId });
      }

      // Options field: fieldEntry children = [valueNode], valueNode.targetId = optionNodeId
      const oldChildren = loroDoc.getChildren(feId);
      for (const oldId of oldChildren) loroDoc.deleteNode(oldId);

      const valId = nanoid();
      loroDoc.createNode(valId, feId);
      loroDoc.setNodeData(valId, 'targetId', optionNodeId);
      loroDoc.commitDoc();
    },

    selectFieldOption: (fieldEntryId, optionNodeId, oldOptionNodeId) => {
      setFieldOptionValue(fieldEntryId, optionNodeId, true);
      loroDoc.commitDoc();
      void oldOptionNodeId; // suppress lint
    },

    clearFieldValue: (nodeId, fieldDefId) => {
      const feId = findFieldEntry(nodeId, fieldDefId);
      if (!feId) return;
      const children = loroDoc.getChildren(feId);
      for (const cid of children) loroDoc.deleteNode(cid);
      loroDoc.commitDoc();
    },

    addFieldToNode: (nodeId, fieldDefId) => {
      if (findFieldEntry(nodeId, fieldDefId)) return; // already exists
      const feId = nanoid();
      loroDoc.createNode(feId, nodeId);
      loroDoc.setNodeDataBatch(feId, { type: 'fieldEntry', fieldDefId });
      loroDoc.commitDoc();
    },

    addUnnamedFieldToNode: (nodeId, afterChildId) => {
      if (!canMutate('addUnnamedFieldToNode')) return { fieldEntryId: '', fieldDefId: '' };
      // 创建临时 fieldDef（placeholder）
      const fdId = nanoid();
      loroDoc.createNode(fdId, CONTAINER_IDS.SCHEMA);
      loroDoc.setNodeDataBatch(fdId, {
        type: 'fieldDef',
        name: '',
        fieldType: 'plain',
        cardinality: 'single',
        nullable: true,
      });

      // 确定插入位置
      let insertIdx: number | undefined;
      if (afterChildId) {
        const siblings = loroDoc.getChildren(nodeId);
        const idx = siblings.indexOf(afterChildId);
        if (idx >= 0) insertIdx = idx + 1;
      }

      const feId = nanoid();
      loroDoc.createNode(feId, nodeId, insertIdx);
      loroDoc.setNodeDataBatch(feId, { type: 'fieldEntry', fieldDefId: fdId });
      loroDoc.commitDoc();

      return { fieldEntryId: feId, fieldDefId: fdId };
    },

    moveFieldEntry: (currentParentId, fieldEntryId, newParentId, position) => {
      loroDoc.moveNode(fieldEntryId, newParentId, position);
      loroDoc.commitDoc();
      void currentParentId; // suppress lint
    },

    removeField: (nodeId, fieldEntryId) => {
      loroDoc.deleteNode(fieldEntryId);
      loroDoc.commitDoc();
      void nodeId; // suppress lint
    },

    renameFieldDef: (fieldDefId, newName) => {
      loroDoc.setNodeData(fieldDefId, 'name', newName);
      loroDoc.commitDoc();
    },

    changeFieldType: (fieldDefId, newType) => {
      loroDoc.setNodeData(fieldDefId, 'fieldType', newType);
      loroDoc.commitDoc();
    },

    addFieldOption: (fieldDefId, name) => {
      if (!canMutate('addFieldOption')) return '';
      const optId = nanoid();
      loroDoc.createNode(optId, fieldDefId);
      loroDoc.setNodeData(optId, 'name', name);
      loroDoc.commitDoc();
      return optId;
    },

    removeFieldOption: (fieldDefId, optionId) => {
      loroDoc.deleteNode(optionId);
      loroDoc.commitDoc();
      void fieldDefId; // suppress lint
    },

    autoCollectOption: (nodeId, fieldDefId, name) => {
      if (!canMutate('autoCollectOption')) return '';
      // 在 fieldDef 下创建新选项
      // NOTE: addFieldOption already calls commitDoc; we batch all mutations
      // here and commit once at the end for atomicity.
      const optId = nanoid();
      loroDoc.createNode(optId, fieldDefId);
      loroDoc.setNodeDataBatch(optId, { name, autoCollected: true });

      // 在 node 的 fieldEntry 中设置该选项
      let feId = findFieldEntry(nodeId, fieldDefId);
      if (!feId) {
        feId = nanoid();
        loroDoc.createNode(feId, nodeId);
        loroDoc.setNodeDataBatch(feId, { type: 'fieldEntry', fieldDefId });
      }
      const oldChildren = loroDoc.getChildren(feId);
      for (const oldId of oldChildren) loroDoc.deleteNode(oldId);
      const valId = nanoid();
      loroDoc.createNode(valId, feId);
      loroDoc.setNodeData(valId, 'targetId', optId);
      loroDoc.commitDoc();

      return optId;
    },

    registerCollectedOption: (fieldDefId, name) => {
      if (!canMutate('registerCollectedOption')) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      // Check if option with same name already exists (pre-determined or collected)
      const children = loroDoc.getChildren(fieldDefId);
      for (const cid of children) {
        const child = loroDoc.toNodexNode(cid);
        if (child && child.name === trimmed) return; // Already exists
      }
      const optId = nanoid();
      loroDoc.createNode(optId, fieldDefId);
      loroDoc.setNodeDataBatch(optId, { name: trimmed, autoCollected: true });
      loroDoc.commitDoc();
    },

    toggleCheckboxField: (fieldEntryId) => {
      const fe = loroDoc.toNodexNode(fieldEntryId);
      if (!fe) return;
      const children = loroDoc.getChildren(fieldEntryId);
      if (children.length > 0) {
        // 有值 → 清除（取消勾选）
        for (const cid of children) loroDoc.deleteNode(cid);
      } else {
        // 无值 → 创建 SYS_V.YES 值节点（勾选）
        const valId = nanoid();
        loroDoc.createNode(valId, fieldEntryId);
        loroDoc.setNodeData(valId, 'name', SYS_V.YES);
      }
      loroDoc.commitDoc();
    },

    replaceFieldDef: (nodeId, fieldEntryId, oldFieldDefId, newFieldDefId) => {
      // Dedup: if the target fieldDef already has a fieldEntry on this node,
      // remove the current (placeholder) entry instead of creating a duplicate.
      const existing = findFieldEntry(nodeId, newFieldDefId);
      if (existing && existing !== fieldEntryId) {
        loroDoc.deleteNode(fieldEntryId);
        loroDoc.commitDoc();
        return;
      }
      loroDoc.setNodeData(fieldEntryId, 'fieldDefId', newFieldDefId);
      loroDoc.commitDoc();
      void oldFieldDefId; // suppress lint
    },

    // ─── Checkbox 操作 ───

    toggleNodeDone: (nodeId) => {
      const node = loroDoc.toNodexNode(nodeId);
      if (!node) return;
      const result = resolveCheckboxClick(node);
      if (result.completedAt === undefined) {
        loroDoc.deleteNodeData(nodeId, 'completedAt');
      } else {
        loroDoc.setNodeData(nodeId, 'completedAt', result.completedAt);
      }
      if (result.doneMappings) {
        for (const { fieldDefId, optionId } of result.doneMappings) {
          const feId = findFieldEntry(nodeId, fieldDefId);
          if (feId) {
            setFieldOptionValue(feId, optionId, false);
          }
        }
      }
      loroDoc.commitDoc();
    },

    cycleNodeCheckbox: (nodeId) => {
      const node = loroDoc.toNodexNode(nodeId);
      if (!node) return;
      const result = resolveCmdEnterCycle(node);
      if (result.completedAt === undefined) {
        loroDoc.deleteNodeData(nodeId, 'completedAt');
      } else {
        loroDoc.setNodeData(nodeId, 'completedAt', result.completedAt);
      }
      loroDoc.commitDoc();
    },

    // ─── 配置操作 ───

    setConfigValue: (nodeId, configKey, value) => {
      loroDoc.setNodeData(nodeId, configKey, value);
      loroDoc.commitDoc();
    },

    addDoneMappingEntry: (tagDefId, checked, fieldDefId, optionId) => {
      const mappingKey = checked ? SYS_A.DONE_MAP_CHECKED : SYS_A.DONE_MAP_UNCHECKED;

      let mappingTupleId = findFieldEntry(tagDefId, mappingKey);
      if (!mappingTupleId) {
        mappingTupleId = nanoid();
        loroDoc.createNode(mappingTupleId, tagDefId);
        loroDoc.setNodeDataBatch(mappingTupleId, { type: 'fieldEntry', fieldDefId: mappingKey });
      }

      // Keep entries unique by (fieldDefId, optionId)
      const entryIds = loroDoc.getChildren(mappingTupleId);
      for (const entryId of entryIds) {
        const entryNode = loroDoc.toNodexNode(entryId);
        if (!entryNode || entryNode.type !== 'fieldEntry' || entryNode.fieldDefId !== fieldDefId) continue;

        for (const valueId of entryNode.children ?? []) {
          const valueNode = loroDoc.toNodexNode(valueId);
          const existingOptionId = valueNode?.targetId;
          if (existingOptionId === optionId) return;
        }
      }

      const mappingEntryId = nanoid();
      loroDoc.createNode(mappingEntryId, mappingTupleId);
      loroDoc.setNodeDataBatch(mappingEntryId, { type: 'fieldEntry', fieldDefId });

      const valueId = nanoid();
      loroDoc.createNode(valueId, mappingEntryId);
      loroDoc.setNodeData(valueId, 'targetId', optionId);
      loroDoc.commitDoc();
    },

    removeDoneMappingEntry: (tagDefId, checked, index) => {
      const mappingKey = checked ? SYS_A.DONE_MAP_CHECKED : SYS_A.DONE_MAP_UNCHECKED;
      const mappingTupleId = findFieldEntry(tagDefId, mappingKey);
      if (!mappingTupleId) return;

      // Keep index behavior aligned with UI list: only count valid mapping entries
      // (fieldEntry with at least one targetId value child).
      const entries = loroDoc.getChildren(mappingTupleId).filter((cid) => {
        const node = loroDoc.toNodexNode(cid);
        if (node?.type !== 'fieldEntry') return false;
        const hasValueTarget = (node.children ?? []).some((valueId) => {
          const valueNode = loroDoc.toNodexNode(valueId);
          return !!valueNode?.targetId;
        });
        return hasValueTarget;
      });
      const targetId = entries[index];
      if (!targetId) return;

      loroDoc.deleteNode(targetId);
      loroDoc.commitDoc();
    },

    // ─── Reference 操作 ───

    addReference: (parentId, targetNodeId, position) => {
      if (!canMutate('addReference')) return '';
      const rawTargetNode = loroDoc.toNodexNode(targetNodeId);
      const effectiveTargetId =
        rawTargetNode?.type === 'reference' && rawTargetNode.targetId
          ? rawTargetNode.targetId
          : targetNodeId;
      const blockReason = getTreeReferenceBlockReason(parentId, targetNodeId, {
        hasNode: loroDoc.hasNode,
        getNode: loroDoc.toNodexNode,
        getChildren: loroDoc.getChildren,
      });
      if (blockReason) {
        console.warn('[node-store] blocked tree reference', { parentId, targetNodeId, reason: blockReason });
        return '';
      }
      const refId = nanoid();
      loroDoc.createNode(refId, parentId, position);
      loroDoc.setNodeDataBatch(refId, {
        type: 'reference',
        targetId: effectiveTargetId,
      });
      loroDoc.commitDoc();
      return refId;
    },

    removeReference: (refNodeId) => {
      loroDoc.deleteNode(refNodeId);
      loroDoc.commitDoc();
    },

    startRefConversion: (refNodeId, parentId, position) => {
      if (!canMutate('startRefConversion')) return '';
      const refNode = loroDoc.toNodexNode(refNodeId);
      const isReferenceNode = refNode?.type === 'reference';
      const targetId = isReferenceNode ? refNode?.targetId : refNodeId;
      const targetNode = targetId ? loroDoc.toNodexNode(targetId) : null;
      const targetName = targetNode?.name ?? 'Untitled';

      // 仅当传入 reference 节点时删除该引用节点。
      if (isReferenceNode) {
        loroDoc.deleteNode(refNodeId);
      }

      // 创建临时内联引用节点
      const tempId = nanoid();
      const inlineRefs = [{ offset: 0, targetNodeId: targetId ?? '', displayName: targetName }];
      loroDoc.createNode(tempId, parentId, position);
      loroDoc.setNodeRichTextContent(tempId, '\uFFFC', [], inlineRefs);
      loroDoc.commitDoc();
      return tempId;
    },

    revertRefConversion: (tempNodeId, targetNodeId, parentId) => {
      const blockReason = getTreeReferenceBlockReason(parentId, targetNodeId, {
        hasNode: loroDoc.hasNode,
        getNode: loroDoc.toNodexNode,
        getChildren: loroDoc.getChildren,
      });
      if (blockReason) {
        console.warn('[node-store] blocked revertRefConversion -> tree reference', {
          tempNodeId, parentId, targetNodeId, reason: blockReason,
        });
        return;
      }

      const parentChildren = loroDoc.getChildren(parentId);
      const position = parentChildren.indexOf(tempNodeId);

      loroDoc.deleteNode(tempNodeId);

      get().addReference(parentId, targetNodeId, position >= 0 ? position : undefined);
      // addReference already calls commitDoc
    },

    // ─── Search Node 操作 ───

    createSearchNode: (tagDefId) => {
      if (!canMutate('createSearchNode')) return '';

      // De-duplication: check if a search node for this tag already exists in SEARCHES
      const searchesChildren = loroDoc.getChildren(CONTAINER_IDS.SEARCHES);
      for (const childId of searchesChildren) {
        const child = loroDoc.toNodexNode(childId);
        if (child?.type !== 'search') continue;
        // Check if it's a single-tag search node for the same tagDefId
        const conditions = child.children
          .map((id) => loroDoc.toNodexNode(id))
          .filter((n) => n?.type === 'queryCondition');
        if (conditions.length === 1) {
          const rootCond = conditions[0]!;
          if (rootCond.queryLogic === 'AND') {
            const leafIds = rootCond.children;
            if (leafIds.length === 1) {
              const leaf = loroDoc.toNodexNode(leafIds[0]);
              if (leaf?.queryOp === 'HAS_TAG' && leaf.queryTagDefId === tagDefId) {
                // Found existing search node for same tag — refresh and return
                get().refreshSearchResults(childId);
                return childId;
              }
            }
          }
        }
      }

      // Create new search node
      const tagDef = loroDoc.toNodexNode(tagDefId);
      const tagLabel = tagDef?.name?.replace(/<[^>]+>/g, '').trim() ?? tagDefId;
      const searchName = `Everything tagged #${tagLabel}`;

      const searchId = nanoid();
      loroDoc.createNode(searchId, CONTAINER_IDS.SEARCHES);
      loroDoc.setNodeDataBatch(searchId, {
        type: 'search',
        name: searchName,
      });

      // Create AND group (root condition, per design: always wrap in AND)
      const andGroupId = nanoid();
      loroDoc.createNode(andGroupId, searchId);
      loroDoc.setNodeDataBatch(andGroupId, {
        type: 'queryCondition',
        queryLogic: 'AND',
      });

      // Create HAS_TAG leaf condition
      const condId = nanoid();
      loroDoc.createNode(condId, andGroupId);
      loroDoc.setNodeDataBatch(condId, {
        type: 'queryCondition',
        queryOp: 'HAS_TAG',
        queryTagDefId: tagDefId,
      });

      loroDoc.commitDoc('system:refresh');

      // Run initial search and materialize results
      get().refreshSearchResults(searchId);

      return searchId;
    },

    refreshSearchResults: (searchNodeId) => {
      if (!canMutate('refreshSearchResults')) return;

      const searchNode = loroDoc.toNodexNode(searchNodeId);
      if (!searchNode || searchNode.type !== 'search') return;

      // Run the search query
      const matchedIds = runSearch(searchNodeId);

      // Read existing reference children
      const existingRefs = new Map<string, string>(); // targetId → refNodeId
      for (const childId of searchNode.children) {
        const child = loroDoc.toNodexNode(childId);
        if (child?.type === 'reference' && child.targetId) {
          existingRefs.set(child.targetId, childId);
        }
      }

      // Determine additions and removals
      const toAdd = new Set<string>();
      for (const id of matchedIds) {
        if (!existingRefs.has(id)) {
          toAdd.add(id);
        }
      }

      const toRemove: string[] = [];
      for (const [targetId, refNodeId] of existingRefs) {
        if (!matchedIds.has(targetId)) {
          toRemove.push(refNodeId);
        }
      }

      // Apply changes: remove stale references
      for (const refNodeId of toRemove) {
        loroDoc.deleteNode(refNodeId);
      }

      // Apply changes: add new references
      for (const targetId of toAdd) {
        const refId = nanoid();
        loroDoc.createNode(refId, searchNodeId);
        loroDoc.setNodeDataBatch(refId, {
          type: 'reference',
          targetId,
        });
      }

      // Update lastRefreshedAt
      loroDoc.setNodeData(searchNodeId, 'lastRefreshedAt', Date.now());

      // Single commit with system:refresh origin (excluded from undo stack)
      loroDoc.commitDoc('system:refresh');
    },

    // ─── View 操作 ───

    getViewDefId: (parentId) => {
      const children = loroDoc.getChildren(parentId);
      for (const childId of children) {
        const child = loroDoc.toNodexNode(childId);
        if (child?.type === 'viewDef') return childId;
      }
      return null;
    },

    setSortConfig: (parentId, field, direction) => {
      if (!canMutate('setSortConfig')) return;
      let viewDefId = get().getViewDefId(parentId);
      if (!viewDefId) {
        viewDefId = nanoid();
        loroDoc.createNode(viewDefId, parentId, 0);
        loroDoc.setNodeDataBatch(viewDefId, { type: 'viewDef' });
      }
      loroDoc.setNodeDataBatch(viewDefId, { sortField: field, sortDirection: direction });
      loroDoc.commitDoc();
      set({ _version: get()._version + 1 });
    },

    clearSort: (parentId) => {
      if (!canMutate('clearSort')) return;
      const viewDefId = get().getViewDefId(parentId);
      if (!viewDefId) return;
      loroDoc.deleteNodeData(viewDefId, 'sortField');
      loroDoc.deleteNodeData(viewDefId, 'sortDirection');
      loroDoc.commitDoc();
      set({ _version: get()._version + 1 });
    },

    toggleToolbar: (nodeId) => {
      if (!canMutate('toggleToolbar')) return;
      let viewDefId = get().getViewDefId(nodeId);
      if (!viewDefId) {
        viewDefId = nanoid();
        loroDoc.createNode(viewDefId, nodeId, 0);
        loroDoc.setNodeDataBatch(viewDefId, { type: 'viewDef', toolbarVisible: true });
      } else {
        const viewDef = loroDoc.toNodexNode(viewDefId);
        const current = viewDef?.toolbarVisible ?? false;
        loroDoc.setNodeDataBatch(viewDefId, { toolbarVisible: !current });
      }
      loroDoc.commitDoc();
      set({ _version: get()._version + 1 });
    },

    createNodeInSearchContext: (searchNodeId, data) => {
      if (!canMutate('createNodeInSearchContext')) return { id: '', name: '', children: [], tags: [] } as unknown as NodexNode;
      const searchNode = loroDoc.toNodexNode(searchNodeId);
      if (!searchNode || searchNode.type !== 'search') return get().createChild(searchNodeId, undefined, data);
      const nodeId = nanoid();
      loroDoc.createNode(nodeId, CONTAINER_IDS.LIBRARY);
      const now = Date.now();
      loroDoc.setNodeDataBatch(nodeId, { ...data, createdAt: now, updatedAt: now });
      const tagDefIds = extractHasTagIds(searchNode);
      for (const tagDefId of tagDefIds) loroDoc.addTag(nodeId, tagDefId);
      if (tagDefIds.length > 0) syncTemplateMutationsNoCommit(nodeId);
      const refId = nanoid();
      loroDoc.createNode(refId, searchNodeId);
      loroDoc.setNodeDataBatch(refId, { type: 'reference', targetId: nodeId });
      loroDoc.commitDoc();
      set({ _version: get()._version + 1 });
      return loroDoc.toNodexNode(nodeId)!;
    },
  };
});

// ─── 全局 store 访问（供 standalone 调试）───

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__nodeStore = useNodeStore;
}

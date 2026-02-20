/**
 * Loro 文档管理器 — 全局单例
 *
 * 封装 LoroDoc + LoroTree 操作，维护 Nodex ID ↔ Loro TreeID 双向映射。
 * TreeID 在 loro-crdt 1.x 中为字符串 `"counter@peer"`，可直接用作 Map key。
 */

import { LoroDoc, LoroList, UndoManager, type TreeID } from 'loro-crdt';
import { nanoid } from 'nanoid';
import type { NodexNode, DoneMappingEntry } from '../types/node.js';
import { saveSnapshot, loadSnapshot } from './loro-persistence.js';

// ============================================================
// 内部状态
// ============================================================

let doc: LoroDoc | null = null;
let undoManager: UndoManager | null = null;

/** Nodex ID → Loro TreeID（字符串） */
const nodexToTree = new Map<string, TreeID>();

/** Loro TreeID → Nodex ID */
const treeToNodex = new Map<TreeID, string>();

/** 当前工作区 ID */
let currentWorkspaceId: string | null = null;

/** 变更订阅回调 */
const subscribers = new Set<() => void>();

/** 防抖保存定时器 */
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// ============================================================
// 树访问辅助
// ============================================================

function getTree() {
  if (!doc) throw new Error('[loro-doc] LoroDoc 未初始化，请先调用 initLoroDoc()');
  return doc.getTree('nodes');
}

// ============================================================
// 映射维护
// ============================================================

function registerMapping(nodexId: string, treeId: TreeID): void {
  nodexToTree.set(nodexId, treeId);
  treeToNodex.set(treeId, nodexId);
}

function removeMapping(nodexId: string): void {
  const treeId = nodexToTree.get(nodexId);
  if (treeId) {
    treeToNodex.delete(treeId);
    nodexToTree.delete(nodexId);
  }
}

/** 从 Loro 快照重建映射（init 时调用） */
function rebuildMappings(): void {
  nodexToTree.clear();
  treeToNodex.clear();
  const tree = getTree();
  for (const node of tree.nodes()) {
    const storedId = node.data.get('id') as string | undefined;
    if (storedId) {
      registerMapping(storedId, node.id);
    }
  }
}

// ============================================================
// 通知 + 持久化
// ============================================================

function notifySubscribers(): void {
  for (const cb of subscribers) cb();
}

function scheduleSave(): void {
  if (!currentWorkspaceId) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void persistSnapshot(); }, 1500);
}

async function persistSnapshot(): Promise<void> {
  if (!doc || !currentWorkspaceId) return;
  try {
    const snapshot = doc.export({ mode: 'snapshot' });
    await saveSnapshot(currentWorkspaceId, snapshot);
  } catch (e) {
    console.warn('[loro-doc] 快照保存失败:', e);
  }
}

// ============================================================
// 初始化
// ============================================================

export async function initLoroDoc(workspaceId: string): Promise<void> {
  if (doc && currentWorkspaceId === workspaceId) return;

  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  currentWorkspaceId = workspaceId;
  doc = new LoroDoc();

  try {
    const snapshot = await loadSnapshot(workspaceId);
    if (snapshot) {
      doc.import(snapshot);
      rebuildMappings();
      console.log(`[loro-doc] 从快照恢复 ${workspaceId}，节点数: ${nodexToTree.size}`);
    }
  } catch (e) {
    console.warn('[loro-doc] 快照加载失败，从空白开始:', e);
  }

  undoManager = new UndoManager(doc, { mergeInterval: 500 });

  doc.subscribe(() => {
    notifySubscribers();
    scheduleSave();
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void persistSnapshot();
    });
    window.addEventListener('beforeunload', () => void persistSnapshot(), { once: true });
  }
}

/** 重置（仅测试用） */
export function resetLoroDoc(): void {
  doc = null;
  undoManager = null;
  nodexToTree.clear();
  treeToNodex.clear();
  currentWorkspaceId = null;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
}

/** 同步初始化（仅测试用，不加载快照） */
export function initLoroDocForTest(workspaceId: string): void {
  doc = new LoroDoc();
  currentWorkspaceId = workspaceId;
  nodexToTree.clear();
  treeToNodex.clear();
  // mergeInterval=0 for deterministic tests; exclude '__seed__' origin so
  // seed-data commits are not tracked in the undo stack.
  undoManager = new UndoManager(doc, { mergeInterval: 0, excludeOriginPrefixes: ['__seed__'] });
  doc.subscribe(() => notifySubscribers());
}

// ============================================================
// 核心树操作
// ============================================================

export function createNode(
  nodexId: string | undefined,
  parentNodexId: string | null,
  index?: number,
): string {
  const tree = getTree();
  const id = nodexId ?? nanoid();
  const parentTreeId = parentNodexId ? nodexToTree.get(parentNodexId) : undefined;
  const treeNode = tree.createNode(parentTreeId, index);
  registerMapping(id, treeNode.id);
  treeNode.data.set('id', id);
  treeNode.data.set('createdAt', Date.now());
  treeNode.data.set('updatedAt', Date.now());
  treeNode.data.setContainer('tags', new LoroList());
  return id;
}

export function moveNode(nodexId: string, newParentNodexId: string, index?: number): void {
  const tree = getTree();
  const treeId = nodexToTree.get(nodexId);
  const parentTreeId = nodexToTree.get(newParentNodexId);
  if (!treeId || !parentTreeId) return;
  tree.move(treeId, parentTreeId, index);
}

function collectDescendants(nodexId: string): string[] {
  const result: string[] = [];
  for (const childId of getChildren(nodexId)) {
    result.push(childId, ...collectDescendants(childId));
  }
  return result;
}

export function deleteNode(nodexId: string): void {
  const tree = getTree();
  const treeId = nodexToTree.get(nodexId);
  if (!treeId) return;
  const toRemove = [nodexId, ...collectDescendants(nodexId)];
  tree.delete(treeId);
  for (const id of toRemove) removeMapping(id);
}

// ============================================================
// 节点属性读写
// ============================================================

export function getNodeData(nodexId: string): Record<string, unknown> | null {
  const tree = getTree();
  const treeId = nodexToTree.get(nodexId);
  if (!treeId) return null;
  const node = tree.getNodeByID(treeId);
  if (!node) return null;
  return node.data.toJSON() as Record<string, unknown>;
}

export function setNodeData(nodexId: string, key: string, value: unknown): void {
  const tree = getTree();
  const treeId = nodexToTree.get(nodexId);
  if (!treeId) return;
  const node = tree.getNodeByID(treeId);
  if (!node) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  node.data.set(key as any, value as any);
  node.data.set('updatedAt', Date.now());
}

export function setNodeDataBatch(nodexId: string, data: Record<string, unknown>): void {
  const tree = getTree();
  const treeId = nodexToTree.get(nodexId);
  if (!treeId) return;
  const node = tree.getNodeByID(treeId);
  if (!node) return;
  for (const [key, value] of Object.entries(data)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    node.data.set(key as any, value as any);
  }
  if (!('updatedAt' in data)) node.data.set('updatedAt', Date.now());
}

export function deleteNodeData(nodexId: string, key: string): void {
  const tree = getTree();
  const treeId = nodexToTree.get(nodexId);
  if (!treeId) return;
  const node = tree.getNodeByID(treeId);
  if (!node) return;
  node.data.delete(key);
}

// ============================================================
// Tags 操作（LoroList）
// ============================================================

function getTagsContainer(nodexId: string): LoroList | null {
  const tree = getTree();
  const treeId = nodexToTree.get(nodexId);
  if (!treeId) return null;
  const node = tree.getNodeByID(treeId);
  if (!node) return null;
  return node.data.getOrCreateContainer('tags', new LoroList()) as LoroList;
}

export function addTag(nodexId: string, tagDefId: string): void {
  const tags = getTagsContainer(nodexId);
  if (!tags) return;
  const arr = tags.toArray() as string[];
  if (!arr.includes(tagDefId)) tags.insert(arr.length, tagDefId);
}

export function removeTag(nodexId: string, tagDefId: string): void {
  const tags = getTagsContainer(nodexId);
  if (!tags) return;
  const arr = tags.toArray() as string[];
  const idx = arr.indexOf(tagDefId);
  if (idx !== -1) tags.delete(idx, 1);
}

export function getTags(nodexId: string): string[] {
  const tags = getTagsContainer(nodexId);
  if (!tags) return [];
  return [...new Set(tags.toArray() as string[])];
}

// ============================================================
// LoroList 复合属性
// ============================================================

function getListContainer(nodexId: string, key: string): LoroList | null {
  const tree = getTree();
  const treeId = nodexToTree.get(nodexId);
  if (!treeId) return null;
  const node = tree.getNodeByID(treeId);
  if (!node) return null;
  return node.data.getOrCreateContainer(key, new LoroList()) as LoroList;
}

export function getNodeList(nodexId: string, key: string): unknown[] {
  const list = getListContainer(nodexId, key);
  return list ? (list.toArray() as unknown[]) : [];
}

export function pushToNodeList(nodexId: string, key: string, value: unknown): void {
  const list = getListContainer(nodexId, key);
  if (!list) return;
  list.insert(list.length, value);
}

export function removeFromNodeList(nodexId: string, key: string, index: number): void {
  const list = getListContainer(nodexId, key);
  if (!list) return;
  list.delete(index, 1);
}

export function clearNodeList(nodexId: string, key: string): void {
  const list = getListContainer(nodexId, key);
  if (!list || list.length === 0) return;
  list.delete(0, list.length);
}

// ============================================================
// 查询
// ============================================================

export function getChildren(parentNodexId: string): string[] {
  const tree = getTree();
  const parentTreeId = nodexToTree.get(parentNodexId);
  if (!parentTreeId) return [];
  const parent = tree.getNodeByID(parentTreeId);
  if (!parent) return [];
  return (parent.children() ?? [])
    .map(c => treeToNodex.get(c.id))
    .filter((id): id is string => id !== undefined);
}

export function getParentId(nodexId: string): string | null {
  const tree = getTree();
  const treeId = nodexToTree.get(nodexId);
  if (!treeId) return null;
  const node = tree.getNodeByID(treeId);
  if (!node) return null;
  const parent = node.parent();
  if (!parent) return null;
  return treeToNodex.get(parent.id) ?? null;
}

export function hasNode(nodexId: string): boolean {
  return nodexToTree.has(nodexId);
}

export function getAllNodeIds(): string[] {
  return [...nodexToTree.keys()];
}

export function getRootNodeIds(): string[] {
  const tree = getTree();
  return tree.roots()
    .map(n => treeToNodex.get(n.id))
    .filter((id): id is string => id !== undefined);
}

// ============================================================
// toNodexNode —— Loro → NodexNode 转换
// ============================================================

export function toNodexNode(nodexId: string): NodexNode | null {
  const tree = getTree();
  const treeId = nodexToTree.get(nodexId);
  if (!treeId) return null;
  const treeNode = tree.getNodeByID(treeId);
  if (!treeNode) return null;

  const data = treeNode.data;
  const childIds = (treeNode.children() ?? [])
    .map(c => treeToNodex.get(c.id))
    .filter((id): id is string => id !== undefined);

  const tagsRaw = data.getOrCreateContainer('tags', new LoroList()) as LoroList;
  const tags = [...new Set(tagsRaw.toArray() as string[])];
  const now = Date.now();

  return {
    id: nodexId,
    type: data.get('type') as NodexNode['type'],
    name: data.get('name') as string | undefined,
    description: data.get('description') as string | undefined,
    children: childIds,
    tags,
    createdAt: (data.get('createdAt') as number | undefined) ?? now,
    updatedAt: (data.get('updatedAt') as number | undefined) ?? now,
    completedAt: data.get('completedAt') as number | undefined,
    publishedAt: data.get('publishedAt') as number | undefined,
    marks: data.get('marks') as NodexNode['marks'],
    inlineRefs: data.get('inlineRefs') as NodexNode['inlineRefs'],
    templateId: data.get('templateId') as string | undefined,
    viewMode: data.get('viewMode') as NodexNode['viewMode'],
    editMode: data.get('editMode') as boolean | undefined,
    flags: data.get('flags') as number | undefined,
    imageWidth: data.get('imageWidth') as number | undefined,
    imageHeight: data.get('imageHeight') as number | undefined,
    searchContext: data.get('searchContext') as string | undefined,
    aiSummary: data.get('aiSummary') as string | undefined,
    sourceUrl: data.get('sourceUrl') as string | undefined,
    targetId: data.get('targetId') as string | undefined,
    fieldDefId: data.get('fieldDefId') as string | undefined,
    showCheckbox: data.get('showCheckbox') as boolean | undefined,
    childSupertag: data.get('childSupertag') as string | undefined,
    color: data.get('color') as string | undefined,
    extends: data.get('extends') as string | undefined,
    doneStateEnabled: data.get('doneStateEnabled') as boolean | undefined,
    fieldType: data.get('fieldType') as string | undefined,
    cardinality: data.get('cardinality') as 'single' | 'list' | undefined,
    nullable: data.get('nullable') as boolean | undefined,
    hideField: data.get('hideField') as string | undefined,
    autoInitialize: data.get('autoInitialize') as boolean | undefined,
    autocollectOptions: data.get('autocollectOptions') as boolean | undefined,
    minValue: data.get('minValue') as number | undefined,
    maxValue: data.get('maxValue') as number | undefined,
    sourceSupertag: data.get('sourceSupertag') as string | undefined,
  };
}

// ============================================================
// 持久化 API
// ============================================================

export async function saveNow(): Promise<void> {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  await persistSnapshot();
}

export function exportSnapshot(): Uint8Array {
  if (!doc) throw new Error('[loro-doc] LoroDoc 未初始化');
  return doc.export({ mode: 'snapshot' });
}

export function importUpdates(data: Uint8Array): void {
  if (!doc) throw new Error('[loro-doc] LoroDoc 未初始化');
  doc.import(data);
  rebuildMappings();
}

// ============================================================
// 事件订阅
// ============================================================

export function subscribe(callback: () => void): () => void {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

// ============================================================
// Done-State Mapping 专用 API
// ============================================================

export function addDoneMappingEntry(
  tagDefId: string,
  checked: boolean,
  entry: DoneMappingEntry,
): void {
  const key = checked ? 'doneCheckedMappings' : 'doneUncheckedMappings';
  pushToNodeList(tagDefId, key, entry);
}

export function removeDoneMappingEntry(
  tagDefId: string,
  checked: boolean,
  index: number,
): void {
  const key = checked ? 'doneCheckedMappings' : 'doneUncheckedMappings';
  removeFromNodeList(tagDefId, key, index);
}

export function getDoneMappings(tagDefId: string, checked: boolean): DoneMappingEntry[] {
  const key = checked ? 'doneCheckedMappings' : 'doneUncheckedMappings';
  return getNodeList(tagDefId, key) as DoneMappingEntry[];
}

export function getLoroDoc(): LoroDoc {
  if (!doc) throw new Error('[loro-doc] LoroDoc 未初始化');
  return doc;
}

// ============================================================
// UndoManager — 结构性撤销/重做
// ============================================================

/** 显式提交当前 pending 事务（origin 用于 UndoManager 过滤）*/
export function commitDoc(origin?: string): void {
  if (!doc) return;
  doc.commit(origin ? { origin } : undefined);
}

export function undoDoc(): boolean {
  const result = undoManager?.undo() ?? false;
  if (result) rebuildMappings();
  return result;
}

export function redoDoc(): boolean {
  const result = undoManager?.redo() ?? false;
  if (result) rebuildMappings();
  return result;
}

export function canUndoDoc(): boolean {
  return undoManager?.canUndo() ?? false;
}

export function canRedoDoc(): boolean {
  return undoManager?.canRedo() ?? false;
}

/**
 * Loro 文档管理器 — 全局单例
 *
 * 封装 LoroDoc + LoroTree 操作，维护 Nodex ID ↔ Loro TreeID 双向映射。
 * TreeID 在 loro-crdt 1.x 中为字符串 `"counter@peer"`，可直接用作 Map key。
 */

import { LoroDoc, LoroList, LoroText, LoroMovableList, UndoManager, VersionVector, type TreeID, type PeerID } from 'loro-crdt';
import { nanoid } from 'nanoid';
import type { NodexNode, DoneMappingEntry } from '../types/node.js';
import { saveSnapshot, loadSnapshot } from './loro-persistence.js';
import { resetAwareness } from './awareness.js';

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

/** 全局变更订阅回调 */
const subscribers = new Set<() => void>();

// ============================================================
// ② Fine-grained subscriptions — per-node 订阅内部状态
// ============================================================

interface NodeSub {
  callbacks: Set<() => void>;
  unsub: (() => void) | null;
}

/** nodexId → 该节点的订阅集合 */
const nodeSubscriptions = new Map<string, NodeSub>();

function attachNodeDataSub(nodexId: string, sub: NodeSub): void {
  sub.unsub?.();
  sub.unsub = null;
  if (!doc) return;
  const treeId = nodexToTree.get(nodexId);
  if (!treeId) return;
  const treeNode = doc.getTree('nodes').getNodeByID(treeId);
  if (!treeNode) return;
  sub.unsub = treeNode.data.subscribe(() => {
    for (const cb of sub.callbacks) cb();
  });
}

function reattachNodeSubs(): void {
  for (const [nodexId, sub] of nodeSubscriptions) {
    attachNodeDataSub(nodexId, sub);
  }
}

/** 防抖保存定时器 */
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// ============================================================
// 读取缓存 — 保证同一 version 内 toNodexNode/getChildren 返回稳定引用
// React 的 useSyncExternalStore 要求 getSnapshot 返回缓存结果，
// 否则会因引用不稳定触发无限 re-render。
// ============================================================

let _cacheVer = 0;
let _lastCacheVer = -1;
const _nodeCache = new Map<string, NodexNode | null>();
const _childrenCache = new Map<string, string[]>();

/** 标记缓存失效（每次 Loro 数据变更时调用） */
function invalidateCache(): void { _cacheVer++; }

/** 在读取前调用 — 若版本变化则清空缓存 */
function checkCache(): void {
  if (_lastCacheVer !== _cacheVer) {
    _nodeCache.clear();
    _childrenCache.clear();
    _lastCacheVer = _cacheVer;
  }
}

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
  invalidateCache();
  const tree = getTree();
  for (const node of tree.nodes()) {
    const storedId = node.data.get('id') as string | undefined;
    if (storedId) {
      registerMapping(storedId, node.id);
    }
  }
  // ② 重建后重新挂载 per-node 订阅（checkout/import 后 TreeNode 引用可能失效）
  reattachNodeSubs();
}

// ============================================================
// 通知 + 持久化
// ============================================================

function notifySubscribers(): void {
  invalidateCache();
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
  // 切换工作区时清除上一个工作区的 awareness 状态，避免跨工作区泄露
  resetAwareness();

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
  // ② 清理 per-node 订阅
  for (const sub of nodeSubscriptions.values()) sub.unsub?.();
  nodeSubscriptions.clear();

  doc = null;
  undoManager = null;
  nodexToTree.clear();
  treeToNodex.clear();
  currentWorkspaceId = null;
  invalidateCache();
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

/**
 * 重置 UndoManager（仅测试用）。
 * 在 seedTestDataSync 末尾调用，清除种子操作产生的（非 __seed__ origin）撤销记录。
 * Store actions（如 applyTag）内部调用 commitDoc() 时 origin=undefined，
 * 不会被 excludeOriginPrefixes 过滤，需在 seeding 完成后手动重置。
 */
export function clearUndoHistoryForTest(): void {
  if (!doc) return;
  undoManager = new UndoManager(doc, { mergeInterval: 0, excludeOriginPrefixes: ['__seed__'] });
}

/**
 * 设置提交合并间隔（毫秒）。
 * 设为 -1 禁用合并（每次 commitDoc 产生独立 Change，用于确保 getVersionHistory 精确）。
 * 设为 0 使用 Loro 默认行为（同步内连续提交会被合并）。
 */
export function setDocChangeMergeInterval(ms: number): void {
  if (!doc) throw new Error('[loro-doc] LoroDoc 未初始化');
  doc.setChangeMergeInterval(ms);
}

// ============================================================
// 核心树操作
// ============================================================

export function createNode(
  nodexId: string | undefined,
  parentNodexId: string | null,
  index?: number,
): string {
  invalidateCache();
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
  invalidateCache();
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
  invalidateCache();
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
  invalidateCache();
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
  invalidateCache();
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
  invalidateCache();
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
  invalidateCache();
  const tags = getTagsContainer(nodexId);
  if (!tags) return;
  const arr = tags.toArray() as string[];
  if (!arr.includes(tagDefId)) tags.insert(arr.length, tagDefId);
}

export function removeTag(nodexId: string, tagDefId: string): void {
  invalidateCache();
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
  invalidateCache();
  const list = getListContainer(nodexId, key);
  if (!list) return;
  list.insert(list.length, value);
}

export function removeFromNodeList(nodexId: string, key: string, index: number): void {
  invalidateCache();
  const list = getListContainer(nodexId, key);
  if (!list) return;
  list.delete(index, 1);
}

export function clearNodeList(nodexId: string, key: string): void {
  invalidateCache();
  const list = getListContainer(nodexId, key);
  if (!list || list.length === 0) return;
  list.delete(0, list.length);
}

// ============================================================
// 查询
// ============================================================

const EMPTY_CHILDREN: string[] = [];

export function getChildren(parentNodexId: string): string[] {
  checkCache();
  const cached = _childrenCache.get(parentNodexId);
  if (cached !== undefined) return cached;

  const tree = getTree();
  const parentTreeId = nodexToTree.get(parentNodexId);
  if (!parentTreeId) { _childrenCache.set(parentNodexId, EMPTY_CHILDREN); return EMPTY_CHILDREN; }
  const parent = tree.getNodeByID(parentTreeId);
  if (!parent) { _childrenCache.set(parentNodexId, EMPTY_CHILDREN); return EMPTY_CHILDREN; }
  const result = (parent.children() ?? [])
    .map(c => treeToNodex.get(c.id))
    .filter((id): id is string => id !== undefined);
  _childrenCache.set(parentNodexId, result);
  return result;
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
  checkCache();
  const cached = _nodeCache.get(nodexId);
  if (cached !== undefined) return cached;

  const tree = getTree();
  const treeId = nodexToTree.get(nodexId);
  if (!treeId) { _nodeCache.set(nodexId, null); return null; }
  const treeNode = tree.getNodeByID(treeId);
  if (!treeNode) { _nodeCache.set(nodexId, null); return null; }

  const data = treeNode.data;
  const childIds = (treeNode.children() ?? [])
    .map(c => treeToNodex.get(c.id))
    .filter((id): id is string => id !== undefined);

  const tagsRaw = data.getOrCreateContainer('tags', new LoroList()) as LoroList;
  const tags = [...new Set(tagsRaw.toArray() as string[])];
  const now = Date.now();

  const result: NodexNode = {
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
  _nodeCache.set(nodexId, result);
  return result;
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

// ============================================================
// ② Fine-grained subscriptions — per-node 订阅 API
// ============================================================

/**
 * 订阅单个节点的数据变更（name / type / tags / 字段等）。
 *
 * - 仅触发该节点 LoroMap 数据变化，不触发无关节点
 * - 结构变更（children 增删移）仍需通过全局 subscribe() 监听
 * - 保留全局 _version 作为 fallback，本 API 为 opt-in
 *
 * @returns 取消订阅函数
 *
 * @example
 * ```ts
 * const unsub = subscribeNode('nodeA', () => console.log('A changed'));
 * // Later:
 * unsub();
 * ```
 */
export function subscribeNode(nodexId: string, callback: () => void): () => void {
  let sub = nodeSubscriptions.get(nodexId);
  if (!sub) {
    sub = { callbacks: new Set(), unsub: null };
    nodeSubscriptions.set(nodexId, sub);
    attachNodeDataSub(nodexId, sub);
  }
  sub.callbacks.add(callback);
  return () => {
    sub!.callbacks.delete(callback);
    if (sub!.callbacks.size === 0) {
      sub!.unsub?.();
      nodeSubscriptions.delete(nodexId);
    }
  };
}

// ============================================================
// ⑤ Incremental Sync — 增量更新导出/导入
// ============================================================

/**
 * 获取当前文档的版本向量（VersionVector）。
 * 配合 exportFrom() 实现增量同步：目标端先 getVersionVector()，
 * 再传给源端的 exportFrom()，只导出目标端缺少的部分。
 */
export function getVersionVector(): VersionVector {
  if (!doc) throw new Error('[loro-doc] LoroDoc 未初始化');
  return doc.oplogVersion();
}

/**
 * 从指定版本向量导出增量更新（update bytes）。
 * @param from 目标端的版本向量（通过 getVersionVector() 获取）
 * @returns Uint8Array，可直接传给对端的 importUpdates()
 */
export function exportFrom(from: VersionVector): Uint8Array {
  if (!doc) throw new Error('[loro-doc] LoroDoc 未初始化');
  return doc.export({ mode: 'update', from });
}

// ============================================================
// ④ Time Travel / Checkout — 版本历史记录
// ============================================================

/** getVersionHistory() 返回的单条历史记录 */
export interface VersionHistoryEntry {
  /** 唯一 ID，格式 `${peer}_${counter}` */
  id: string;
  peer: PeerID;
  /** 该 Change 起始 counter */
  counter: number;
  /** Lamport 时间戳（全局排序依据） */
  lamport: number;
  /** 提交消息（通过 commitDoc({ message }) 设置） */
  message: string | undefined;
  /** Unix 秒时间戳（需 setRecordTimestamp(true)，否则为 0） */
  timestamp: number;
  /** 前驱操作 ID（DAG deps） */
  deps: Array<{ peer: PeerID; counter: number }>;
}

/**
 * 获取文档全部版本历史，按 lamport 时间戳升序排列。
 * 每条记录对应一次 doc.commit()。
 */
export function getVersionHistory(): VersionHistoryEntry[] {
  if (!doc) return [];
  // getAllChanges() 返回 Map<peer, Change[]>
  const allChanges = doc.getAllChanges() as Map<PeerID, Array<{
    lamport: number;
    length: number;
    counter: number;
    deps: Array<{ peer: PeerID; counter: number }>;
    timestamp: number;
    message: string | undefined;
  }>>;
  const history: VersionHistoryEntry[] = [];
  for (const [peer, changes] of allChanges) {
    for (const change of changes) {
      history.push({
        id: `${peer}_${change.counter}`,
        peer,
        counter: change.counter,
        lamport: change.lamport,
        message: change.message,
        timestamp: change.timestamp,
        deps: change.deps,
      });
    }
  }
  return history.sort((a, b) => a.lamport - b.lamport || (a.peer < b.peer ? -1 : 1));
}

/**
 * Checkout 到指定 frontiers（进入 detached 只读历史状态）。
 * @param frontiers 格式：`[{ peer, counter }]`，来自 doc.frontiers() 或 getVersionHistory()
 *
 * 注意：checkout 后 doc 处于 detached 模式，写操作无效。
 * 调用 checkoutToLatest() 退出历史模式。
 */
export function checkout(frontiers: Array<{ peer: PeerID; counter: number }>): void {
  if (!doc) throw new Error('[loro-doc] LoroDoc 未初始化');
  doc.checkout(frontiers);
  rebuildMappings();
}

/**
 * 退出 detached 历史模式，回到最新状态。
 */
export function checkoutToLatest(): void {
  if (!doc) throw new Error('[loro-doc] LoroDoc 未初始化');
  doc.checkoutToLatest();
  rebuildMappings();
}

/**
 * 当前是否处于 detached（历史 checkout）模式。
 */
export function isDetached(): boolean {
  return doc?.isDetached() ?? false;
}

/**
 * 获取当前 frontiers（最新提交位置）。
 * 可传给 checkout() 实现版本跳转。
 */
export function getCurrentFrontiers(): Array<{ peer: PeerID; counter: number }> {
  if (!doc) return [];
  return doc.frontiers() as Array<{ peer: PeerID; counter: number }>;
}

// ============================================================
// ③ LoroText + Peritext marks 基础设施
// ============================================================

/**
 * 获取节点的富文本容器（只读，不自动创建）。
 * 若节点不存在或未初始化富文本，返回 null。
 *
 * 注意：name 字段仍使用 string（ProseMirror 当前 source of truth）。
 * 此 API 为 Phase 2 ProseMirror↔Loro 同步预留基础设施。
 */
export function getNodeText(nodexId: string): LoroText | null {
  const treeId = nodexToTree.get(nodexId);
  if (!treeId) return null;
  const node = getTree().getNodeByID(treeId);
  if (!node) return null;
  const existing = node.data.get('richText');
  if (existing instanceof LoroText) return existing;
  return null;
}

/**
 * 获取或创建节点的富文本容器（Peritext marks 支持）。
 * 幂等：多次调用返回同一 LoroText 实例。
 *
 * 使用方式：
 * ```ts
 * const text = getOrCreateNodeText('nodeId');
 * text?.insert(0, 'Hello');
 * text?.mark({ start: 0, end: 5 }, 'bold', true);
 * commitDoc();
 * ```
 */
export function getOrCreateNodeText(nodexId: string): LoroText | null {
  invalidateCache();
  const treeId = nodexToTree.get(nodexId);
  if (!treeId) return null;
  const node = getTree().getNodeByID(treeId);
  if (!node) return null;
  return node.data.getOrCreateContainer('richText', new LoroText()) as LoroText;
}

// ============================================================
// ① LoroMovableList — 并发安全性评估
//
// 结论：LoroTree.move() 已是 Kleppmann 2021 并发安全树移动算法。
// 测试验证：两个 peer 并发移动同一节点到不同父节点，merge 后收敛
// （见 loro-step0-validation.test.ts 循环引用检测 + loro-infra.test.ts 并发移动收敛）。
//
// tags 使用 LoroList（字符串 ID 列表）：
// - addTag/removeTag 并发安全：两端同时 addTag 不会丢失（LWW），不会产生重复（去重）
// - 标签顺序在语义上不重要，LoroList 的 insert 并发顺序不影响功能
// - 结论：tags 保持 LoroList，无需迁移至 LoroMovableList
//
// LoroMovableList 适用场景：需要并发安全重排序的有序列表（如用户手动排序的视图列表）
// ============================================================

/**
 * [仅供参考] 检查 LoroMovableList 是否可用。
 * 注意：返回的是独立实例，未绑定到任何 LoroDoc container，无法持久化/同步。
 * 实际持久化场景需通过 treeNode.data.getOrCreateContainer('key', new LoroMovableList()) 获取。
 */
export function createMovableList(): LoroMovableList {
  return new LoroMovableList();
}

// ============================================================
// ⑥ doc.fork() — 文档分支
// ============================================================

/** forkDoc() 返回值 */
export interface DocFork {
  /** 独立分支文档（可随意修改，不影响主 doc） */
  doc: LoroDoc;
  /** 将分支变更合并回主 doc（幂等） */
  merge: () => void;
}

/**
 * 创建主 doc 的独立分支。
 *
 * - fork 从当前最新状态开始，与主 doc 完全隔离
 * - fork.doc 可独立修改，主 doc 不受影响
 * - fork.merge() 将 fork 的增量变更导入主 doc（可多次调用）
 *
 * @example
 * ```ts
 * const { doc: fork, merge } = forkDoc();
 * fork.getTree('nodes').createNode(); // 修改 fork，主 doc 不变
 * fork.commit();
 * merge(); // 合并回主 doc
 * ```
 */
export function forkDoc(): DocFork {
  if (!doc) throw new Error('[loro-doc] LoroDoc 未初始化');
  const mainDoc = doc;
  const forkedDoc = mainDoc.fork();
  // 记录每次 merge 完成后 forked doc 的版本，避免重复导出已合并的 delta
  let lastMergedVV = mainDoc.oplogVersion();
  return {
    doc: forkedDoc,
    merge: () => {
      if (!doc) throw new Error('[loro-doc] 主 doc 已重置，无法合并');
      const delta = forkedDoc.export({ mode: 'update', from: lastMergedVV });
      if (delta.length > 0) {
        doc.import(delta);
        lastMergedVV = forkedDoc.oplogVersion();
        rebuildMappings();
      }
    },
  };
}

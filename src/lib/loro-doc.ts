/**
 * Loro 文档管理器 — 全局单例
 *
 * 封装 LoroDoc + LoroTree 操作，维护 soma ID ↔ Loro TreeID 双向映射。
 * TreeID 在 loro-crdt 1.x 中为字符串 `"counter@peer"`，可直接用作 Map key。
 */

import { LoroDoc, LoroList, LoroText, LoroMovableList, UndoManager, VersionVector, type TreeID, type PeerID, type Value } from 'loro-crdt';
import { nanoid } from 'nanoid';
import type { NodexNode } from '../types/node.js';
import { saveSnapshotRecord, loadSnapshotRecord } from './loro-persistence.js';
import { resetAwareness } from './awareness.js';
import { readRichTextFromLoroText, writeRichTextToLoroText } from './loro-text-bridge.js';
import { enqueuePendingUpdate } from './sync/pending-queue.js';
import { syncManager } from './sync/sync-manager.js';

export const DEFAULT_USER_COMMIT_ORIGIN = 'user:implicit';
export const AI_COMMIT_ORIGIN = 'ai:chat';
const UNDO_EXCLUDED_ORIGIN_PREFIXES = ['__seed__', 'system:'] as const;
const AI_UNDO_EXCLUDED_ORIGIN_PREFIXES = ['__seed__', 'system:', 'user:'] as const;
const detachedMutationWarnings = new Set<string>();
const RICH_TEXT_STYLE_CONFIG = {
  bold: { expand: 'after' },
  italic: { expand: 'after' },
  strike: { expand: 'after' },
  code: { expand: 'after' },
  highlight: { expand: 'after' },
  headingMark: { expand: 'after' },
  link: { expand: 'after' },
} as const;

// ============================================================
// 内部状态
// ============================================================

let doc: LoroDoc | null = null;
let undoManager: UndoManager | null = null;
let aiUndoManager: UndoManager | null = null;
const commitOriginOverrideStack: string[] = [];

/** soma ID → Loro TreeID（字符串） */
const nodexToTree = new Map<string, TreeID>();

/** Loro TreeID → soma ID */
const treeToNodex = new Map<TreeID, string>();

/** 当前工作区 ID */
let currentWorkspaceId: string | null = null;

/** Whether the current doc was loaded from an IndexedDB snapshot (vs fresh/empty). */
let _hadSnapshot = false;

/** 全局变更订阅回调 */
const subscribers = new Set<() => void>();

type UndoUIMeta = Value;
let captureUndoUIMeta: (() => UndoUIMeta) | null = null;
let restoreUndoUIMeta: ((meta: UndoUIMeta, isUndo: boolean) => void) | null = null;
const redoRestoreUIMetaStack: UndoUIMeta[] = [];

function bindUndoCallbacks(): void {
  if (!undoManager) return;
  if (captureUndoUIMeta) {
    undoManager.setOnPush((isUndo, _counterRange, _event) => ({
      value: captureUndoUIMeta?.() ?? null,
      cursors: [],
    }));
  } else {
    undoManager.setOnPush(undefined);
  }
  // Browser runtime behavior for onPop has shown inconsistencies vs Node test runtime.
  // We restore UI snapshots manually in undoDoc()/redoDoc() using topUndoValue() + a local redo stack.
  undoManager.setOnPop(undefined);
}

export function registerUndoUICallbacks(callbacks: {
  capture: (() => UndoUIMeta) | null;
  restore: ((meta: UndoUIMeta, isUndo: boolean) => void) | null;
}): void {
  captureUndoUIMeta = callbacks.capture;
  restoreUndoUIMeta = callbacks.restore;
  bindUndoCallbacks();
}

export function getCurrentWorkspaceId(): string | null {
  return currentWorkspaceId;
}

/**
 * Update the persistence key without reinitializing LoroDoc.
 *
 * Called after sign-in when workspace ID transitions from a bootstrap random UUID
 * to the authenticated user.id. This ensures persistSnapshot() saves under the
 * correct IndexedDB key so data survives across sessions.
 *
 * Does NOT reinitialize the LoroDoc — existing in-memory data (containers, nodes)
 * remains intact. Sync will import server data into the same doc instance.
 */
export function setCurrentWorkspaceId(workspaceId: string): void {
  currentWorkspaceId = workspaceId;
}

/**
 * Whether the current LoroDoc was loaded from an IndexedDB snapshot.
 * Returns false when the doc was freshly created (no local data).
 * Used by initAuth to decide whether bootstrap journal cleanup is needed.
 */
export function wasLoadedFromSnapshot(): boolean {
  return _hadSnapshot;
}

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

/** subscribeLocalUpdates 的 unsubscribe 函数（Phase 0 no-op hook，切换工作区时清理） */
let unsubLocalUpdates: (() => void) | null = null;

/** visibilitychange 监听器的 AbortController（防止重复 initLoroDoc 时累积监听器） */
let visibilityAbort: AbortController | null = null;

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

function configureTextStyles(target: LoroDoc): void {
  target.configTextStyle(RICH_TEXT_STYLE_CONFIG);
}

/**
 * Set when a Loro WASM RuntimeError is caught.
 * Once poisoned, ALL Loro operations are skipped to prevent cascading panics.
 * Only a full page reload can recover from this state.
 */
let _wasmPoisoned = false;

/** Check if the WASM engine has been poisoned by a previous error. */
export function isWasmPoisoned(): boolean {
  return _wasmPoisoned;
}

function markWasmPoisoned(source: string, err: unknown): void {
  if (_wasmPoisoned) return; // Already logged
  _wasmPoisoned = true;
  console.error(`[loro-doc] WASM engine failed in ${source} — further mutations disabled until reload:`, err);
  // Unsubscribe subscribeLocalUpdates to prevent Loro handler dispatch
  // (handler.rs) from attempting callback on poisoned WASM during doc.commit()
  if (unsubLocalUpdates) { unsubLocalUpdates(); unsubLocalUpdates = null; }
  // Cancel any pending save — persistSnapshot would fail on poisoned WASM
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
}

function canApplyMutation(action: string): boolean {
  if (_wasmPoisoned) return false;
  if (!doc) throw new Error('[loro-doc] LoroDoc 未初始化，请先调用 initLoroDoc()');
  if (!doc.isDetached()) return true;
  if (!detachedMutationWarnings.has(action)) {
    detachedMutationWarnings.add(action);
    console.warn(`[loro-doc] detached checkout 模式下忽略写操作: ${action}`);
  }
  return false;
}

// ============================================================
// 映射维护
// ============================================================

/**
 * Loro's internal DELETED_ROOT TreeID — nodes moved here by tree.delete() or undo.
 * `tree.nodes()` still iterates them, so we must filter explicitly.
 */
const DELETED_ROOT_ID = '2147483647@18446744073709551615' as TreeID;

function isDeletedTreeNode(node: { parent(): { id: TreeID } | undefined }): boolean {
  return node.parent()?.id === DELETED_ROOT_ID;
}

function registerMapping(nodexId: string, treeId: TreeID): void {
  // Clean up stale reverse mapping when a storedId is remapped to a different tree node.
  // Without this, rebuildMappings leaves orphan entries in treeToNodex when two alive
  // tree nodes share the same storedId (e.g., CRDT merge creating duplicate containers),
  // causing getChildren() to return the same storedId multiple times.
  const oldTreeId = nodexToTree.get(nodexId);
  if (oldTreeId && oldTreeId !== treeId) {
    treeToNodex.delete(oldTreeId);
  }
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
    // Skip deleted tree nodes — Loro's tree.nodes() includes nodes moved to
    // DELETED_ROOT by tree.delete() or UndoManager.undo(). After redo, both
    // the old (deleted) and new (alive) tree nodes coexist with the same
    // storedId, so we must skip deleted ones to avoid mapping conflicts.
    if (isDeletedTreeNode(node)) continue;
    const storedId = node.data.get('id') as string | undefined;
    if (storedId) {
      registerMapping(storedId, node.id);
    }
  }
  // ② 重建后重新挂载 per-node 订阅（checkout/import 后 TreeNode 引用可能失效）
  reattachNodeSubs();
}

/**
 * Fix duplicate container mappings after CRDT merge.
 *
 * When multiple devices independently create container nodes (JOURNAL, LIBRARY, etc.)
 * with the same fixed string ID, rebuildMappings (which uses "last wins") may pick
 * the empty bootstrap container instead of the server's container with actual data.
 *
 * This function:
 * 1. Picks the tree node with the most children as the "winner" for each duplicate ID.
 * 2. Moves children from all "loser" tree nodes to the winner, so data from all
 *    sessions is accessible under a single container.
 *
 * Called after importUpdatesBatch.
 */
/** Returns true if tree mutations were made (children moved between duplicates). */
function fixDuplicateContainerMappings(): boolean {
  if (!doc) return false;
  const tree = getTree();

  // Build a reverse index: nodexId → all alive TreeIDs that have this storedId
  const idToTreeIds = new Map<string, TreeID[]>();
  for (const node of tree.nodes()) {
    if (isDeletedTreeNode(node)) continue;
    const storedId = node.data.get('id') as string | undefined;
    if (!storedId) continue;
    let arr = idToTreeIds.get(storedId);
    if (!arr) {
      arr = [];
      idToTreeIds.set(storedId, arr);
    }
    arr.push(node.id);
  }

  // For any nodexId with multiple tree nodes, pick the one with most children
  // and move children from losers to the winner.
  let changed = false;
  let childrenMoved = 0;
  for (const [storedId, treeIds] of idToTreeIds) {
    if (treeIds.length <= 1) continue;

    let bestId = treeIds[0];
    let bestCount = tree.getNodeByID(bestId)?.children()?.length ?? 0;
    for (let i = 1; i < treeIds.length; i++) {
      const count = tree.getNodeByID(treeIds[i])?.children()?.length ?? 0;
      if (count > bestCount) {
        bestId = treeIds[i];
        bestCount = count;
      }
    }

    // Move children from loser tree nodes to the winner, then neutralize losers
    for (const loserId of treeIds) {
      if (loserId === bestId) continue;
      const loserNode = tree.getNodeByID(loserId);
      if (!loserNode) continue;
      const loserChildren = loserNode.children() ?? [];
      for (const child of loserChildren) {
        try {
          tree.move(child.id, bestId);
          childrenMoved++;
        } catch (e) {
          console.warn(`[loro-doc] Failed to move child from duplicate ${storedId}:`, e);
        }
      }
      // Clear the storedId on the loser so future rebuildMappings() calls
      // don't flip the mapping back to this empty shell.
      loserNode.data.set('id', '');
      treeToNodex.delete(loserId);
    }

    const currentMapped = nodexToTree.get(storedId);
    if (currentMapped !== bestId) {
      if (currentMapped) treeToNodex.delete(currentMapped);
      registerMapping(storedId, bestId);
      changed = true;
    }
  }

  if (childrenMoved > 0) {
    console.log(`[loro-doc] Merged ${childrenMoved} children from duplicate container tree nodes`);
  }

  if (changed || childrenMoved > 0) {
    invalidateCache();
    reattachNodeSubs();
  }

  return childrenMoved > 0;
}

/**
 * Deduplicate journal hierarchy nodes by name after CRDT merge.
 *
 * Container nodes (JOURNAL, LIBRARY, etc.) have fixed storedIds and are handled
 * by fixDuplicateContainerMappings. But journal date hierarchy nodes (year, week,
 * day) are created with random nanoid IDs. When two sessions independently create
 * "2026" → "Week 10" → "Today, Tue, Mar 3", the CRDT merge produces two parallel
 * sub-trees with different storedIds but identical names.
 *
 * This function walks JOURNAL → year → week → day, merges children of same-name
 * siblings into the one with the most children, and moves the empty shell to TRASH.
 *
 * Returns true if any tree mutations were made.
 */
function deduplicateJournalHierarchy(): boolean {
  if (!doc) return false;

  const journalTreeId = nodexToTree.get('JOURNAL');
  const trashTreeId = nodexToTree.get('TRASH');
  if (!journalTreeId || !trashTreeId) return false;

  const tree = getTree();
  let totalMerged = 0;

  /**
   * For a given parent, find children with the same name and merge them.
   * Returns the number of merge operations performed.
   */
  function deduplicateChildren(parentTreeId: TreeID): number {
    const parentNode = tree.getNodeByID(parentTreeId);
    if (!parentNode) return 0;

    const children = parentNode.children() ?? [];
    if (children.length <= 1) return 0;

    // Group children by name
    const byName = new Map<string, TreeID[]>();
    for (const child of children) {
      if (isDeletedTreeNode(child)) continue;
      const name = child.data.get('name') as string | undefined;
      if (!name) continue;
      let arr = byName.get(name);
      if (!arr) { arr = []; byName.set(name, arr); }
      arr.push(child.id);
    }

    let merged = 0;
    for (const [, treeIds] of byName) {
      if (treeIds.length <= 1) continue;

      // Pick winner: most children
      let bestId = treeIds[0];
      let bestCount = tree.getNodeByID(bestId)?.children()?.length ?? 0;
      for (let i = 1; i < treeIds.length; i++) {
        const count = tree.getNodeByID(treeIds[i])?.children()?.length ?? 0;
        if (count > bestCount) {
          bestId = treeIds[i];
          bestCount = count;
        }
      }

      // Move children from losers to winner, then move loser to TRASH
      for (const loserId of treeIds) {
        if (loserId === bestId) continue;
        const loserNode = tree.getNodeByID(loserId);
        if (!loserNode) continue;
        const loserChildren = loserNode.children() ?? [];
        for (const child of loserChildren) {
          try { tree.move(child.id, bestId); } catch { /* skip */ }
        }
        // Move the empty shell to TRASH so it doesn't appear in search
        try { tree.move(loserId, trashTreeId); } catch { /* skip */ }
        merged++;
      }
    }
    return merged;
  }

  // Level 1: year nodes under JOURNAL
  totalMerged += deduplicateChildren(journalTreeId);
  invalidateCache(); // Refresh after moves

  // Level 2: week nodes under each year
  const journalNode = tree.getNodeByID(journalTreeId);
  for (const yearNode of journalNode?.children() ?? []) {
    if (isDeletedTreeNode(yearNode)) continue;
    totalMerged += deduplicateChildren(yearNode.id);
  }
  invalidateCache();

  // Level 3: day nodes under each week (re-read years after potential merges)
  for (const yearNode of journalNode?.children() ?? []) {
    if (isDeletedTreeNode(yearNode)) continue;
    for (const weekNode of yearNode.children() ?? []) {
      if (isDeletedTreeNode(weekNode)) continue;
      totalMerged += deduplicateChildren(weekNode.id);
    }
  }

  if (totalMerged > 0) {
    console.log(`[loro-doc] Deduplicated ${totalMerged} journal hierarchy nodes by name`);
    invalidateCache();
    rebuildMappings();
  }

  return totalMerged > 0;
}

/**
 * Deduplicate schema tagDefs and fieldDefs by name after CRDT merge.
 *
 * Handles two scenarios:
 * 1. Old nanoid-based tagDef/fieldDef coexisting with new fixed-ID version (upgrade transition)
 * 2. Two offline sessions independently creating same-name tagDef (e.g., both create #task)
 *
 * For tagDefs: groups SCHEMA children by (type, name), picks winner (fixed ID preferred,
 * then most children), moves loser's children to winner, replaces tag references on all nodes,
 * then trashes losers.
 *
 * For fieldDefs: within each tagDef, groups children by (type='fieldDef', name), picks winner,
 * replaces fieldDefId references on all fieldEntry nodes, then trashes losers.
 *
 * Returns true if any tree mutations were made.
 */
function deduplicateSchemaTagDefs(): boolean {
  if (!doc) return false;

  const schemaTreeId = nodexToTree.get('SCHEMA');
  const trashTreeId = nodexToTree.get('TRASH');
  if (!schemaTreeId || !trashTreeId) return false;

  const tree = getTree();
  let totalMerged = 0;

  /** Check if an ID is a fixed system/soma ID (preferred as winner). */
  function isFixedId(id: string): boolean {
    return id.startsWith('SYS_') || id.startsWith('NDX_');
  }

  /**
   * Pick winner from duplicate IDs: prefer fixed ID, then most children.
   */
  function pickWinner(ids: string[]): string {
    // First check for fixed ID
    for (const id of ids) {
      if (isFixedId(id)) return id;
    }
    // Fallback: most children
    let bestId = ids[0];
    let bestCount = tree.getNodeByID(nodexToTree.get(bestId)!)?.children()?.length ?? 0;
    for (let i = 1; i < ids.length; i++) {
      const count = tree.getNodeByID(nodexToTree.get(ids[i])!)?.children()?.length ?? 0;
      if (count > bestCount) {
        bestId = ids[i];
        bestCount = count;
      }
    }
    return bestId;
  }

  /**
   * Replace all tag references from loserId to winnerId across all nodes.
   */
  function replaceTagReferences(loserId: string, winnerId: string): void {
    for (const treeNode of tree.nodes()) {
      if (isDeletedTreeNode(treeNode)) continue;
      const tags = treeNode.data.getOrCreateContainer('tags', new LoroList()) as LoroList;
      const arr = tags.toArray() as string[];
      const idx = arr.indexOf(loserId);
      if (idx === -1) continue;

      // Remove loser
      tags.delete(idx, 1);
      // Add winner if not already present
      const updated = tags.toArray() as string[];
      if (!updated.includes(winnerId)) {
        tags.insert(updated.length, winnerId);
      }
    }
  }

  /**
   * Replace fieldDefId references on fieldEntry nodes from loserId to winnerId.
   */
  function replaceFieldDefReferences(loserId: string, winnerId: string): void {
    for (const treeNode of tree.nodes()) {
      if (isDeletedTreeNode(treeNode)) continue;
      const type = treeNode.data.get('type') as string | undefined;
      if (type !== 'fieldEntry') continue;
      const fdId = treeNode.data.get('fieldDefId') as string | undefined;
      if (fdId === loserId) {
        treeNode.data.set('fieldDefId', winnerId);
      }
    }
  }

  // ── Step 1: Deduplicate tagDefs under SCHEMA ──
  const schemaNode = tree.getNodeByID(schemaTreeId);
  if (!schemaNode) return false;

  const schemaChildren = schemaNode.children() ?? [];

  // Group tagDef children by name
  const tagDefsByName = new Map<string, string[]>();
  for (const child of schemaChildren) {
    if (isDeletedTreeNode(child)) continue;
    const storedId = treeToNodex.get(child.id);
    if (!storedId) continue;
    const type = child.data.get('type') as string | undefined;
    const name = child.data.get('name') as string | undefined;
    if (type !== 'tagDef' || !name) continue;
    const key = name.toLowerCase();
    let arr = tagDefsByName.get(key);
    if (!arr) { arr = []; tagDefsByName.set(key, arr); }
    arr.push(storedId);
  }

  // Merge duplicate tagDefs
  for (const [, ids] of tagDefsByName) {
    if (ids.length <= 1) continue;

    const winnerId = pickWinner(ids);

    for (const loserId of ids) {
      if (loserId === winnerId) continue;

      // Move loser's children (fieldDefs etc.) to winner
      const loserTreeId = nodexToTree.get(loserId);
      const winnerTreeId = nodexToTree.get(winnerId);
      if (!loserTreeId || !winnerTreeId) continue;

      const loserNode = tree.getNodeByID(loserTreeId);
      for (const child of loserNode?.children() ?? []) {
        try { tree.move(child.id, winnerTreeId); } catch { /* skip */ }
      }

      // Replace tag references on all nodes
      replaceTagReferences(loserId, winnerId);

      // Move loser to TRASH
      try { tree.move(loserTreeId, trashTreeId); } catch { /* skip */ }
      totalMerged++;
    }
  }

  // ── Step 2: Deduplicate fieldDefs within each tagDef ──
  invalidateCache();

  // Re-read schema children after potential moves
  const updatedSchemaChildren = schemaNode.children() ?? [];
  for (const tagDefNode of updatedSchemaChildren) {
    if (isDeletedTreeNode(tagDefNode)) continue;
    const tagDefType = tagDefNode.data.get('type') as string | undefined;
    if (tagDefType !== 'tagDef') continue;

    const fieldDefsByName = new Map<string, string[]>();
    for (const child of tagDefNode.children() ?? []) {
      if (isDeletedTreeNode(child)) continue;
      const storedId = treeToNodex.get(child.id);
      if (!storedId) continue;
      const type = child.data.get('type') as string | undefined;
      const name = child.data.get('name') as string | undefined;
      if (type !== 'fieldDef' || !name) continue;
      const key = name.toLowerCase();
      let arr = fieldDefsByName.get(key);
      if (!arr) { arr = []; fieldDefsByName.set(key, arr); }
      arr.push(storedId);
    }

    for (const [, ids] of fieldDefsByName) {
      if (ids.length <= 1) continue;

      const winnerId = pickWinner(ids);

      for (const loserId of ids) {
        if (loserId === winnerId) continue;

        // Replace fieldDefId references on fieldEntry nodes
        replaceFieldDefReferences(loserId, winnerId);

        // Move loser to TRASH
        const loserTreeId = nodexToTree.get(loserId);
        if (loserTreeId) {
          try { tree.move(loserTreeId, trashTreeId); } catch { /* skip */ }
        }
        totalMerged++;
      }
    }
  }

  if (totalMerged > 0) {
    console.log(`[loro-doc] Deduplicated ${totalMerged} schema tagDefs/fieldDefs by name`);
    invalidateCache();
    rebuildMappings();
  }

  return totalMerged > 0;
}

// ============================================================
// 通知 + 持久化
// ============================================================

/**
 * Immediately notify all subscribers (invalidate cache + call callbacks).
 * Called explicitly from every doc-modifying exit point (commitDoc, importUpdates,
 * undoDoc, redoDoc, etc.) instead of from doc.subscribe() — which would trigger
 * a re-entrant WASM lock panic inside Loro's event handler dispatch.
 */
function notifySubscribers(): void {
  invalidateCache();
  for (const cb of subscribers) cb();
}

function scheduleSave(): void {
  if (!currentWorkspaceId || _wasmPoisoned) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void persistSnapshot(); }, 1500);
}

/**
 * @param recoveryMode When true, attempt save even if WASM is poisoned.
 *   Used by sync recovery to save partially-imported data before reload.
 */
async function persistSnapshot(recoveryMode = false): Promise<void> {
  if (!doc || !currentWorkspaceId) return;
  if (_wasmPoisoned && !recoveryMode) return;
  try {
    // Commit pending changes so subscribeLocalUpdates fires
    // (produces update bytes for the sync pending queue).
    doc.commit({ origin: DEFAULT_USER_COMMIT_ORIGIN });
    const snapshot = doc.export({ mode: 'snapshot' });
    const vvBytes = doc.oplogVersion().encode();
    await saveSnapshotRecord(currentWorkspaceId, {
      snapshot,
      peerIdStr: doc.peerIdStr,
      versionVector: vvBytes,
      savedAt: Date.now(),
    });
  } catch (e) {
    console.warn('[loro-doc] 快照保存失败:', e);
  }
}

// ============================================================
// 初始化
// ============================================================

export async function initLoroDoc(workspaceId: string): Promise<{ hadSnapshot: boolean }> {
  if (doc && currentWorkspaceId === workspaceId) return { hadSnapshot: true };
  redoRestoreUIMetaStack.length = 0;

  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  // Clean up previous subscribeLocalUpdates hook (avoid duplicate registration on workspace switch)
  if (unsubLocalUpdates) { unsubLocalUpdates(); unsubLocalUpdates = null; }
  currentWorkspaceId = workspaceId;
  doc = new LoroDoc();
  configureTextStyles(doc);
  detachedMutationWarnings.clear();
  // 切换工作区时清除上一个工作区的 awareness 状态，避免跨工作区泄露
  resetAwareness();

  _hadSnapshot = false;
  let hadSnapshot = false;
  try {
    const saved = await loadSnapshotRecord(workspaceId);
    if (saved?.snapshot) {
      hadSnapshot = true;
      _hadSnapshot = true;
      // PeerID restore order is critical: setPeerId BEFORE import (doc must have no oplog)
      if (saved.peerIdStr) {
        try {
          doc.setPeerId(saved.peerIdStr as `${number}`);
        } catch (e) {
          console.warn('[loro-doc] PeerID 恢复失败，使用随机 PeerID:', e);
        }
      }
      doc.import(saved.snapshot);
      rebuildMappings();
      console.log(`[loro-doc] 从快照恢复 ${workspaceId}，节点数: ${nodexToTree.size}，peerIdStr: ${doc.peerIdStr}`);
    }
  } catch (e) {
    console.warn('[loro-doc] 快照加载失败，从空白开始:', e);
  }

  undoManager = new UndoManager(doc, { mergeInterval: 500, excludeOriginPrefixes: [...UNDO_EXCLUDED_ORIGIN_PREFIXES] });
  aiUndoManager = new UndoManager(doc, { mergeInterval: 500, excludeOriginPrefixes: [...AI_UNDO_EXCLUDED_ORIGIN_PREFIXES] });
  bindUndoCallbacks();

  // NOTE: We intentionally do NOT register doc.subscribe() here.
  // Loro's internal event handler dispatch (handler.rs) acquires a lock during
  // doc.commit() / doc.import(). If doc.subscribe() is registered, Loro's own
  // handler code tries to re-acquire that lock → WASM panic (unreachable at
  // lock.rs:144). Instead, we call invalidateCache/scheduleSave/notifySubscribers
  // explicitly from every doc-modifying exit point (commitDoc, undoDoc, etc.).

  // Capture local mutations → pending queue for sync.
  // Only enqueues when user is signed in (syncManager.getState().status !== 'local-only').
  // importUpdates() does NOT trigger subscribeLocalUpdates (Loro native behavior),
  // so remote updates won't re-enter the queue.
  // Uses syncManager.getWorkspaceId() (not module-level currentWorkspaceId) to ensure
  // enqueue key matches dequeue key — prevents mismatch when bootstrap wsId differs from
  // the authenticated workspace ID set during sign-in.
  unsubLocalUpdates = doc.subscribeLocalUpdates((bytes: Uint8Array) => {
    if (syncManager.getState().status === 'local-only') return;
    const syncWsId = syncManager.getWorkspaceId();
    if (!syncWsId) return;
    void enqueuePendingUpdate(syncWsId, bytes)
      .then(() => {
        syncManager.nudge();
      })
      .catch((err) => {
        console.warn('[sync] Failed to enqueue local update:', err);
      });
  });

  if (typeof window !== 'undefined') {
    // Abort previous listeners to prevent accumulation on repeated initLoroDoc calls
    visibilityAbort?.abort();
    visibilityAbort = new AbortController();
    const { signal } = visibilityAbort;
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void persistSnapshot();
    }, { signal });
    window.addEventListener('beforeunload', () => void persistSnapshot(), { once: true, signal });
  }

  return { hadSnapshot };
}

/** 重置（仅测试用） */
export function resetLoroDoc(): void {
  // ② 清理 per-node 订阅
  for (const sub of nodeSubscriptions.values()) sub.unsub?.();
  nodeSubscriptions.clear();

  // Clean up subscribeLocalUpdates hook
  if (unsubLocalUpdates) { unsubLocalUpdates(); unsubLocalUpdates = null; }

  // Abort visibilitychange / beforeunload listeners
  visibilityAbort?.abort();
  visibilityAbort = null;

  doc = null;
  undoManager = null;
  aiUndoManager = null;
  redoRestoreUIMetaStack.length = 0;
  commitOriginOverrideStack.length = 0;
  nodexToTree.clear();
  treeToNodex.clear();
  currentWorkspaceId = null;
  _hadSnapshot = false;
  _wasmPoisoned = false;
  detachedMutationWarnings.clear();
  invalidateCache();
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
}

/** 同步初始化（仅测试用，不加载快照） */
export function initLoroDocForTest(workspaceId: string): void {
  redoRestoreUIMetaStack.length = 0;
  doc = new LoroDoc();
  configureTextStyles(doc);
  currentWorkspaceId = workspaceId;
  detachedMutationWarnings.clear();
  nodexToTree.clear();
  treeToNodex.clear();
  // mergeInterval=0 for deterministic tests; exclude '__seed__' and system origins
  // so seed/system commits are not tracked in the undo stack.
  undoManager = new UndoManager(doc, { mergeInterval: 0, excludeOriginPrefixes: [...UNDO_EXCLUDED_ORIGIN_PREFIXES] });
  aiUndoManager = new UndoManager(doc, { mergeInterval: 0, excludeOriginPrefixes: [...AI_UNDO_EXCLUDED_ORIGIN_PREFIXES] });
  bindUndoCallbacks();
  // No doc.subscribe() — explicit notifications from commitDoc/import/undo/redo
}

/**
 * 重置 UndoManager（仅测试用）。
 * 在 seedTestDataSync 末尾调用，清除种子操作产生的撤销记录。
 */
export function clearUndoHistoryForTest(): void {
  if (!doc) return;
  redoRestoreUIMetaStack.length = 0;
  undoManager = new UndoManager(doc, { mergeInterval: 0, excludeOriginPrefixes: [...UNDO_EXCLUDED_ORIGIN_PREFIXES] });
  aiUndoManager = new UndoManager(doc, { mergeInterval: 0, excludeOriginPrefixes: [...AI_UNDO_EXCLUDED_ORIGIN_PREFIXES] });
  bindUndoCallbacks();
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
  const id = nodexId ?? nanoid();
  if (!canApplyMutation('createNode')) return id;
  invalidateCache();
  const tree = getTree();
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
  if (!canApplyMutation('moveNode')) return;
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
  if (!canApplyMutation('deleteNode')) return;
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
  if (_wasmPoisoned) return null;
  const tree = getTree();
  const treeId = nodexToTree.get(nodexId);
  if (!treeId) return null;
  const node = tree.getNodeByID(treeId);
  if (!node) return null;
  return node.data.toJSON() as Record<string, unknown>;
}

export function setNodeRichTextContent(
  nodexId: string,
  text: string,
  marks: NodexNode['marks'] = [],
  inlineRefs: NodexNode['inlineRefs'] = [],
): void {
  if (!canApplyMutation('setNodeRichTextContent')) return;
  invalidateCache();
  const tree = getTree();
  const treeId = nodexToTree.get(nodexId);
  if (!treeId) return;
  const node = tree.getNodeByID(treeId);
  if (!node) return;

  const richText = getOrCreateNodeText(nodexId);
  if (!richText) return;
  writeRichTextToLoroText(richText, {
    text: text ?? '',
    marks: marks ?? [],
    inlineRefs: inlineRefs ?? [],
  });
  node.data.set('updatedAt', Date.now());
}

export function setNodeData(nodexId: string, key: string, value: unknown): void {
  if (!canApplyMutation('setNodeData')) return;
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
  if (!canApplyMutation('setNodeDataBatch')) return;
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
  if (!canApplyMutation('deleteNodeData')) return;
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
  if (!canApplyMutation('addTag')) return;
  invalidateCache();
  const tags = getTagsContainer(nodexId);
  if (!tags) return;
  const arr = tags.toArray() as string[];
  if (!arr.includes(tagDefId)) tags.insert(arr.length, tagDefId);
}

export function removeTag(nodexId: string, tagDefId: string): void {
  if (!canApplyMutation('removeTag')) return;
  invalidateCache();
  const tags = getTagsContainer(nodexId);
  if (!tags) return;
  const arr = tags.toArray() as string[];
  const idx = arr.indexOf(tagDefId);
  if (idx !== -1) tags.delete(idx, 1);
}

export function getTags(nodexId: string): string[] {
  if (_wasmPoisoned) return [];
  const tags = getTagsContainer(nodexId);
  if (!tags) return [];
  return [...new Set(tags.toArray() as string[])];
}

// ============================================================
// 查询
// ============================================================

const EMPTY_CHILDREN: string[] = [];

export function getChildren(parentNodexId: string): string[] {
  if (_wasmPoisoned) return EMPTY_CHILDREN;
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

/**
 * Get the raw Loro tree index of a child node within its parent.
 * Unlike getChildren() which filters unmapped nodes, this returns the
 * actual position in the Loro tree — required for accurate index-based insertion.
 */
export function getRawChildIndex(parentNodexId: string, childNodexId: string): number {
  const tree = getTree();
  const parentTreeId = nodexToTree.get(parentNodexId);
  const childTreeId = nodexToTree.get(childNodexId);
  if (!parentTreeId || !childTreeId) return -1;
  const parent = tree.getNodeByID(parentTreeId);
  if (!parent) return -1;
  const children = parent.children() ?? [];
  return children.findIndex(c => c.id === childTreeId);
}

export function getParentId(nodexId: string): string | null {
  if (_wasmPoisoned) return null;
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
  if (_wasmPoisoned) return [];
  const tree = getTree();
  return tree.roots()
    .map(n => treeToNodex.get(n.id))
    .filter((id): id is string => id !== undefined);
}

// ============================================================
// toNodexNode —— Loro → NodexNode 转换
// ============================================================

export function toNodexNode(nodexId: string): NodexNode | null {
  if (_wasmPoisoned) return null;
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
  const richText = data.get('richText');
  const richTextParsed = richText instanceof LoroText ? readRichTextFromLoroText(richText) : null;
  const nodeName = richTextParsed ? richTextParsed.text : (data.get('name') as string | undefined);
  const nodeMarks = richTextParsed?.marks ?? [];
  const nodeInlineRefs = richTextParsed?.inlineRefs ?? [];

  const result: NodexNode = {
    id: nodexId,
    type: data.get('type') as NodexNode['type'],
    name: nodeName,
    description: data.get('description') as string | undefined,
    children: childIds,
    tags,
    createdAt: (data.get('createdAt') as number | undefined) ?? now,
    updatedAt: (data.get('updatedAt') as number | undefined) ?? now,
    completedAt: data.get('completedAt') as number | undefined,
    publishedAt: data.get('publishedAt') as number | undefined,
    marks: nodeMarks,
    inlineRefs: nodeInlineRefs,
    templateId: data.get('templateId') as string | undefined,
    viewMode: data.get('viewMode') as NodexNode['viewMode'],
    editMode: data.get('editMode') as boolean | undefined,
    flags: data.get('flags') as number | undefined,
    locked: data.get('locked') as boolean | undefined,
    searchableWhenLocked: data.get('searchableWhenLocked') as boolean | undefined,
    systemBootstrapVersion: data.get('systemBootstrapVersion') as number | undefined,
    imageWidth: data.get('imageWidth') as number | undefined,
    imageHeight: data.get('imageHeight') as number | undefined,
    mediaUrl: data.get('mediaUrl') as string | undefined,
    mediaAlt: data.get('mediaAlt') as string | undefined,
    embedType: data.get('embedType') as string | undefined,
    embedId: data.get('embedId') as string | undefined,
    searchContext: data.get('searchContext') as string | undefined,
    aiSummary: data.get('aiSummary') as string | undefined,
    sourceUrl: data.get('sourceUrl') as string | undefined,
    codeLanguage: data.get('codeLanguage') as string | undefined,
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
    autoInitialize: data.get('autoInitialize') as string | undefined,
    autocollectOptions: data.get('autocollectOptions') as boolean | undefined,
    autoCollected: data.get('autoCollected') as boolean | undefined,
    minValue: data.get('minValue') as number | undefined,
    maxValue: data.get('maxValue') as number | undefined,
    sourceSupertag: data.get('sourceSupertag') as string | undefined,
    // queryCondition-specific
    queryLogic: data.get('queryLogic') as NodexNode['queryLogic'],
    queryOp: data.get('queryOp') as NodexNode['queryOp'],
    queryTagDefId: data.get('queryTagDefId') as string | undefined,
    queryFieldDefId: data.get('queryFieldDefId') as string | undefined,
    // search-specific
    lastRefreshedAt: data.get('lastRefreshedAt') as number | undefined,
    // viewDef-specific
    sortField: data.get('sortField') as string | undefined,
    sortDirection: data.get('sortDirection') as NodexNode['sortDirection'],
    toolbarVisible: data.get('toolbarVisible') as boolean | undefined,
    groupField: data.get('groupField') as string | undefined,
    // Filter condition node properties (ViewDef children)
    filterField: data.get('filterField') as string | undefined,
    filterOp: data.get('filterOp') as NodexNode['filterOp'],
    filterValues: data.get('filterValues') as string[] | undefined,
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

/**
 * Attempt to save a snapshot even if WASM is poisoned.
 * Used by sync recovery to persist partially-imported data so it survives reload.
 * May fail if WASM is too damaged for doc.export() — caller should catch.
 */
export async function saveNowRecovery(): Promise<void> {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  await persistSnapshot(true);
}

export function exportSnapshot(): Uint8Array {
  if (!doc) throw new Error('[loro-doc] LoroDoc 未初始化');
  return doc.export({ mode: 'snapshot' });
}

export function importUpdates(data: Uint8Array): void {
  if (!doc) throw new Error('[loro-doc] LoroDoc 未初始化');
  try {
    doc.import(data);
  } catch (e) {
    if (e instanceof WebAssembly.RuntimeError) markWasmPoisoned('importUpdates', e);
    throw e;
  }
  rebuildMappings();
  scheduleSave();
  notifySubscribers();
}

/** Result of a resilient batch import. */
export interface ImportBatchResult {
  /** Number of chunks successfully imported. */
  imported: number;
  /** Number of chunks skipped due to errors. */
  skipped: number;
  /** Whether the WASM engine is poisoned (no further ops possible). */
  poisoned: boolean;
}

/**
 * Batch-import multiple update byte arrays into the document.
 *
 * Resilient: imports each chunk individually. If a chunk fails:
 * - RuntimeError (WASM panic): marks WASM as poisoned, stops importing.
 * - Other errors: skips the corrupt chunk, continues with the rest.
 *
 * After importing, rebuilds mappings and notifies subscribers for whatever
 * was successfully imported. Does NOT throw — callers inspect the result.
 */
export function importUpdatesBatch(updates: Uint8Array[]): ImportBatchResult {
  if (!doc) throw new Error('[loro-doc] LoroDoc 未初始化');
  let imported = 0;
  let skipped = 0;

  for (let i = 0; i < updates.length; i++) {
    try {
      doc.import(updates[i]);
      imported++;
    } catch (e) {
      skipped++;
      if (e instanceof WebAssembly.RuntimeError) {
        console.error(
          `[loro-doc] WASM panic during import chunk ${i + 1}/${updates.length}`,
          `(sizes: ${updates.map(u => u.byteLength).join(', ')} bytes)`,
        );
        markWasmPoisoned('importUpdatesBatch', e);
        break; // Can't continue after WASM panic
      }
      // Non-fatal import error (e.g. duplicate/corrupt update) — skip and continue
      console.warn(`[loro-doc] Skipping corrupt import chunk ${i + 1}/${updates.length}:`, e);
    }
  }

  // Rebuild mappings for whatever was successfully imported
  if (imported > 0 && !_wasmPoisoned) {
    rebuildMappings();
    const containersMerged = fixDuplicateContainerMappings();
    const journalMerged = !_wasmPoisoned && deduplicateJournalHierarchy();
    const schemaMerged = !_wasmPoisoned && deduplicateSchemaTagDefs();
    // If tree mutations were made, commit + enqueue so the merge is persisted
    // locally and pushed to the server.
    if (containersMerged || journalMerged || schemaMerged) {
      try {
        doc.commit({ origin: 'system:merge-duplicates' });
      } catch (e) {
        if (e instanceof WebAssembly.RuntimeError) {
          markWasmPoisoned('merge-duplicates:commit', e);
        } else {
          console.warn('[loro-doc] Failed to commit duplicate merge:', e);
        }
      }
    }
    scheduleSave();
    notifySubscribers();
  }

  return { imported, skipped, poisoned: _wasmPoisoned };
}

// ============================================================
// 事件订阅
// ============================================================

export function subscribe(callback: () => void): () => void {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
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
  if (!canApplyMutation('commitDoc')) return;
  const resolvedOrigin = origin
    ?? commitOriginOverrideStack[commitOriginOverrideStack.length - 1]
    ?? DEFAULT_USER_COMMIT_ORIGIN;
  if (!resolvedOrigin.startsWith('system:') && resolvedOrigin !== '__seed__') {
    redoRestoreUIMetaStack.length = 0;
  }
  try {
    doc.commit({ origin: resolvedOrigin });
  } catch (e) {
    if (e instanceof WebAssembly.RuntimeError) {
      markWasmPoisoned('commitDoc', e);
      return;
    }
    throw e;
  }
  // Explicit notification — replaces doc.subscribe() which caused WASM re-entrant lock panic.
  // Safe to call synchronously here: doc.commit() has returned, no Loro lock is held.
  scheduleSave();
  notifySubscribers();
}

export function withCommitOrigin<T>(origin: string, fn: () => T): T {
  commitOriginOverrideStack.push(origin);
  try {
    return fn();
  } finally {
    commitOriginOverrideStack.pop();
  }
}

/**
 * Create a Loro undo step for UI-only state changes (navigation / expand-collapse).
 *
 * We mutate an internal `_ui.seq` counter solely to produce an UndoManager entry.
 * Actual UI state restore happens via UndoManager onPush/onPop callbacks.
 */
export function commitUIMarker(): void {
  if (!doc) return;
  if (!canApplyMutation('commitUIMarker')) return;
  const uiMap = doc.getMap('_ui');
  const current = uiMap.get('seq');
  const next = typeof current === 'number' ? current + 1 : 1;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uiMap.set('seq' as any, next as any);
  commitDoc('user:ui');
}

export function undoDoc(): boolean {
  commitDoc('system:flush-before-undo');
  const undoValue = undoManager?.topUndoValue();
  if (captureUndoUIMeta) {
    redoRestoreUIMetaStack.push(captureUndoUIMeta() ?? null);
  }
  const result = undoManager?.undo() ?? false;
  if (!result && captureUndoUIMeta) {
    // rollback local redo snapshot push
    redoRestoreUIMetaStack.pop();
  }
  if (result && restoreUndoUIMeta) {
    restoreUndoUIMeta((undoValue ?? null) as Value, true);
  }
  if (result) {
    rebuildMappings();
    scheduleSave();
    notifySubscribers();
  }
  return result;
}

export function redoDoc(): boolean {
  commitDoc('system:flush-before-undo');
  const redoMeta = redoRestoreUIMetaStack.length > 0 ? redoRestoreUIMetaStack[redoRestoreUIMetaStack.length - 1] : null;
  const result = undoManager?.redo() ?? false;
  if (result && redoRestoreUIMetaStack.length > 0) {
    redoRestoreUIMetaStack.pop();
  }
  if (result && restoreUndoUIMeta) {
    restoreUndoUIMeta((redoMeta ?? null) as Value, false);
  }
  if (result) {
    rebuildMappings();
    scheduleSave();
    notifySubscribers();
  }
  return result;
}

export function undoAiDoc(): boolean {
  commitDoc('system:flush-before-ai-undo');
  const result = aiUndoManager?.undo() ?? false;
  if (result) {
    rebuildMappings();
    scheduleSave();
    notifySubscribers();
  }
  return result;
}

export function canUndoDoc(): boolean {
  return undoManager?.canUndo() ?? false;
}

export function canRedoDoc(): boolean {
  return undoManager?.canRedo() ?? false;
}

export function canUndoAiDoc(): boolean {
  return aiUndoManager?.canUndo() ?? false;
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
 * Get the device's PeerID string (used as deviceId in sync protocol).
 */
export function getPeerIdStr(): string {
  if (!doc) throw new Error('[loro-doc] LoroDoc 未初始化');
  return doc.peerIdStr;
}

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
  notifySubscribers();
}

/**
 * 退出 detached 历史模式，回到最新状态。
 */
export function checkoutToLatest(): void {
  if (!doc) throw new Error('[loro-doc] LoroDoc 未初始化');
  doc.checkoutToLatest();
  detachedMutationWarnings.clear();
  rebuildMappings();
  notifySubscribers();
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
  if (_wasmPoisoned) return null;
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
  if (!canApplyMutation('getOrCreateNodeText')) return getNodeText(nodexId);
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
        scheduleSave();
        notifySubscribers();
      }
    },
  };
}

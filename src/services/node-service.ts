/**
 * Nodex 节点服务 — Phase 1 Loro 迁移存根
 *
 * Supabase 操作已全部迁移到 LoroDoc（node-store.ts）。
 * 本文件保留旧接口以避免破坏导入链，但所有异步函数均为空操作。
 */
import type {
  NodexNode,
  CreateNodeInput,
  UpdateNodeInput,
  TextMark,
  InlineRefEntry,
} from '../types/index.js';

// ============================================================
// 数据库行类型（保留供 use-realtime.ts 兼容）
// ============================================================

/** PostgreSQL 行格式（snake_case） — Phase 2 Supabase 重接时需要 */
export interface NodeRow {
  id: string;
  workspace_id: string;
  created: number;
  name: string;
  marks?: TextMark[] | null;
  inline_refs?: InlineRefEntry[] | null;
  description: string | null;
  doc_type: string | null;
  owner_id: string | null;
  source_id: string | null;
  flags: number;
  done: number | null;
  image_width: number | null;
  image_height: number | null;
  view: string | null;
  published: number | null;
  edit_mode: boolean | null;
  search_context_node: string | null;
  children: string[];
  meta: string[];
  touch_counts: number[];
  modified_ts: number[];
  ai_summary: string | null;
  source_url: string | null;
  version: number;
  updated_at: number;
  created_by: string;
  updated_by: string;
}

/** 将 PostgreSQL 行转换为新版 NodexNode（平坦结构） */
export function rowToNode(row: NodeRow): NodexNode {
  const now = Date.now();
  return {
    id: row.id,
    type: (row.doc_type as NodexNode['type']) ?? undefined,
    name: row.name || undefined,
    description: row.description || undefined,
    children: row.children ?? [],
    tags: [],
    createdAt: row.created ?? now,
    updatedAt: row.updated_at ?? now,
    completedAt: row.done || undefined,
    publishedAt: row.published || undefined,
    marks: (row.marks?.length ?? 0) > 0 ? row.marks! : undefined,
    inlineRefs: (row.inline_refs?.length ?? 0) > 0 ? row.inline_refs! : undefined,
    templateId: row.source_id || undefined,
    viewMode: (row.view as NodexNode['viewMode']) || undefined,
    editMode: row.edit_mode || undefined,
    flags: row.flags || undefined,
    imageWidth: row.image_width || undefined,
    imageHeight: row.image_height || undefined,
    searchContext: row.search_context_node || undefined,
    aiSummary: row.ai_summary || undefined,
    sourceUrl: row.source_url || undefined,
  };
}

/** 将 NodexNode 转换为 PostgreSQL 行（供迁移工具使用） */
export function nodeToRow(node: NodexNode): NodeRow {
  return {
    id: node.id,
    workspace_id: 'ws_default',
    created: node.createdAt,
    name: node.name ?? '',
    marks: node.marks ?? [],
    inline_refs: node.inlineRefs ?? [],
    description: node.description ?? null,
    doc_type: node.type ?? null,
    owner_id: null,
    source_id: node.templateId ?? null,
    flags: node.flags ?? 0,
    done: node.completedAt ?? null,
    image_width: node.imageWidth ?? null,
    image_height: node.imageHeight ?? null,
    view: node.viewMode ?? null,
    published: node.publishedAt ?? null,
    edit_mode: node.editMode ?? null,
    search_context_node: node.searchContext ?? null,
    children: node.children,
    meta: [],
    touch_counts: [],
    modified_ts: [],
    ai_summary: node.aiSummary ?? null,
    source_url: node.sourceUrl ?? null,
    version: 1,
    updated_at: node.updatedAt,
    created_by: 'user_default',
    updated_by: 'user_default',
  };
}

// ============================================================
// 存根 CRUD（全部 no-op，Phase 2 接回 Supabase）
// ============================================================

export async function createNode(
  _input: CreateNodeInput,
  _userId: string,
): Promise<NodexNode> {
  throw new Error('[node-service] Supabase 已替换为 LoroDoc。请使用 useNodeStore.createChild()');
}

export async function getNode(id: string): Promise<NodexNode | null> {
  void id;
  return null;
}

export async function getNodes(_ids: string[]): Promise<NodexNode[]> {
  return [];
}

export async function updateNode(
  _id: string,
  _changes: UpdateNodeInput,
  _userId: string,
): Promise<NodexNode> {
  throw new Error('[node-service] Supabase 已替换为 LoroDoc。请使用 useNodeStore 方法');
}

export async function trashNode(
  _id: string,
  _workspaceId: string,
  _userId: string,
): Promise<void> {}

export async function deleteNode(_id: string, _userId: string): Promise<void> {}

export async function getChildren(_parentId: string): Promise<NodexNode[]> {
  return [];
}

export async function addChild(
  _parentId: string,
  _childId: string,
  _userId: string,
): Promise<void> {}

export async function moveNode(
  _nodeId: string,
  _newParentId: string,
  _userId: string,
  _index?: number,
): Promise<void> {}

export async function reorderChildren(
  _parentId: string,
  _childIds: string[],
  _userId: string,
): Promise<void> {}

export async function getNodesByDocType(
  _workspaceId: string,
  _docType: string,
): Promise<NodexNode[]> {
  return [];
}

export async function getNodesByOwner(
  _ownerId: string,
): Promise<NodexNode[]> {
  return [];
}

export async function fullTextSearch(
  _workspaceId: string,
  _query: string,
): Promise<NodexNode[]> {
  return [];
}

export async function createNodes(
  _inputs: CreateNodeInput[],
  _userId: string,
): Promise<NodexNode[]> {
  return [];
}

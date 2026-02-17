/**
 * Nodex 核心节点服务
 *
 * 提供节点的 CRUD 操作和树形结构操作。
 * 忠实复制 Tana 的 "Everything is a Node" 数据模型。
 *
 * 所有操作通过 Supabase (PostgreSQL) 执行。
 */
import { nanoid } from 'nanoid';
import { getSupabase } from './supabase.js';
import type {
  NodexNode,
  CreateNodeInput,
  UpdateNodeInput,
  TextMark,
  InlineRefEntry,
} from '../types/index.js';

// ============================================================
// 数据库行类型（snake_case 列名）
// ============================================================

/** PostgreSQL 行格式（snake_case） */
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
  meta_node_id: string | null;
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
  association_map: Record<string, string>;
  touch_counts: number[];
  modified_ts: number[];
  ai_summary: string | null;
  source_url: string | null;
  version: number;
  updated_at: number;
  created_by: string;
  updated_by: string;
}

// ============================================================
// 行 ↔ 节点 转换
// ============================================================

/** 将 PostgreSQL 行转换为 NodexNode */
export function rowToNode(row: NodeRow): NodexNode {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    props: {
      created: row.created,
      name: row.name || undefined,
      _marks: row.marks && row.marks.length > 0 ? row.marks : undefined,
      _inlineRefs: row.inline_refs && row.inline_refs.length > 0 ? row.inline_refs : undefined,
      description: row.description || undefined,
      _docType: (row.doc_type as NodexNode['props']['_docType']) || undefined,
      _ownerId: row.owner_id || undefined,
      _metaNodeId: row.meta_node_id || undefined,
      _sourceId: row.source_id || undefined,
      _flags: row.flags || undefined,
      _done: row.done || undefined,
      _imageWidth: row.image_width || undefined,
      _imageHeight: row.image_height || undefined,
      _view: (row.view as NodexNode['props']['_view']) || undefined,
      _published: row.published || undefined,
      _editMode: row.edit_mode || undefined,
      searchContextNode: row.search_context_node || undefined,
    },
    children: row.children.length > 0 ? row.children : undefined,
    associationMap: Object.keys(row.association_map).length > 0 ? row.association_map : undefined,
    touchCounts: row.touch_counts.length > 0 ? row.touch_counts : undefined,
    modifiedTs: row.modified_ts.length > 0 ? row.modified_ts : undefined,
    aiSummary: row.ai_summary || undefined,
    sourceUrl: row.source_url || undefined,
    version: row.version,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

/** 将 NodexNode 转换为 PostgreSQL 行 */
function nodeToRow(node: NodexNode): NodeRow {
  return {
    id: node.id,
    workspace_id: node.workspaceId,
    created: node.props.created,
    name: node.props.name ?? '',
    marks: node.props._marks ?? [],
    inline_refs: node.props._inlineRefs ?? [],
    description: node.props.description ?? null,
    doc_type: node.props._docType ?? null,
    owner_id: node.props._ownerId ?? null,
    meta_node_id: node.props._metaNodeId ?? null,
    source_id: node.props._sourceId ?? null,
    flags: node.props._flags ?? 0,
    done: node.props._done ?? null,
    image_width: node.props._imageWidth ?? null,
    image_height: node.props._imageHeight ?? null,
    view: node.props._view ?? null,
    published: node.props._published ?? null,
    edit_mode: node.props._editMode ?? null,
    search_context_node: node.props.searchContextNode ?? null,
    children: node.children ?? [],
    association_map: node.associationMap ?? {},
    touch_counts: node.touchCounts ?? [],
    modified_ts: node.modifiedTs ?? [],
    ai_summary: node.aiSummary ?? null,
    source_url: node.sourceUrl ?? null,
    version: node.version,
    updated_at: node.updatedAt,
    created_by: node.createdBy,
    updated_by: node.updatedBy,
  };
}

// ============================================================
// 基础 CRUD
// ============================================================

/**
 * 创建节点。
 * 自动生成 ID（若未提供）、创建时间戳、版本号。
 */
export async function createNode(
  input: CreateNodeInput,
  userId: string,
): Promise<NodexNode> {
  const now = Date.now();
  const node: NodexNode = {
    id: input.id ?? nanoid(),
    workspaceId: input.workspaceId,
    props: {
      ...input.props,
      created: input.props.created ?? now,
    },
    children: input.children,
    version: 1,
    updatedAt: now,
    createdBy: userId,
    updatedBy: userId,
  };

  const row = nodeToRow(node);
  const { data, error } = await getSupabase()
    .from('nodes')
    .insert(row)
    .select()
    .single();

  if (error) throw new Error(`Failed to create node: ${error.message}`);
  return rowToNode(data as NodeRow);
}

/**
 * 获取单个节点。
 */
export async function getNode(id: string): Promise<NodexNode | null> {
  const { data, error } = await getSupabase()
    .from('nodes')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // not found
    throw new Error(`Failed to get node: ${error.message}`);
  }
  return rowToNode(data as NodeRow);
}

/**
 * 批量获取节点。
 */
export async function getNodes(ids: string[]): Promise<NodexNode[]> {
  if (ids.length === 0) return [];

  const { data, error } = await getSupabase()
    .from('nodes')
    .select('*')
    .in('id', ids);

  if (error) throw new Error(`Failed to get nodes: ${error.message}`);
  return (data as NodeRow[]).map(rowToNode);
}

/**
 * 更新节点。
 * 自动递增版本号，使用乐观锁防止冲突。
 */
export async function updateNode(
  id: string,
  changes: UpdateNodeInput,
  userId: string,
): Promise<NodexNode> {
  const now = Date.now();

  // 构建更新行（只包含有变更的列）
  const updates: Record<string, unknown> = {
    updated_at: now,
    updated_by: userId,
  };

  if (changes.props !== undefined) {
    const p = changes.props;
    if (p.name !== undefined) updates.name = p.name ?? '';
    if (p._marks !== undefined) updates.marks = p._marks ?? [];
    if (p._inlineRefs !== undefined) updates.inline_refs = p._inlineRefs ?? [];
    if (p.description !== undefined) updates.description = p.description ?? null;
    if (p._docType !== undefined) updates.doc_type = p._docType ?? null;
    if (p._ownerId !== undefined) updates.owner_id = p._ownerId ?? null;
    if (p._metaNodeId !== undefined) updates.meta_node_id = p._metaNodeId ?? null;
    if (p._sourceId !== undefined) updates.source_id = p._sourceId ?? null;
    if (p._flags !== undefined) updates.flags = p._flags ?? 0;
    if (p._done !== undefined) updates.done = p._done ?? null;
    if (p._imageWidth !== undefined) updates.image_width = p._imageWidth ?? null;
    if (p._imageHeight !== undefined) updates.image_height = p._imageHeight ?? null;
    if (p._view !== undefined) updates.view = p._view ?? null;
    if (p._published !== undefined) updates.published = p._published ?? null;
    if (p._editMode !== undefined) updates.edit_mode = p._editMode ?? null;
    if (p.searchContextNode !== undefined) updates.search_context_node = p.searchContextNode ?? null;
  }

  if (changes.children !== undefined) updates.children = changes.children ?? [];
  if (changes.associationMap !== undefined) updates.association_map = changes.associationMap ?? {};
  if (changes.touchCounts !== undefined) updates.touch_counts = changes.touchCounts ?? [];
  if (changes.modifiedTs !== undefined) updates.modified_ts = changes.modifiedTs ?? [];
  if (changes.aiSummary !== undefined) updates.ai_summary = changes.aiSummary ?? null;
  if (changes.sourceUrl !== undefined) updates.source_url = changes.sourceUrl ?? null;
  if (changes.workspaceId !== undefined) updates.workspace_id = changes.workspaceId;

  // 先读取当前版本号
  const { data: current, error: readError } = await getSupabase()
    .from('nodes')
    .select('version')
    .eq('id', id)
    .single();

  if (readError) throw new Error(`Failed to read node version: ${readError.message}`);
  const currentVersion = (current as { version: number }).version;

  // 乐观锁：version + 1
  updates.version = currentVersion + 1;

  const { data, error } = await getSupabase()
    .from('nodes')
    .update(updates)
    .eq('id', id)
    .eq('version', currentVersion) // 乐观锁条件
    .select()
    .single();

  if (error) throw new Error(`Failed to update node (version conflict?): ${error.message}`);

  return rowToNode(data as NodeRow);
}

/**
 * 软删除节点（移到回收站）。
 * 修改 owner_id 为 "{workspaceId}_TRASH"，与 Tana 行为一致。
 */
export async function trashNode(
  id: string,
  workspaceId: string,
  userId: string,
): Promise<void> {
  await updateNode(
    id,
    { props: { _ownerId: `${workspaceId}_TRASH` } },
    userId,
  );
}

/**
 * 硬删除节点（永久删除）。
 */
export async function deleteNode(id: string): Promise<void> {
  const { error } = await getSupabase()
    .from('nodes')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Failed to delete node: ${error.message}`);
}

// ============================================================
// 树形操作
// ============================================================

/**
 * 获取子节点。
 * 返回节点按 children 数组顺序排列。
 */
export async function getChildren(nodeId: string): Promise<NodexNode[]> {
  const parent = await getNode(nodeId);
  if (!parent || !parent.children || parent.children.length === 0) return [];

  const children = await getNodes(parent.children);

  // 按 parent.children 数组顺序排列
  const orderMap = new Map(parent.children.map((id, i) => [id, i]));
  children.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));

  return children;
}

/**
 * 添加子节点。
 * 将 childId 添加到 parentId 的 children 数组中指定位置。
 * 同时更新子节点的 _ownerId。
 */
export async function addChild(
  parentId: string,
  childId: string,
  userId: string,
  position?: number,
): Promise<void> {
  const parent = await getNode(parentId);
  if (!parent) throw new Error(`Parent node not found: ${parentId}`);

  const children = [...(parent.children ?? [])];

  // 插入到指定位置，或追加到末尾
  if (position !== undefined && position >= 0 && position <= children.length) {
    children.splice(position, 0, childId);
  } else {
    children.push(childId);
  }

  // 更新父节点的 children
  await updateNode(parentId, { children }, userId);

  // 更新子节点的 _ownerId
  await updateNode(childId, { props: { _ownerId: parentId } }, userId);
}

/**
 * 移动节点到新的父节点。
 * 从旧父节点的 children 中移除，添加到新父节点的 children 中。
 */
export async function moveNode(
  nodeId: string,
  newParentId: string,
  userId: string,
  position?: number,
): Promise<void> {
  const node = await getNode(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  const oldParentId = node.props._ownerId;

  // 从旧父节点的 children 中移除
  if (oldParentId) {
    const oldParent = await getNode(oldParentId);
    if (oldParent && oldParent.children) {
      const newChildren = oldParent.children.filter(id => id !== nodeId);
      await updateNode(oldParentId, { children: newChildren }, userId);
    }
  }

  // 添加到新父节点
  await addChild(newParentId, nodeId, userId, position);
}

/**
 * 重排子节点顺序。
 * 直接替换 children 数组。
 */
export async function reorderChildren(
  parentId: string,
  childrenIds: string[],
  userId: string,
): Promise<void> {
  await updateNode(parentId, { children: childrenIds }, userId);
}

// ============================================================
// 查询操作
// ============================================================

/**
 * 按工作区和文档类型查询节点。
 */
export async function getNodesByDocType(
  workspaceId: string,
  docType: string,
): Promise<NodexNode[]> {
  const { data, error } = await getSupabase()
    .from('nodes')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('doc_type', docType);

  if (error) throw new Error(`Failed to query nodes: ${error.message}`);
  return (data as NodeRow[]).map(rowToNode);
}

/**
 * 获取工作区中 owner_id 为指定值的所有节点。
 */
export async function getNodesByOwner(
  ownerId: string,
): Promise<NodexNode[]> {
  const { data, error } = await getSupabase()
    .from('nodes')
    .select('*')
    .eq('owner_id', ownerId);

  if (error) throw new Error(`Failed to query nodes by owner: ${error.message}`);
  return (data as NodeRow[]).map(rowToNode);
}

/**
 * 全文搜索节点名称。
 */
export async function fullTextSearch(
  workspaceId: string,
  query: string,
): Promise<NodexNode[]> {
  const { data, error } = await getSupabase()
    .from('nodes')
    .select('*')
    .eq('workspace_id', workspaceId)
    .textSearch('name', query, { type: 'plain' });

  if (error) throw new Error(`Failed to search nodes: ${error.message}`);
  return (data as NodeRow[]).map(rowToNode);
}

// ============================================================
// 批量操作
// ============================================================

/**
 * 批量创建节点。用于数据导入。
 */
export async function createNodes(
  nodes: NodexNode[],
): Promise<void> {
  const rows = nodes.map(nodeToRow);

  // Supabase 单次最多 1000 行
  const BATCH_SIZE = 1000;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await getSupabase()
      .from('nodes')
      .insert(batch);

    if (error) throw new Error(`Failed to batch create nodes (batch ${i / BATCH_SIZE}): ${error.message}`);
  }
}

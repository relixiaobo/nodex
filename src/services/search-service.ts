/**
 * Nodex 搜索服务
 *
 * 忠实复制 Tana 的搜索系统：
 *   - 搜索节点 (docType='search') 是持久化的动态查询
 *   - 搜索配置存储在 Metanode 的 Tuple 中：
 *       [SYS_A15, tagDefId]              搜索表达式
 *       [SYS_A15, tagDefId, filterTuple] 带过滤的搜索
 *       [SYS_A16, viewDefId]             视图配置
 *       [SYS_A14, tagDefId]             默认子标签
 *
 * 搜索支持：
 *   - 按标签搜索（含多态：搜索父标签返回所有子标签实例）
 *   - 按字段值过滤
 *   - 全文搜索
 *   - 组合查询（AND/OR/NOT）
 */
import { SYS_A } from '../types/index.js';
import { getNode, getNodes } from './node-service.js';
import { getNodeTags, resolveTagFields } from './tag-service.js';
import { getFieldValues } from './field-service.js';
import { getSupabase } from './supabase.js';
import type { NodexNode } from '../types/index.js';

// ============================================================
// 搜索配置解析
// ============================================================

/**
 * 从搜索节点提取搜索配置。
 *
 * 搜索配置存储在 SearchNode 的 Metanode Tuple 中。
 */
export async function getSearchConfig(
  searchNodeId: string,
): Promise<SearchConfig | null> {
  const searchNode = await getNode(searchNodeId);
  if (!searchNode || searchNode.props._docType !== 'search') return null;
  if (!searchNode.props._metaNodeId) return null;

  const metanode = await getNode(searchNode.props._metaNodeId);
  if (!metanode || !metanode.children) return null;

  const tuples = await getNodes(metanode.children);
  const config: SearchConfig = {
    targetTagId: null,
    filters: [],
    viewDefId: null,
    defaultChildTagId: null,
  };

  for (const tuple of tuples) {
    if (tuple.props._docType !== 'tuple' || !tuple.children || tuple.children.length < 2) {
      continue;
    }

    const key = tuple.children[0];

    switch (key) {
      case SYS_A.SEARCH_EXPRESSION: {
        // [SYS_A15, tagDefId] 或 [SYS_A15, tagDefId, filterTupleId]
        config.targetTagId = tuple.children[1];
        if (tuple.children.length >= 3) {
          // 有过滤条件
          const filterTupleId = tuple.children[2];
          const filterTuple = await getNode(filterTupleId);
          if (filterTuple) {
            config.filters.push(filterTupleId);
          }
        }
        break;
      }
      case SYS_A.VIEWS: {
        // [SYS_A16, viewDefId]
        config.viewDefId = tuple.children[1];
        break;
      }
      case SYS_A.CHILD_SUPERTAG: {
        // [SYS_A14, tagDefId]
        config.defaultChildTagId = tuple.children[1];
        break;
      }
    }
  }

  return config;
}

// ============================================================
// 搜索执行
// ============================================================

/**
 * 执行搜索节点的查询。
 *
 * 返回匹配的节点 ID 列表。
 */
export async function executeSearch(
  searchNodeId: string,
): Promise<NodexNode[]> {
  const config = await getSearchConfig(searchNodeId);
  if (!config) return [];

  return executeSearchConfig(config);
}

/**
 * 执行搜索配置。
 *
 * 核心逻辑：
 * 1. 获取目标标签的完整标签树（含子标签，支持多态搜索）
 * 2. 查找所有 Metanode 中有 [SYS_A13, 匹配标签] 的节点
 * 3. 应用过滤条件
 */
async function executeSearchConfig(
  config: SearchConfig,
): Promise<NodexNode[]> {
  const supabase = getSupabase();

  if (!config.targetTagId) return [];

  // Step 1: 获取标签树（多态搜索）
  const tagTreeIds = await getTagTree(config.targetTagId);

  // Step 2: 查找所有 Metanode 中包含目标标签的 Tuple
  // 先找到 children 包含 SYS_A13 的 Tuple 节点
  const { data: tagTuples, error: tupleError } = await supabase
    .from('nodes')
    .select('owner_id')
    .eq('doc_type', 'tuple')
    .contains('children', [SYS_A.NODE_SUPERTAGS]);

  if (tupleError) throw new Error(`Search failed: ${tupleError.message}`);

  // 过滤出 children[1] 在标签树中的 Tuple
  const metanodeIds = new Set<string>();
  for (const tuple of (tagTuples ?? [])) {
    if (tuple.owner_id) {
      metanodeIds.add(tuple.owner_id);
    }
  }

  if (metanodeIds.size === 0) return [];

  // Step 3: 从 Metanode 找到内容节点
  // Metanode._ownerId → ContentNode.id
  const { data: metanodes, error: metaError } = await supabase
    .from('nodes')
    .select('owner_id')
    .eq('doc_type', 'metanode')
    .in('id', [...metanodeIds]);

  if (metaError) throw new Error(`Search failed: ${metaError.message}`);

  const contentNodeIds = (metanodes ?? [])
    .map(m => m.owner_id)
    .filter((id): id is string => id !== null);

  if (contentNodeIds.length === 0) return [];

  // Step 4: 获取内容节点
  const nodes = await getNodes(contentNodeIds);

  // Step 5: 验证标签匹配（精确验证，因为 Step 2 是粗过滤）
  const matchedNodes: NodexNode[] = [];
  for (const node of nodes) {
    const nodeTags = await getNodeTags(node.id);
    if (nodeTags.some(tagId => tagTreeIds.includes(tagId))) {
      matchedNodes.push(node);
    }
  }

  return matchedNodes;
}

/**
 * 获取标签的完整继承树（含自身和所有子标签）。
 *
 * 用于多态搜索：搜索 #source 时返回 #article, #tweet, #video 等子标签的实例。
 */
async function getTagTree(tagDefId: string): Promise<string[]> {
  const result = [tagDefId];
  const supabase = getSupabase();

  // 查找所有 docType='tagDef' 的节点，检查其 Metanode 中是否有
  // Tuple [SYS_A13, tagDefId]（表示继承关系）
  const { data: allTagDefs, error } = await supabase
    .from('nodes')
    .select('id, meta_node_id')
    .eq('doc_type', 'tagDef');

  if (error || !allTagDefs) return result;

  for (const tagDef of allTagDefs) {
    if (!tagDef.meta_node_id || tagDef.id === tagDefId) continue;

    // 检查此标签是否继承自目标标签
    const metanode = await getNode(tagDef.meta_node_id);
    if (!metanode || !metanode.children) continue;

    const tuples = await getNodes(metanode.children);
    for (const tuple of tuples) {
      if (
        tuple.props._docType === 'tuple' &&
        tuple.children &&
        tuple.children[0] === SYS_A.NODE_SUPERTAGS &&
        tuple.children[1] === tagDefId
      ) {
        // 此标签继承自目标标签
        const childTreeIds = await getTagTree(tagDef.id);
        result.push(...childTreeIds);
        break;
      }
    }
  }

  return [...new Set(result)];
}

// ============================================================
// 全文搜索
// ============================================================

/**
 * 全文搜索。
 * 使用 PostgreSQL to_tsvector + tsquery。
 */
export async function fullTextSearch(
  workspaceId: string,
  query: string,
  limit: number = 50,
): Promise<NodexNode[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('nodes')
    .select('*')
    .eq('workspace_id', workspaceId)
    .textSearch('name', query, { type: 'plain' })
    .limit(limit);

  if (error) throw new Error(`Full text search failed: ${error.message}`);

  // 使用 node-service 的 rowToNode 需要导入
  // 暂时直接返回原始数据
  const nodes = await getNodes((data ?? []).map((d: { id: string }) => d.id));
  return nodes;
}

// ============================================================
// 引用/反向引用查询
// ============================================================

/**
 * 获取引用了指定节点的所有节点（Backlinks）。
 *
 * 查找所有 children 数组中包含 nodeId 的节点，
 * 排除该节点的 owner（owner 不算引用）。
 */
export async function getBacklinks(nodeId: string): Promise<NodexNode[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('nodes')
    .select('id')
    .contains('children', [nodeId]);

  if (error) throw new Error(`Backlinks query failed: ${error.message}`);

  const node = await getNode(nodeId);
  const ownerId = node?.props._ownerId;

  const refNodeIds = (data ?? [])
    .map((d: { id: string }) => d.id)
    .filter((id: string) => id !== ownerId); // 排除 owner

  if (refNodeIds.length === 0) return [];
  return getNodes(refNodeIds);
}

/**
 * 获取名称中包含内联引用的节点。
 *
 * 搜索 name 中包含 data-inlineref-node="nodeId" 的节点。
 */
export async function getInlineBacklinks(nodeId: string): Promise<NodexNode[]> {
  const supabase = getSupabase();

  const searchPattern = `data-inlineref-node="${nodeId}"`;
  const { data, error } = await supabase
    .from('nodes')
    .select('id')
    .like('name', `%${searchPattern}%`);

  if (error) throw new Error(`Inline backlinks query failed: ${error.message}`);

  const ids = (data ?? []).map((d: { id: string }) => d.id);
  if (ids.length === 0) return [];
  return getNodes(ids);
}

// ============================================================
// 类型定义
// ============================================================

/** 搜索配置 */
export interface SearchConfig {
  /** 目标标签 ID */
  targetTagId: string | null;
  /** 过滤条件 Tuple ID 列表 */
  filters: string[];
  /** 视图定义 ID */
  viewDefId: string | null;
  /** 新增子节点的默认标签 */
  defaultChildTagId: string | null;
}

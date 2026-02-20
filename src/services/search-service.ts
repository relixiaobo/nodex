/**
 * Nodex 搜索服务 — Phase 1 Loro 迁移存根
 *
 * 搜索将在 Phase 2 迁移到 Loro 原生索引。
 * 本文件保留旧接口以避免破坏导入链，但所有函数均为空操作。
 */
import type { NodexNode } from '../types/index.js';

export interface SearchConfig {
  tagDefId?: string;
  fieldFilters?: Array<{ fieldDefId: string; value: string }>;
  viewDefId?: string;
}

export async function getSearchConfig(_searchNodeId: string): Promise<SearchConfig> {
  return {};
}

export async function executeSearch(
  _searchNodeId: string,
  _workspaceId: string,
): Promise<NodexNode[]> {
  return [];
}

export async function fullTextSearch(
  _workspaceId: string,
  _query: string,
): Promise<NodexNode[]> {
  return [];
}

export async function getBacklinks(_nodeId: string): Promise<NodexNode[]> {
  return [];
}

export async function getInlineBacklinks(_nodeId: string): Promise<NodexNode[]> {
  return [];
}

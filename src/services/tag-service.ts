/**
 * Nodex 标签服务 — Phase 1 Loro 迁移存根
 *
 * 标签操作已迁移到 LoroDoc（node-store.ts applyTag / removeTag）。
 * 本文件保留旧接口以避免破坏导入链，但所有异步函数均为空操作。
 */
import type { NodexNode } from '../types/index.js';

export async function applyTag(
  _nodeId: string,
  _tagDefId: string,
  _userId: string,
): Promise<void> {}

export async function removeTag(
  _nodeId: string,
  _tagDefId: string,
  _userId: string,
): Promise<void> {}

export async function getNodeTags(_nodeId: string): Promise<string[]> {
  return [];
}

export async function getWorkspaceTags(
  _workspaceId: string,
): Promise<NodexNode[]> {
  return [];
}

export async function resolveTagFields(
  _tagDefId: string,
): Promise<NodexNode[]> {
  return [];
}

/**
 * meta-utils: 向后兼容存根
 *
 * Loro 迁移后 node.meta 间接层已被消除。
 * 标签现在直接存储在 node.tags: string[] 中。
 * 这些函数保留签名供现有调用链使用，但实现已适配新模型。
 */
import type { NodexNode } from '../types/index.js';

/**
 * 获取节点的标签 ID 列表（旧 meta Tuple 路径已废弃）。
 * 现在直接返回 node.tags。
 */
export function getMetaTuples(
  node: NodexNode,
  _entities: Record<string, NodexNode>,
): NodexNode[] {
  // In Loro model, tags are direct IDs in node.tags.
  // This function's semantics (returning Tuple nodes) no longer applies.
  // Callers should use node.tags directly.
  void _entities;
  return [];
}

/**
 * @deprecated meta Tuple 模式已废弃，始终返回 undefined。
 */
export function findMetaTuple(
  _node: NodexNode,
  _key: string,
  _entities: Record<string, NodexNode>,
): NodexNode | undefined {
  return undefined;
}

/**
 * 向 meta 数组追加一个 ID（向后兼容，不再使用）。
 */
export function addMetaTupleId(
  meta: string[] | undefined,
  tupleId: string,
): string[] {
  if (!meta || meta.length === 0) return [tupleId];
  if (meta.includes(tupleId)) return meta;
  return [...meta, tupleId];
}

/**
 * 从 meta 数组移除一个 ID（向后兼容，不再使用）。
 */
export function removeMetaTupleId(
  meta: string[] | undefined,
  tupleId: string,
): string[] {
  if (!meta || meta.length === 0) return [];
  if (!meta.includes(tupleId)) return meta;
  return meta.filter((id) => id !== tupleId);
}

/**
 * meta-utils: node.meta 数组操作工具函数
 *
 * node.meta TEXT[] 替代原来的 Metanode 间接层，
 * 直接在节点上存储元信息 Tuple ID 列表。
 */
import type { NodexNode } from '../types/index.js';

/**
 * 获取节点 meta 数组中对应的 Tuple 节点列表。
 * 跳过 entities 中不存在的 ID。
 */
export function getMetaTuples(
  node: NodexNode,
  entities: Record<string, NodexNode>,
): NodexNode[] {
  if (!node.meta || node.meta.length === 0) return [];
  const result: NodexNode[] = [];
  for (const id of node.meta) {
    const tuple = entities[id];
    if (tuple) result.push(tuple);
  }
  return result;
}

/**
 * 按 children[0] key 查找 meta 中的特定 Tuple。
 * 例如 findMetaTuple(node, 'SYS_A13', entities) 查找标签 Tuple。
 */
export function findMetaTuple(
  node: NodexNode,
  key: string,
  entities: Record<string, NodexNode>,
): NodexNode | undefined {
  if (!node.meta || node.meta.length === 0) return undefined;
  for (const id of node.meta) {
    const tuple = entities[id];
    if (tuple?.children?.[0] === key) return tuple;
  }
  return undefined;
}

/**
 * 向 meta 数组追加一个 Tuple ID（去重）。
 * 返回新数组（不修改原数组）。
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
 * 从 meta 数组移除一个 Tuple ID。
 * 返回新数组（不修改原数组）。
 * 若 ID 不存在，返回原数组引用。
 */
export function removeMetaTupleId(
  meta: string[] | undefined,
  tupleId: string,
): string[] {
  if (!meta || meta.length === 0) return [];
  if (!meta.includes(tupleId)) return meta;
  return meta.filter((id) => id !== tupleId);
}

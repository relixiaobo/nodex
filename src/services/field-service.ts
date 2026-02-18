/**
 * Nodex 字段（Field）服务
 *
 * 忠实复制 Tana 的字段值存储结构：
 *   ContentNode.children → fieldTuple (docType='tuple')
 *   fieldTuple.children = [attrDefId, valueNodeId]
 *
 * AssociationMap 说明（数据验证修正）：
 *   ContentNode.associationMap 的 KEY 主要是普通内容子节点（88.1%），
 *   不限于字段 Tuple。AssociationMap 是 children 到 associatedData
 *   的通用映射机制，用于附加辅助数据。
 *
 * 字段数据类型由 AttrDef 的 Tuple [SYS_A02, SYS_D*] 决定。
 */
import { nanoid } from 'nanoid';
import { SYS_A, SYS_D } from '../types/index.js';
import {
  createNode,
  getNode,
  getNodes,
  updateNode,
} from './node-service.js';
import type { NodexNode } from '../types/index.js';

// ============================================================
// 字段值读取
// ============================================================

/**
 * 获取节点的所有字段值。
 *
 * 遍历 ContentNode.children 中的 Tuple，
 * 查找 children[0] 为 attrDefId（非 SYS_A* 开头）的 Tuple。
 *
 * 返回: { [attrDefId]: { tuple: NodexNode, valueNodeId: string, valueNode?: NodexNode } }
 */
export async function getFieldValues(
  nodeId: string,
): Promise<FieldValueMap> {
  const node = await getNode(nodeId);
  if (!node || !node.children || node.children.length === 0) return {};

  const children = await getNodes(node.children);
  const result: FieldValueMap = {};

  for (const child of children) {
    if (child.props._docType !== 'tuple' || !child.children || child.children.length < 2) {
      continue;
    }

    const keyId = child.children[0];

    // 跳过系统属性 Tuple（SYS_A*）—— 这些属于 Metanode 级别的元数据
    if (keyId.startsWith('SYS_')) continue;

    const valueNodeId = child.children[1];
    const valueNode = valueNodeId ? await getNode(valueNodeId) : null;

    result[keyId] = {
      tupleId: child.id,
      tupleNode: child,
      valueNodeId,
      valueNode: valueNode ?? undefined,
    };
  }

  return result;
}

/**
 * 获取节点的单个字段值。
 */
export async function getFieldValue(
  nodeId: string,
  attrDefId: string,
): Promise<FieldValueEntry | null> {
  const allFields = await getFieldValues(nodeId);
  return allFields[attrDefId] ?? null;
}

/**
 * 获取字段定义的数据类型。
 *
 * 查找 AttrDef 的 children 中 Tuple [SYS_A02, SYS_D*]。
 */
export async function getFieldDataType(
  attrDefId: string,
): Promise<string | null> {
  const attrDef = await getNode(attrDefId);
  if (!attrDef || attrDef.props._docType !== 'attrDef') return null;
  if (!attrDef.children || attrDef.children.length === 0) return null;

  const children = await getNodes(attrDef.children);
  for (const child of children) {
    if (
      child.props._docType === 'tuple' &&
      child.children &&
      child.children[0] === SYS_A.TYPE_CHOICE &&
      child.children.length >= 2
    ) {
      return child.children[1]; // SYS_D* 值
    }
  }

  return SYS_D.PLAIN; // 默认 plain 类型
}

/**
 * 获取字段定义的选项列表（仅 Options 类型）。
 *
 * 查找 AttrDef 中 Tuple key=SYS_T03(Options) 的子节点。
 */
export async function getFieldOptions(
  attrDefId: string,
): Promise<NodexNode[]> {
  const attrDef = await getNode(attrDefId);
  if (!attrDef || !attrDef.children) return [];

  const children = await getNodes(attrDef.children);
  for (const child of children) {
    if (
      child.props._docType === 'tuple' &&
      child.children &&
      child.children.length >= 2
    ) {
      // Options Tuple: children = [SYS_T03, option1Id, option2Id, ...]
      if (child.children[0] === 'SYS_T03') {
        const optionIds = child.children.slice(1);
        return getNodes(optionIds);
      }
    }
  }

  return [];
}

// ============================================================
// 字段值写入
// ============================================================

/**
 * 设置节点的字段值。
 *
 * 如果字段 Tuple 已存在（通过 _sourceId 或 attrDefId 匹配），更新其 children[1]。
 * 如果不存在，创建新的 Tuple + AssociatedData。
 *
 * @param nodeId 内容节点 ID
 * @param attrDefId 字段定义 ID
 * @param valueNodeId 值节点 ID（对于 plain/number 类型，需要先创建值节点）
 */
export async function setFieldValue(
  nodeId: string,
  attrDefId: string,
  valueNodeId: string,
  userId: string,
): Promise<void> {
  const node = await getNode(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  // 查找现有的字段 Tuple
  const existingTuple = await findFieldTuple(node, attrDefId);

  if (existingTuple) {
    // 更新现有 Tuple 的值（children[1]）
    const newChildren = [attrDefId, valueNodeId];
    await updateNode(existingTuple.id, { children: newChildren }, userId);
  } else {
    // 创建新的 Tuple
    const tuple = await createNode(
      {
        workspaceId: node.workspaceId,
        props: {
          _docType: 'tuple',
          _ownerId: nodeId,
        },
        children: [attrDefId, valueNodeId],
      },
      userId,
    );

    // 更新内容节点
    const newChildren = [...(node.children ?? []), tuple.id];
    await updateNode(nodeId, { children: newChildren }, userId);
  }
}

/**
 * 设置纯文本字段值（便捷方法）。
 *
 * 自动创建值节点。
 */
export async function setFieldTextValue(
  nodeId: string,
  attrDefId: string,
  textValue: string,
  userId: string,
): Promise<void> {
  const node = await getNode(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  // 创建值节点
  const valueNode = await createNode(
    {
      workspaceId: node.workspaceId,
      props: {
        name: textValue,
        _ownerId: nodeId,
      },
    },
    userId,
  );

  await setFieldValue(nodeId, attrDefId, valueNode.id, userId);
}

/**
 * 清除字段值。
 *
 * 将 Tuple 的 children[1] 设为空节点（与 Tana 行为一致，不删除 Tuple）。
 */
export async function clearFieldValue(
  nodeId: string,
  attrDefId: string,
  userId: string,
): Promise<void> {
  const node = await getNode(nodeId);
  if (!node) return;

  const tuple = await findFieldTuple(node, attrDefId);
  if (!tuple) return;

  // 创建空值节点
  const emptyNode = await createNode(
    {
      workspaceId: node.workspaceId,
      props: {
        _ownerId: nodeId,
      },
    },
    userId,
  );

  await updateNode(tuple.id, { children: [attrDefId, emptyNode.id] }, userId);
}

// ============================================================
// 内部辅助函数
// ============================================================

/** 查找节点中指定 attrDefId 的字段 Tuple */
async function findFieldTuple(
  node: NodexNode,
  attrDefId: string,
): Promise<NodexNode | null> {
  if (!node.children || node.children.length === 0) return null;

  const children = await getNodes(node.children);
  for (const child of children) {
    if (
      child.props._docType === 'tuple' &&
      child.children &&
      child.children[0] === attrDefId
    ) {
      return child;
    }
  }

  return null;
}

// ============================================================
// 类型定义
// ============================================================

/** 字段值条目 */
export interface FieldValueEntry {
  /** 字段 Tuple 节点 ID */
  tupleId: string;
  /** 字段 Tuple 节点 */
  tupleNode: NodexNode;
  /** 值节点 ID (Tuple.children[1]) */
  valueNodeId: string;
  /** 值节点（如果已加载） */
  valueNode?: NodexNode;
}

/** 字段值映射 { attrDefId → FieldValueEntry } */
export type FieldValueMap = Record<string, FieldValueEntry>;

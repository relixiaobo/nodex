/**
 * Nodex 标签（Supertag）服务
 *
 * 忠实复制 Tana 的标签应用链路：
 *   TagDef → Metanode → Tuple [SYS_A13, tagDefId] → ContentNode._metaNodeId
 *
 * 标签应用完整流程：
 *   1. 创建/获取 Metanode（docType='metanode', _ownerId=contentNodeId）
 *   2. 创建 Tuple [SYS_A13, tagDefId]（docType='tuple', _ownerId=metanodeId）
 *   3. 添加 Tuple 到 Metanode.children
 *   4. 设置 ContentNode._metaNodeId = metanodeId
 *   5. 从 TagDef 字段模板实例化字段 Tuple 到 ContentNode.children
 *   6. 为每个字段创建 AssociatedData 节点，更新 ContentNode.associationMap
 */
import { nanoid } from 'nanoid';
import { SYS_A, SYS_V } from '../types/index.js';
import {
  createNode,
  getNode,
  getNodes,
  updateNode,
  getChildren,
} from './node-service.js';
import type { NodexNode } from '../types/index.js';

// ============================================================
// 标签应用
// ============================================================

/**
 * 为节点应用标签（Supertag）。
 *
 * 忠实执行 Tana 的 6 步标签应用链路。
 */
export async function applyTag(
  nodeId: string,
  tagDefId: string,
  userId: string,
): Promise<void> {
  const node = await getNode(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  const tagDef = await getNode(tagDefId);
  if (!tagDef || tagDef.props._docType !== 'tagDef') {
    throw new Error(`TagDef not found: ${tagDefId}`);
  }

  // Step 1: 获取或创建 Metanode
  let metanode: NodexNode;
  if (node.props._metaNodeId) {
    const existing = await getNode(node.props._metaNodeId);
    if (existing) {
      metanode = existing;
    } else {
      metanode = await createMetanode(nodeId, node.workspaceId, userId);
      await updateNode(nodeId, { props: { _metaNodeId: metanode.id } }, userId);
    }
  } else {
    metanode = await createMetanode(nodeId, node.workspaceId, userId);
    // Step 4: 设置 ContentNode._metaNodeId
    await updateNode(nodeId, { props: { _metaNodeId: metanode.id } }, userId);
  }

  // 检查是否已有此标签
  const existingTags = await getNodeTagIds(metanode);
  if (existingTags.includes(tagDefId)) return; // 已有此标签

  // Step 2: 创建 Tuple [SYS_A13, tagDefId]
  const tagTuple = await createNode(
    {
      workspaceId: node.workspaceId,
      props: {
        _docType: 'tuple',
        _ownerId: metanode.id,
      },
      children: [SYS_A.NODE_SUPERTAGS, tagDefId],
    },
    userId,
  );

  // Step 3: 添加 Tuple 到 Metanode.children
  const metaChildren = [...(metanode.children ?? []), tagTuple.id];
  await updateNode(metanode.id, { children: metaChildren }, userId);

  // Step 5: 检查 TagDef 的 checkbox 配置，创建 SYS_A55 Tuple
  if (await shouldShowCheckbox(tagDef)) {
    const checkboxTuple = await createNode(
      {
        workspaceId: node.workspaceId,
        props: {
          _docType: 'tuple',
          _ownerId: metanode.id,
        },
        children: [SYS_A.SHOW_CHECKBOX, SYS_V.YES],
      },
      userId,
    );
    metaChildren.push(checkboxTuple.id);
    await updateNode(metanode.id, { children: metaChildren }, userId);
  }

  // Step 5: 从 TagDef 字段模板实例化到 ContentNode.children
  await instantiateFieldTemplates(node, tagDef, userId);
}

/**
 * 从节点移除标签。
 *
 * 从 Metanode 中删除对应的 SYS_A13 Tuple。
 * 不删除已实例化的字段 Tuple（与 Tana 行为一致）。
 */
export async function removeTag(
  nodeId: string,
  tagDefId: string,
  userId: string,
): Promise<void> {
  const node = await getNode(nodeId);
  if (!node || !node.props._metaNodeId) return;

  const metanode = await getNode(node.props._metaNodeId);
  if (!metanode || !metanode.children) return;

  // 找到 SYS_A13 Tuple
  const tuples = await getNodes(metanode.children);
  const tagTupleIds: string[] = [];
  for (const tuple of tuples) {
    if (
      tuple.props._docType === 'tuple' &&
      tuple.children &&
      tuple.children[0] === SYS_A.NODE_SUPERTAGS &&
      tuple.children[1] === tagDefId
    ) {
      tagTupleIds.push(tuple.id);
    }
  }

  if (tagTupleIds.length === 0) return;

  // 从 Metanode.children 中移除
  const newChildren = metanode.children.filter(id => !tagTupleIds.includes(id));
  await updateNode(metanode.id, { children: newChildren }, userId);
}

/**
 * 获取节点的所有标签 ID。
 *
 * 通过 Metanode → Tuple [SYS_A13] 链路获取。
 */
export async function getNodeTags(nodeId: string): Promise<string[]> {
  const node = await getNode(nodeId);
  if (!node || !node.props._metaNodeId) return [];

  const metanode = await getNode(node.props._metaNodeId);
  if (!metanode) return [];

  return getNodeTagIds(metanode);
}

/**
 * 获取工作区中所有标签定义。
 */
export async function getWorkspaceTags(
  workspaceId: string,
): Promise<NodexNode[]> {
  const { getNodesByDocType } = await import('./node-service.js');
  return getNodesByDocType(workspaceId, 'tagDef');
}

/**
 * 解析标签的完整字段列表（含继承）。
 *
 * 递归获取父标签（extendsTagIds）的字段，合并去重。
 * 字段身份由 attrDef ID 决定（而非名称）—— 与 Tana 一致。
 */
export async function resolveTagFields(tagDefId: string): Promise<string[]> {
  const tagDef = await getNode(tagDefId);
  if (!tagDef || tagDef.props._docType !== 'tagDef') return [];

  const fieldAttrDefIds: string[] = [];

  // 递归获取父标签的字段
  const metanode = tagDef.props._metaNodeId
    ? await getNode(tagDef.props._metaNodeId)
    : null;

  // 检查 extends 关系（通过 TagDef 的 Metanode 或 children 中的配置）
  const parentTagIds = await getExtendsTagIds(tagDef);
  for (const parentId of parentTagIds) {
    const parentFields = await resolveTagFields(parentId);
    fieldAttrDefIds.push(...parentFields);
  }

  // 获取自身的字段模板 Tuple
  if (tagDef.children) {
    const children = await getNodes(tagDef.children);
    for (const child of children) {
      if (child.props._docType === 'tuple' && child.children && child.children.length >= 1) {
        const attrDefId = child.children[0];
        // 排除系统属性 Tuple（SYS_A*），只取用户字段
        if (!attrDefId.startsWith('SYS_')) {
          fieldAttrDefIds.push(attrDefId);
        }
      }
    }
  }

  // 去重（保留顺序，字段身份由 ID 决定）
  return [...new Set(fieldAttrDefIds)];
}

// ============================================================
// 内部辅助函数
// ============================================================

/** 创建 Metanode */
async function createMetanode(
  contentNodeId: string,
  workspaceId: string,
  userId: string,
): Promise<NodexNode> {
  return createNode(
    {
      workspaceId,
      props: {
        _docType: 'metanode',
        _ownerId: contentNodeId, // 双向链接：Metanode._ownerId → ContentNode
      },
    },
    userId,
  );
}

/** 从 Metanode 的 Tuple 子节点中提取标签 ID */
async function getNodeTagIds(metanode: NodexNode): Promise<string[]> {
  if (!metanode.children || metanode.children.length === 0) return [];

  const tuples = await getNodes(metanode.children);
  const tagIds: string[] = [];

  for (const tuple of tuples) {
    if (
      tuple.props._docType === 'tuple' &&
      tuple.children &&
      tuple.children[0] === SYS_A.NODE_SUPERTAGS &&
      tuple.children.length >= 2
    ) {
      tagIds.push(tuple.children[1]);
    }
  }

  return tagIds;
}

/** 检查 TagDef 是否配置了 show checkbox */
async function shouldShowCheckbox(tagDef: NodexNode): Promise<boolean> {
  if (!tagDef.props._metaNodeId) return false;

  const metanode = await getNode(tagDef.props._metaNodeId);
  if (!metanode || !metanode.children) return false;

  const tuples = await getNodes(metanode.children);
  for (const tuple of tuples) {
    if (
      tuple.props._docType === 'tuple' &&
      tuple.children &&
      tuple.children[0] === SYS_A.SHOW_CHECKBOX &&
      tuple.children[1] === SYS_V.YES
    ) {
      return true;
    }
  }

  return false;
}

/** 获取 TagDef 的继承标签 ID 列表 (via NDX_A05 EXTENDS tuples in metanode) */
async function getExtendsTagIds(tagDef: NodexNode): Promise<string[]> {
  if (!tagDef.props._metaNodeId) return [];

  const metanode = await getNode(tagDef.props._metaNodeId);
  if (!metanode?.children) return [];

  const tuples = await getNodes(metanode.children);
  const extendsIds: string[] = [];

  for (const tuple of tuples) {
    if (
      tuple.props._docType === 'tuple' &&
      tuple.children?.[0] === SYS_A.EXTENDS &&
      tuple.children.length >= 2
    ) {
      extendsIds.push(tuple.children[1]);
    }
  }

  return extendsIds;
}

/**
 * 从 TagDef 的字段模板 Tuple 实例化到内容节点的 children。
 *
 * TagDef.children 中的每个 Tuple [attrDefId, defaultValueId] 被克隆：
 *   - 创建新 Tuple，children 相同
 *   - 设置 _sourceId 指向原模板 Tuple（模板-实例继承）
 *   - 创建 AssociatedData 节点
 *   - 更新 ContentNode.associationMap
 */
async function instantiateFieldTemplates(
  contentNode: NodexNode,
  tagDef: NodexNode,
  userId: string,
): Promise<void> {
  if (!tagDef.children || tagDef.children.length === 0) return;

  const templateTuples = await getNodes(tagDef.children);
  const newChildren = [...(contentNode.children ?? [])];
  const newAssociationMap = { ...(contentNode.associationMap ?? {}) };

  for (const template of templateTuples) {
    if (template.props._docType !== 'tuple' || !template.children) continue;

    // 检查是否已实例化此模板（通过 _sourceId）
    const existingChildren = contentNode.children ?? [];
    const existingNodes = existingChildren.length > 0 ? await getNodes(existingChildren) : [];
    const alreadyInstantiated = existingNodes.some(
      n => n.props._sourceId === template.id,
    );
    if (alreadyInstantiated) continue;

    // Step 5a: 克隆 Tuple，设置 _sourceId 指向模板
    const instanceTuple = await createNode(
      {
        workspaceId: contentNode.workspaceId,
        props: {
          _docType: 'tuple' as const,
          _ownerId: contentNode.id,
          _sourceId: template.id, // 模板-实例继承
        },
        children: [...template.children],
      },
      userId,
    );
    newChildren.push(instanceTuple.id);

    // Step 6: 创建 AssociatedData 节点
    const associatedData = await createNode(
      {
        workspaceId: contentNode.workspaceId,
        props: {
          _docType: 'associatedData',
          _ownerId: contentNode.id,
        },
      },
      userId,
    );
    newAssociationMap[instanceTuple.id] = associatedData.id;
  }

  // 更新内容节点
  await updateNode(
    contentNode.id,
    {
      children: newChildren,
      associationMap: newAssociationMap,
    },
    userId,
  );
}

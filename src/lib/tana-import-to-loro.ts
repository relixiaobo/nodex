/**
 * Tana 数据导入到 LoroDoc — 一次性脚本
 *
 * 使用方法：
 *   const data = await fetch('/soma-import-data.json').then(r=>r.json())
 *   window.__importTana(data)
 *
 * 导入完成后可删除此文件。
 */

import * as loroDoc from './loro-doc.js';

interface ImportNode {
  id: string;
  name?: string;
  description?: string;
  type?: string;
  tags?: string[];
  children?: string[];
  createdAt?: number;
  updatedAt?: number;
  completedAt?: number;
  publishedAt?: number;
  flags?: number;
  templateId?: string;
  imageWidth?: number;
  imageHeight?: number;
  fieldDefId?: string;
  fieldType?: string;
  cardinality?: string;
  showCheckbox?: boolean;
  color?: string;
  extends?: string;
  childSupertag?: string;
  locked?: boolean;
  [key: string]: unknown;
}

interface ImportData {
  nodes: { node: ImportNode; parentId: string }[];
  stats?: Record<string, number>;
}

/** 不写入 LoroMap 的属性（通过其他 API 或 tree structure 设置） */
const SKIP_DATA_KEYS = new Set(['id', 'children', 'tags', 'createdAt', 'updatedAt']);

/**
 * 在 parent 的已有子节点中查找同名节点。
 * 用于日历节点（year/week/day）合并：如果已存在同名节点则复用。
 */
function findExistingChildByName(parentId: string, name: string): string | null {
  const children = loroDoc.getChildren(parentId);
  for (const childId of children) {
    const child = loroDoc.toNodexNode(childId);
    if (child && child.name === name) return childId;
  }
  return null;
}

/** 写入节点属性和标签 */
function writeNodeData(nodeId: string, node: ImportNode): void {
  const nodeData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (SKIP_DATA_KEYS.has(key)) continue;
    if (value === undefined || value === null) continue;
    nodeData[key] = value;
  }
  if (Object.keys(nodeData).length > 0) {
    loroDoc.setNodeDataBatch(nodeId, nodeData);
  }
  // 覆盖 createNode 的默认时间戳
  if (node.createdAt) {
    loroDoc.setNodeDataBatch(nodeId, {
      createdAt: node.createdAt,
      updatedAt: node.updatedAt ?? node.createdAt,
    });
  }
  // 添加标签
  if (node.tags && node.tags.length > 0) {
    for (const tagId of node.tags) {
      loroDoc.addTag(nodeId, tagId);
    }
  }
}

/** 需要按名字合并的标签（日历节点） */
const MERGE_BY_NAME_TAGS = new Set(['sys:day', 'sys:week', 'sys:year']);

/** 判断节点是否应按名字合并（而非新建） */
function shouldMergeByName(node: ImportNode): boolean {
  if (!node.tags) return false;
  return node.tags.some(t => MERGE_BY_NAME_TAGS.has(t));
}

export async function importTanaToLoro(data: ImportData): Promise<{ created: number; merged: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  let created = 0;
  let merged = 0;
  let skipped = 0;

  const workspaceHomeId = loroDoc.getCurrentWorkspaceId();
  if (!workspaceHomeId || !loroDoc.hasNode(workspaceHomeId)) {
    return { created: 0, merged: 0, skipped: 0, errors: ['No workspace home node found. LoroDoc not initialized?'] };
  }

  console.log(`[tana-import] Workspace home: ${workspaceHomeId}`);
  console.log(`[tana-import] Importing ${data.nodes.length} nodes...`);

  // parentId → children 依赖图
  const byParent = new Map<string, { node: ImportNode; parentId: string }[]>();
  for (const entry of data.nodes) {
    const pid = entry.parentId;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid)!.push(entry);
  }

  function resolveParent(parentId: string): string | null {
    if (parentId === 'ROOT') return workspaceHomeId;
    return parentId;
  }

  // 导入 ID → 实际 LoroDoc ID 的映射（处理合并后 ID 变化）
  const idRemap = new Map<string, string>();

  /** 解析可能被合并重映射的 ID */
  function resolveId(id: string): string {
    return idRemap.get(id) ?? id;
  }

  // BFS 按层级创建
  const queue: string[] = ['ROOT', 'SCHEMA', 'TRASH', 'JOURNAL'];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    if (visited.has(parentId)) continue;
    visited.add(parentId);

    const children = byParent.get(parentId);
    if (!children) continue;

    for (const { node, parentId: pid } of children) {
      const actualParent = resolveId(resolveParent(pid) ?? '');
      if (!actualParent || !loroDoc.hasNode(actualParent)) {
        skipped++;
        continue;
      }

      // 已存在的节点 → 跳过但继续处理子节点
      const resolvedNodeId = resolveId(node.id);
      if (loroDoc.hasNode(resolvedNodeId)) {
        skipped++;
        queue.push(node.id);
        continue;
      }

      try {
        // 日历节点：按名字合并到已有节点
        if (shouldMergeByName(node) && node.name) {
          const existingId = findExistingChildByName(actualParent, node.name);
          if (existingId) {
            // 合并：用已有节点的 ID，导入数据的子节点会挂到这个已有节点下
            idRemap.set(node.id, existingId);
            merged++;
            queue.push(node.id); // 继续处理子节点（会通过 idRemap 解析到已有节点）
            continue;
          }
        }

        // 创建新节点
        loroDoc.createNode(node.id, actualParent);
        writeNodeData(node.id, node);
        created++;
      } catch (e) {
        errors.push(`[error] ${node.id}: ${e instanceof Error ? e.message : String(e)}`);
      }

      queue.push(node.id);
    }
  }

  // 统计孤儿
  let orphanCount = 0;
  for (const { node } of data.nodes) {
    const rid = resolveId(node.id);
    if (!loroDoc.hasNode(rid) && !visited.has(node.id)) orphanCount++;
  }
  if (orphanCount > 0) {
    console.log(`[tana-import] Skipped ${orphanCount} orphan nodes (parent not reachable)`);
  }

  loroDoc.commitDoc('import:tana');

  // 立即持久化到 IndexedDB，不依赖 scheduleSave 的 1.5s 延迟
  console.log('[tana-import] Persisting to IndexedDB...');
  await loroDoc.saveNow();

  console.log(`[tana-import] Done: ${created} created, ${merged} merged, ${skipped} skipped, ${errors.length} errors`);
  if (errors.length > 0) console.log(`[tana-import] First 10 errors:`, errors.slice(0, 10));

  return { created, merged, skipped, errors };
}

if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__importTana = importTanaToLoro;
}

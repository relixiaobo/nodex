/**
 * Tana 数据导入服务
 *
 * 从 Tana 导出的 JSON 文件导入数据到 Nodex (Supabase)。
 *
 * Tana 导出数据包含 Metanode 和 AssociatedData 间接层，Nodex 已将其简化
 * （meta[] 替代 Metanode，Tuple.children[1:] 替代 AssociatedData）。
 * 导入时将旧结构转换为新格式（meta[] 填充、docType 过滤）。
 *
 * Tana 导出 JSON 顶层结构：
 * {
 *   editors: [["email", index], ...],
 *   lastTxid: string,
 *   lastFbKey: string,
 *   optimisticTransIds: object,
 *   currentWorkspaceId: string,
 *   formatVersion: number,
 *   docs: TanaDoc[],
 *   workspaces: object
 * }
 *
 * 每个 TanaDoc 的字段：
 * {
 *   id: string,
 *   props: {
 *     created: number,
 *     name?: string,
 *     description?: string,
 *     _docType?: string,
 *     _ownerId?: string,
 *     _metaNodeId?: string,
 *     _sourceId?: string,
 *     _flags?: number,
 *     _done?: number,
 *     _imageWidth?: number,
 *     _imageHeight?: number,
 *     _view?: string,
 *     _published?: number,
 *     _editMode?: boolean,
 *     searchContextNode?: string,
 *   },
 *   children?: string[],
 *   associationMap?: Record<string, string>,
 *   touchCounts?: number[],
 *   modifiedTs?: number[],
 *   migrateTime?: number,
 * }
 */
import type { NodexNode, DocType, ViewMode } from '../types/index.js';
import { createNodes } from './node-service.js';
import { htmlToMarks } from '../lib/editor-marks.js';

// ============================================================
// Tana 导出格式类型定义
// ============================================================

/** Tana 导出 JSON 顶层结构 */
export interface TanaExportData {
  editors: [string, number][];
  lastTxid: string;
  lastFbKey?: string;
  optimisticTransIds?: Record<string, unknown>;
  currentWorkspaceId: string;
  formatVersion?: number;
  docs: TanaDoc[];
  workspaces: Record<string, unknown>;
}

/** Tana 单个文档节点 */
export interface TanaDoc {
  id: string;
  props: {
    created: number;
    name?: string;
    description?: string;
    _docType?: string;
    _ownerId?: string;
    _metaNodeId?: string;
    _sourceId?: string;
    _flags?: number;
    _done?: number;
    _imageWidth?: number;
    _imageHeight?: number;
    _view?: string;
    _published?: number;
    _editMode?: boolean;
    searchContextNode?: string;
  };
  children?: string[];
  associationMap?: Record<string, string>;
  /** 可能是 number[] 数组，也可能是 JSON 字符串 '{"0":10,"1":5}'（Tana 紧凑格式） */
  touchCounts?: number[] | string;
  /** 可能是 number[] 数组，也可能是 JSON 字符串 '{"0":1769139868559}'（Tana 紧凑格式） */
  modifiedTs?: number[] | string;
  migrateTime?: number;
}

/** 导入结果 */
export interface ImportResult {
  totalDocs: number;
  importedNodes: number;
  skippedNodes: number;
  errors: ImportError[];
  workspaceId: string;
  editorCount: number;
}

export interface ImportError {
  docId: string;
  error: string;
}

// ============================================================
// 工作区 ID 推导
// ============================================================

/**
 * 从 Tana 的 _ownerId 链推导节点所属的工作区 ID。
 *
 * Tana 的工作区归属是隐式的（通过 _ownerId 链向上追溯到工作区根节点），
 * Nodex 需要显式的 workspace_id 列来支持 SQL 查询。
 *
 * 策略：
 * 1. 构建 _ownerId 父子关系图
 * 2. 从工作区容器节点（{wsId}_SCHEMA, {wsId}_TRASH 等）反向推导 wsId
 * 3. 对于每个节点，沿 _ownerId 链向上追溯直到找到工作区根
 */
function deriveWorkspaceIds(
  docs: TanaDoc[],
  currentWorkspaceId: string,
): Map<string, string> {
  const wsMap = new Map<string, string>();

  // 预构建 ID → doc 映射
  const docById = new Map<string, TanaDoc>();
  for (const doc of docs) {
    docById.set(doc.id, doc);
  }

  // 已知的工作区容器后缀
  const WS_SUFFIXES = [
    '_SCHEMA', '_TRASH', '_WORKSPACE', '_STASH',
    '_CAPTURE_INBOX', '_SEARCHES', '_MOVETO',
    '_CHATDRAFTS', '_SIDEBAR_AREAS', '_QUICK_ADD',
    '_AVATAR', '_USERS', '_TRAILING_SIDEBAR', '_PINS',
  ];

  // 通过容器节点 ID 推导工作区 ID
  const containerWsIds = new Set<string>();
  for (const doc of docs) {
    for (const suffix of WS_SUFFIXES) {
      if (doc.id.endsWith(suffix)) {
        const wsId = doc.id.slice(0, -suffix.length);
        containerWsIds.add(wsId);
        wsMap.set(doc.id, wsId);
      }
    }
  }

  // 直接标记工作区根节点
  for (const wsId of containerWsIds) {
    wsMap.set(wsId, wsId);
  }

  // SYS_ 节点归属系统工作区
  for (const doc of docs) {
    if (doc.id.startsWith('SYS_')) {
      wsMap.set(doc.id, 'SYS');
    }
  }

  // 递归沿 _ownerId 链向上追溯
  function resolveWs(docId: string, visited: Set<string>): string {
    if (wsMap.has(docId)) return wsMap.get(docId)!;
    if (visited.has(docId)) return currentWorkspaceId; // 防循环

    visited.add(docId);

    const doc = docById.get(docId);
    if (!doc || !doc.props._ownerId) {
      // 无父节点，使用默认工作区
      wsMap.set(docId, currentWorkspaceId);
      return currentWorkspaceId;
    }

    const parentWs = resolveWs(doc.props._ownerId, visited);
    wsMap.set(docId, parentWs);
    return parentWs;
  }

  // 为所有节点推导工作区
  for (const doc of docs) {
    if (!wsMap.has(doc.id)) {
      resolveWs(doc.id, new Set());
    }
  }

  return wsMap;
}

// ============================================================
// 导入核心逻辑
// ============================================================

/**
 * 将 Tana 导出 JSON 导入到 Nodex。
 *
 * 由于忠实复制 Tana 数据模型，导入逻辑直接映射：
 * 1. 解析 docs[] 数组
 * 2. 推导每个节点的 workspaceId
 * 3. 映射 props 到 PostgreSQL 列名
 * 4. 添加 Nodex 扩展字段默认值
 * 5. 批量插入 Supabase
 */
export async function importTanaExport(
  data: TanaExportData,
  userId: string,
): Promise<ImportResult> {
  const result: ImportResult = {
    totalDocs: data.docs.length,
    importedNodes: 0,
    skippedNodes: 0,
    errors: [],
    workspaceId: data.currentWorkspaceId,
    editorCount: data.editors.length,
  };

  // Step 1: 推导工作区 ID
  const wsMap = deriveWorkspaceIds(data.docs, data.currentWorkspaceId);

  // Step 2: 转换文档为 NodexNode
  const nodes: NodexNode[] = [];
  const now = Date.now();

  // 预构建 ID → doc 映射，供后处理步骤使用
  const docById = new Map<string, TanaDoc>();
  for (const doc of data.docs) {
    docById.set(doc.id, doc);
  }

  for (const doc of data.docs) {
    try {
      const node = tanaDocToNodexNode(doc, wsMap, userId, now);
      nodes.push(node);
    } catch (err) {
      result.errors.push({
        docId: doc.id,
        error: err instanceof Error ? err.message : String(err),
      });
      result.skippedNodes++;
    }
  }

  // Step 2.5: 后处理 — 将 Tana 的 _metaNodeId → node.meta[]
  // Tana 模型：ContentNode._metaNodeId → Metanode → Metanode.children = [tupleId, ...]
  // Nodex 模型：ContentNode.meta = [tupleId, ...]（直接存储，无 Metanode 间接层）
  const nodeById = new Map<string, NodexNode>();
  for (const node of nodes) {
    nodeById.set(node.id, node);
  }

  for (const doc of data.docs) {
    if (!doc.props._metaNodeId) continue;

    const contentNode = nodeById.get(doc.id);
    if (!contentNode) continue;

    const metanodeDoc = docById.get(doc.props._metaNodeId);
    if (!metanodeDoc?.children?.length) continue;

    // Metanode.children 就是 meta tuple IDs，直接赋给 content node
    contentNode.meta = metanodeDoc.children;
  }

  // Step 3: 批量插入
  if (nodes.length > 0) {
    await createNodes(nodes);
    result.importedNodes = nodes.length;
  }

  return result;
}

/**
 * 解析 Tana 的 touchCounts/modifiedTs 紧凑格式。
 *
 * Tana 导出中这两个字段有两种格式：
 *   1. 标准数组：[1769566202688, 0, 0, 0]（14,278 个节点）
 *   2. JSON 字符串：'{"0":1769139868559}'（24,533 个节点）
 *
 * JSON 字符串是稀疏数组的紧凑表示，key 为索引，value 为值。
 * 转换为标准数组，空位填 0。
 */
function parseCompactArray(value: number[] | string | undefined): number[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === 'object' && parsed !== null) {
        // 稀疏数组 {"0": 10, "2": 5} → [10, 0, 5]
        const indices = Object.keys(parsed).map(Number).filter(n => !isNaN(n));
        if (indices.length === 0) return [];
        const maxIndex = Math.max(...indices);
        const result = new Array(maxIndex + 1).fill(0);
        for (const [idx, val] of Object.entries(parsed)) {
          const i = Number(idx);
          if (!isNaN(i)) result[i] = Number(val) || 0;
        }
        return result;
      }
    } catch {
      // 无法解析，返回空数组
    }
  }
  return [];
}

/** Deprecated Tana docType values that are no longer in the DocType union. */
const DEPRECATED_DOC_TYPES = new Set(['metanode', 'associatedData']);

/**
 * Filter deprecated docType values to undefined.
 * Tana exports may contain 'metanode' or 'associatedData' which are no longer valid.
 */
function sanitizeDocType(raw: string | undefined): DocType | undefined {
  if (!raw) return undefined;
  if (DEPRECATED_DOC_TYPES.has(raw)) return undefined;
  return raw as DocType;
}

/**
 * 将单个 TanaDoc 转换为 NodexNode。
 *
 * 直接映射，无需结构转换。
 */
function tanaDocToNodexNode(
  doc: TanaDoc,
  wsMap: Map<string, string>,
  userId: string,
  _now: number,
): NodexNode {
  const workspaceId = wsMap.get(doc.id) ?? 'unknown';
  const parsedName = htmlToMarks(doc.props.name ?? '');

  const touchCounts = parseCompactArray(doc.touchCounts);
  const modifiedTs = parseCompactArray(doc.modifiedTs);

  // 计算 updatedAt：取 modifiedTs 中的最大非零值，或 created
  let updatedAt = doc.props.created;
  const validTimestamps = modifiedTs.filter(ts => ts > 0);
  if (validTimestamps.length > 0) {
    updatedAt = Math.max(...validTimestamps);
  }

  return {
    id: doc.id,
    workspaceId,
    props: {
      created: doc.props.created,
      name: parsedName.text,
      ...(parsedName.marks.length > 0 ? { _marks: parsedName.marks } : {}),
      ...(parsedName.inlineRefs.length > 0 ? { _inlineRefs: parsedName.inlineRefs } : {}),
      description: doc.props.description,
      _docType: sanitizeDocType(doc.props._docType),
      _ownerId: doc.props._ownerId,
      // _metaNodeId: dropped (replaced by node.meta[])
      _sourceId: doc.props._sourceId,
      _flags: doc.props._flags,
      _done: doc.props._done,
      _imageWidth: doc.props._imageWidth,
      _imageHeight: doc.props._imageHeight,
      _view: doc.props._view as ViewMode | undefined,
      _published: doc.props._published,
      _editMode: doc.props._editMode,
      searchContextNode: doc.props.searchContextNode,
    },
    children: doc.children,
    // associationMap: dropped (field values now in Tuple.children[1:])
    touchCounts,
    modifiedTs,
    version: 1,
    updatedAt,
    createdBy: userId,
    updatedBy: userId,
  };
}

// ============================================================
// 导入验证
// ============================================================

/**
 * 验证导入数据的完整性。
 *
 * 检查 Tana 导出数据的引用完整性（在导入前诊断数据质量）：
 * - 所有 children 引用的节点是否存在
 * - 所有 _ownerId 引用的节点是否存在
 * - 所有 _metaNodeId 引用的节点是否存在（Tana 原始格式）
 * - 所有 associationMap 中引用的节点是否存在（Tana 原始格式）
 */
export function validateTanaExport(data: TanaExportData): ValidationResult {
  const docIds = new Set(data.docs.map(d => d.id));
  const result: ValidationResult = {
    totalDocs: data.docs.length,
    missingChildRefs: [],
    missingOwnerRefs: [],
    missingMetaNodeRefs: [],
    missingAssociationRefs: [],
    docTypeDistribution: new Map(),
  };

  for (const doc of data.docs) {
    // DocType 分布统计
    const docType = doc.props._docType ?? '(none)';
    result.docTypeDistribution.set(
      docType,
      (result.docTypeDistribution.get(docType) ?? 0) + 1,
    );

    // 检查 children 引用
    if (doc.children) {
      for (const childId of doc.children) {
        if (!docIds.has(childId)) {
          result.missingChildRefs.push({ docId: doc.id, refId: childId });
        }
      }
    }

    // 检查 _ownerId 引用
    if (doc.props._ownerId && !docIds.has(doc.props._ownerId)) {
      result.missingOwnerRefs.push({ docId: doc.id, refId: doc.props._ownerId });
    }

    // 检查 _metaNodeId 引用
    if (doc.props._metaNodeId && !docIds.has(doc.props._metaNodeId)) {
      result.missingMetaNodeRefs.push({ docId: doc.id, refId: doc.props._metaNodeId });
    }

    // 检查 associationMap 引用
    if (doc.associationMap) {
      for (const [key, value] of Object.entries(doc.associationMap)) {
        if (!docIds.has(key)) {
          result.missingAssociationRefs.push({ docId: doc.id, refId: key });
        }
        if (!docIds.has(value)) {
          result.missingAssociationRefs.push({ docId: doc.id, refId: value });
        }
      }
    }
  }

  return result;
}

/** 引用缺失记录 */
interface MissingRef {
  docId: string;
  refId: string;
}

/** 验证结果 */
export interface ValidationResult {
  totalDocs: number;
  missingChildRefs: MissingRef[];
  missingOwnerRefs: MissingRef[];
  missingMetaNodeRefs: MissingRef[];
  missingAssociationRefs: MissingRef[];
  docTypeDistribution: Map<string, number>;
}

// ============================================================
// 导出编辑者信息
// ============================================================

/**
 * 导入编辑者信息到 editors 表。
 */
export async function importEditors(
  editors: [string, number][],
  workspaceId: string,
): Promise<void> {
  const { getSupabase } = await import('./supabase.js');
  const supabase = getSupabase();

  const rows = editors.map(([identifier, index]) => ({
    workspace_id: workspaceId,
    index,
    identifier,
  }));

  const { error } = await supabase
    .from('editors')
    .insert(rows);

  if (error) throw new Error(`Failed to import editors: ${error.message}`);
}

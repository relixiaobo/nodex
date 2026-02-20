/**
 * Tana 数据导入服务 — Phase 1 Loro 迁移存根
 *
 * Tana 导入将在 Phase 2 重新实现为直接写入 LoroDoc。
 * 本文件保留类型定义以维护公共 API，但实现为存根。
 */

// ============================================================
// Tana 导出格式类型定义（保留）
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
  touchCounts?: number[] | string;
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
// 存根实现（Phase 2 将重新实现为写入 LoroDoc）
// ============================================================

export async function importTanaExport(
  data: TanaExportData,
  _userId: string,
): Promise<ImportResult> {
  return {
    totalDocs: data.docs.length,
    importedNodes: 0,
    skippedNodes: data.docs.length,
    errors: [],
    workspaceId: data.currentWorkspaceId,
    editorCount: 0,
  };
}

export function validateTanaExport(data: TanaExportData): ValidationResult {
  return {
    totalDocs: data.docs.length,
    missingChildRefs: [],
    missingOwnerRefs: [],
    missingMetaNodeRefs: [],
    missingAssociationRefs: [],
    docTypeDistribution: new Map(),
  };
}

export async function importEditors(
  _editors: [string, number][],
  _workspaceId: string,
): Promise<void> {}

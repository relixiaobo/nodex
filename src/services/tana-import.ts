/**
 * Tana 数据导入服务
 *
 * 将 Tana 导出 JSON 转换为 soma NodexNode 格式。
 *
 * 映射规则（已确认）：
 * - article → NDX_T01 | video → NDX_T02 | tweet → NDX_T03
 * - highlight → SYS_T200 | source → SYS_T202
 * - card → 保留原 ID 为用户标签
 * - task/project/prompt/model/product → 保留原 ID + 字段结构
 * - book/podcast/person → 丢弃标签，保留为普通节点
 * - day/week/year → Journal 日历节点
 */

import type { NodexNode, NodeType } from '../types/node.js';

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
  touchCounts?: number[] | string;
  modifiedTs?: number[] | string;
  migrateTime?: number;
}

// ============================================================
// Transform 输出类型
// ============================================================

export interface TransformResult {
  /** 所有转换后的节点 + parentId */
  nodes: TransformedNode[];
  stats: TransformStats;
  warnings: string[];
}

export interface TransformedNode {
  node: NodexNode;
  /** 父节点 ID。'ROOT' = 顶层节点（LoroTree root 的直接子节点） */
  parentId: string;
}

export interface TransformStats {
  totalInput: number;
  contentNodes: number;
  tagDefs: number;
  fieldDefs: number;
  fieldEntries: number;
  codeBlocks: number;
  skipped: number;
  missingRefs: number;
}

// ============================================================
// 元数据提取结果（从 metanode 中解析）
// ============================================================

interface ExtractedMeta {
  tags: string[];
  color?: string;
  locked?: boolean;
  showCheckbox?: boolean;
  childSupertag?: string;
  extendsTag?: string;
  fieldType?: string;
  cardinality?: 'single' | 'list';
}

// ============================================================
// 映射常量
// ============================================================

/** Tana ID → soma ID（统一重映射表） */
const ID_REMAP: Record<string, string> = {
  // 标签定义 → soma 固定标签
  'Y5LItkZPjavg': 'NDX_T01',   // article → ARTICLE
  'R7quBhIdgF2P': 'NDX_T02',   // video → VIDEO
  'qUmLDk_nGj9d': 'NDX_T03',   // tweet → SOCIAL
  'S1LBP4a9eoaH': 'SYS_T200',  // highlight → HIGHLIGHT
  'Gqw0OMEGjiuk': 'SYS_T202',  // source → SOURCE
  'c-YgdZIHB4uz': 'sys:day',   // day → SYSTEM_TAGS.DAY
  'gNhuC6apo_ej': 'sys:week',  // week → SYSTEM_TAGS.WEEK
  'kCCG1uRQajkL': 'sys:year',  // year → SYSTEM_TAGS.YEAR

  // 字段定义 → soma 固定字段
  'SYS_A78':      'NDX_F01',    // URL → SOURCE_URL
  'HE6RkhKNLp4b': 'NDX_F03',   // Author/Developer → AUTHOR
  'S87n7X-565z0': 'NDX_F08',   // Highlights → SOURCE_HIGHLIGHTS
  'XmXYaiI9CtXv': 'NDX_F02',   // From → HIGHLIGHT_SOURCE
};

/** 不加入 node.tags 的标签 ID（丢弃或纯元信息） */
const DISCARD_TAG_IDS = new Set([
  // 用户决定丢弃的标签
  'Gqw0OMEGjiuk',  // source（抽象父类，0 直接使用）
  'KDgcfPtcXCcA',  // book → plain node
  'D4Fd2VWpwURV',  // podcast → plain node
  'oqapfirJnGvR',  // person → plain node
  'HVU870iusKGY',  // app → 0 usage
  // Tana 系统元标签（不是用户标签）
  'SYS_T01',       // #supertag
  'SYS_T02',       // #field-definition
  'SYS_T16',       // #meta-information
  'SYS_T29',       // #row-defaults
  'SYS_T41',       // #tagr-app
]);

/** 不创建 tagDef 节点的标签（已存在于 soma 或被丢弃） */
const SKIP_TAG_DEF_IDS = new Set([
  // 已映射到 soma 固定标签（soma bootstrap 会创建）
  'Y5LItkZPjavg', 'R7quBhIdgF2P', 'qUmLDk_nGj9d',
  'S1LBP4a9eoaH', 'Gqw0OMEGjiuk',
  // 丢弃
  'KDgcfPtcXCcA', 'D4Fd2VWpwURV', 'oqapfirJnGvR', 'HVU870iusKGY',
  // 注意: day/week/year (c-YgdZIHB4uz, gNhuC6apo_ej, kCCG1uRQajkL) 不跳过
  // 因为 soma bootstrap 不创建它们的 tagDef 节点，导入时需要创建
  // Tana 系统标签
  ...Array.from({ length: 30 }, (_, i) => `SYS_T${String(i).padStart(2, '0')}`),
  'SYS_T41',
  // Tana base types（SYS_T98-T126）
  ...[98, 99, 100, 101, 102, 103, 104, 105, 117, 118, 119, 124, 125, 126, 157].map(n => `SYS_T${n}`),
]);

/** 整个节点跳过的 docType */
const SKIP_DOC_TYPES = new Set([
  'metanode', 'associatedData', 'workspace', 'visual',
  'command', 'systemTool', 'syntax', 'chat', 'chatbot',
  'placeholder', 'home', 'settings', 'search', 'viewDef',
]);

/** SYS_D* → FIELD_TYPES */
const DATA_TYPE_MAP: Record<string, string> = {
  SYS_D01: 'date', SYS_D02: 'url', SYS_D03: 'number',
  SYS_D04: 'checkbox', SYS_D05: 'options', SYS_D06: 'email',
  SYS_D07: 'plain', SYS_D08: 'formula', SYS_D10: 'boolean',
};

// ============================================================
// 工具函数
// ============================================================

/** 解析 Tana 的紧凑稀疏数组格式 */
function parseCompactArray(val: number[] | string | undefined): number[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try {
    const obj: Record<string, number> = JSON.parse(val);
    const result: number[] = [];
    for (const [k, v] of Object.entries(obj)) result[Number(k)] = v;
    return result;
  } catch {
    return [];
  }
}

/** 取 modifiedTs 的第一个元素作为 updatedAt */
function getUpdatedAt(doc: TanaDoc): number {
  const mod = parseCompactArray(doc.modifiedTs);
  return mod.length > 0 ? mod[0] : doc.props.created;
}

// ============================================================
// 元数据提取
// ============================================================

/** 从 metanode 的 tuple children 中提取结构化元数据 */
function extractMetadata(
  metaDoc: TanaDoc,
  lookup: Map<string, TanaDoc>,
  remap: (id: string) => string,
): ExtractedMeta {
  const meta: ExtractedMeta = { tags: [] };

  for (const childId of metaDoc.children ?? []) {
    const child = lookup.get(childId);
    if (!child || child.props._docType !== 'tuple') continue;

    const gc = child.children ?? [];
    if (gc.length < 2) continue;

    const key = gc[0];
    const values = gc.slice(1);

    switch (key) {
      case 'SYS_A13': { // NODE_SUPERTAGS
        for (const tagId of values) {
          if (!DISCARD_TAG_IDS.has(tagId)) {
            meta.tags.push(remap(tagId));
          }
        }
        // tagDef 的 extends：SYS_A13 值中除 SYS_T01 外的标签
        const nonSystemTags = values.filter(v => v !== 'SYS_T01' && !DISCARD_TAG_IDS.has(v));
        if (nonSystemTags.length > 0) {
          meta.extendsTag = remap(nonSystemTags[nonSystemTags.length - 1]);
        }
        break;
      }
      case 'SYS_A11': { // COLOR
        const colorNode = lookup.get(values[0]);
        if (colorNode) meta.color = colorNode.props.name;
        break;
      }
      case 'SYS_A12': // LOCKED
        if (values[0] === 'SYS_V03') meta.locked = true;
        break;
      case 'SYS_A55': // SHOW_CHECKBOX
        if (values[0] === 'SYS_V03') meta.showCheckbox = true;
        break;
      case 'SYS_A14': // CHILD_SUPERTAG
        meta.childSupertag = remap(values[0]);
        break;
      case 'SYS_A02': // TYPE_CHOICE (attrDef 的字段类型)
        meta.fieldType = DATA_TYPE_MAP[values[0]] ?? 'plain';
        break;
      case 'SYS_A10': // CARDINALITY
        meta.cardinality = values[0] === 'SYS_V02' ? 'list' : 'single';
        break;
    }
  }

  return meta;
}

// ============================================================
// 核心转换
// ============================================================

export function transformTanaExport(data: TanaExportData): TransformResult {
  // ── 构建索引 ──
  const lookup = new Map<string, TanaDoc>();
  for (const doc of data.docs) lookup.set(doc.id, doc);

  // 工作区 ID：通过 _SCHEMA 后缀反推（不用 currentWorkspaceId）
  let wsId = '';
  for (const doc of data.docs) {
    const oid = doc.props._ownerId ?? '';
    if (oid.endsWith('_SCHEMA')) { wsId = oid.replace('_SCHEMA', ''); break; }
  }
  if (!wsId) wsId = data.currentWorkspaceId;

  // 动态系统节点映射
  const dynamicRemap: Record<string, string> = {
    [wsId]: 'ROOT',
    [`${wsId}_SCHEMA`]: 'SCHEMA',
    [`${wsId}_TRASH`]: 'TRASH',
    [`${wsId}_STASH`]: 'ROOT',           // Library → ROOT
    [`${wsId}_CAPTURE_INBOX`]: 'ROOT',    // Inbox → ROOT
    [`${wsId}_SEARCHES`]: 'ROOT',         // Searches → skip children via ROOT
  };
  const journalDoc = data.docs.find(d => d.props._docType === 'journal');
  if (journalDoc) dynamicRemap[journalDoc.id] = 'JOURNAL';
  // 用户首页 (docType=home) → ROOT
  for (const doc of data.docs) {
    if (doc.props._docType === 'home' && doc.props._ownerId === wsId) {
      dynamicRemap[doc.id] = 'ROOT';
      break;
    }
  }

  const allRemap = { ...ID_REMAP, ...dynamicRemap };
  const remap = (id: string): string => allRemap[id] ?? id;

  // ── Phase 1: 从所有 metanode 提取元数据 ──
  const metaMap = new Map<string, ExtractedMeta>();
  for (const doc of data.docs) {
    if (doc.props._docType === 'metanode' && doc.props._ownerId) {
      metaMap.set(doc.props._ownerId, extractMetadata(doc, lookup, remap));
    }
  }

  const output: TransformedNode[] = [];
  const warnings: string[] = [];
  const stats: TransformStats = {
    totalInput: data.docs.length,
    contentNodes: 0, tagDefs: 0, fieldDefs: 0, fieldEntries: 0,
    codeBlocks: 0, skipped: 0, missingRefs: 0,
  };

  // 已处理的 ID（防止重复）
  const processed = new Set<string>();

  // 已知标签 ID 白名单（映射表目标 + Phase 2 创建的用户标签）
  const knownTagIds = new Set<string>(
    Object.values(ID_REMAP).filter(v => v.startsWith('NDX_T') || v.startsWith('SYS_T')),
  );

  // 已知字段 ID 白名单（soma 固定字段 + Phase 2 创建的用户字段）
  const knownFieldIds = new Set<string>(
    Object.values(ID_REMAP).filter(v => v.startsWith('NDX_F')),
  );

  // ── Phase 2: 处理用户 tagDef（card, task, project, prompt, model, product） ──
  for (const doc of data.docs) {
    if (doc.props._docType !== 'tagDef') continue;
    if (SKIP_TAG_DEF_IDS.has(doc.id)) { stats.skipped++; continue; }
    if (doc.props._ownerId?.endsWith('_TRASH')) { stats.skipped++; continue; }

    const meta = metaMap.get(doc.id) ?? { tags: [] };
    const tagNodeId = remap(doc.id);

    const tagNode: NodexNode = {
      id: tagNodeId,
      type: 'tagDef',
      name: doc.props.name,
      description: doc.props.description,
      children: [],
      tags: [],
      createdAt: doc.props.created,
      updatedAt: getUpdatedAt(doc),
      color: meta.color,
      showCheckbox: meta.showCheckbox,
      extends: meta.extendsTag,
      childSupertag: meta.childSupertag,
      locked: meta.locked,
    };

    // 模板字段：tagDef 的 tuple children → fieldDef 节点
    for (const childId of doc.children ?? []) {
      const child = lookup.get(childId);
      if (!child || child.props._docType !== 'tuple') continue;

      const gc = child.children ?? [];
      if (gc.length < 1) continue;

      const fieldRefId = gc[0];
      const mappedFieldId = remap(fieldRefId);

      // 如果映射到 soma 固定字段（NDX_F*），只加引用不创建
      if (mappedFieldId !== fieldRefId && mappedFieldId.startsWith('NDX_F')) {
        tagNode.children.push(mappedFieldId);
        continue;
      }

      // 创建用户 fieldDef
      const fieldDoc = lookup.get(fieldRefId);
      if (fieldDoc && fieldDoc.props._docType === 'attrDef') {
        const fieldMeta = metaMap.get(fieldRefId) ?? { tags: [] };
        const fieldNode: NodexNode = {
          id: mappedFieldId,
          type: 'fieldDef',
          name: fieldDoc.props.name,
          children: [],
          tags: [],
          createdAt: fieldDoc.props.created,
          updatedAt: getUpdatedAt(fieldDoc),
          fieldType: fieldMeta.fieldType ?? 'plain',
          cardinality: fieldMeta.cardinality,
        };

        // attrDef 的 children = 选项值节点（options 类型）
        for (const optId of fieldDoc.children ?? []) {
          const optDoc = lookup.get(optId);
          if (optDoc && !optDoc.props._docType) {
            const optNode: NodexNode = {
              id: remap(optId),
              name: optDoc.props.name,
              children: [],
              tags: [],
              createdAt: optDoc.props.created,
              updatedAt: getUpdatedAt(optDoc),
            };
            output.push({ node: optNode, parentId: mappedFieldId });
            fieldNode.children.push(optNode.id);
            processed.add(optId);
          }
        }

        output.push({ node: fieldNode, parentId: tagNodeId });
        tagNode.children.push(mappedFieldId);
        knownFieldIds.add(mappedFieldId); // 注册到字段白名单
        processed.add(fieldRefId);
        stats.fieldDefs++;
      }
    }

    output.push({ node: tagNode, parentId: 'SCHEMA' });
    processed.add(doc.id);
    knownTagIds.add(tagNodeId); // 注册到白名单
    stats.tagDefs++;
  }

  // ── Phase 3: 处理内容节点 ──
  for (const doc of data.docs) {
    if (processed.has(doc.id)) continue;

    const docType = doc.props._docType;

    // 跳过内部类型
    if (docType && SKIP_DOC_TYPES.has(docType)) { stats.skipped++; continue; }
    if (docType === 'attrDef' || docType === 'tagDef') { stats.skipped++; continue; }
    // tuple：只跳过未被内联处理的（Phase 3 中遇到说明不是字段实例）
    if (docType === 'tuple') { stats.skipped++; continue; }
    // 跳过 Trash 内容
    if (doc.props._ownerId?.endsWith('_TRASH')) { stats.skipped++; continue; }
    // 跳过工作区系统节点（但保留 journal 及其内容）
    if (doc.id.startsWith('SYS_') && docType !== 'journal' && docType !== 'journalPart') {
      stats.skipped++; continue;
    }
    // 跳过工作区根节点本身
    if (doc.id === wsId) { stats.skipped++; continue; }
    // 跳过工作区系统容器（_STASH, _MOVETO, _CHATDRAFTS 等）
    if (doc.id.startsWith(wsId + '_')) { stats.skipped++; continue; }

    // journal 根节点 → 不创建新节点（已映射到 JOURNAL）
    if (docType === 'journal') { stats.skipped++; continue; }

    // 确定父节点
    const rawOwnerId = doc.props._ownerId;
    if (!rawOwnerId) { stats.skipped++; continue; } // 无父节点 → 跳过

    // 父节点不存在于导出数据中 → 跨工作区引用等，跳过
    const parentDoc = lookup.get(rawOwnerId);
    if (!parentDoc) { stats.skipped++; stats.missingRefs++; continue; }

    // 父节点是被跳过的 tuple → 向上追溯
    let parentId = remap(rawOwnerId);
    if (parentDoc.props._docType === 'tuple') {
      // 向上追溯 tuple 链直到找到非 tuple 父节点
      let cur: TanaDoc | undefined = parentDoc;
      while (cur && cur.props._docType === 'tuple') {
        cur = cur.props._ownerId ? lookup.get(cur.props._ownerId) : undefined;
      }
      if (!cur) { stats.skipped++; continue; }
      parentId = remap(cur.id);
    }

    // 父节点是被跳过的系统容器 → 跳过此节点
    if (parentDoc.id.startsWith(wsId + '_') && parentId !== 'SCHEMA' && parentId !== 'TRASH' && parentId !== 'JOURNAL') {
      stats.skipped++; continue;
    }

    // 节点类型
    let type: NodeType | undefined;
    if (docType === 'codeblock') { type = 'codeBlock'; stats.codeBlocks++; }
    if (docType === 'url') type = undefined; // URL 当普通节点

    // 提取元数据
    const meta = metaMap.get(doc.id) ?? { tags: [] };

    // 处理 children：tuple → fieldEntry，其余保留
    const newChildren: string[] = [];

    for (const childId of doc.children ?? []) {
      const child = lookup.get(childId);
      if (!child) { stats.missingRefs++; continue; }

      if (child.props._docType === 'tuple') {
        // 尝试转换为 fieldEntry
        const gc = child.children ?? [];
        if (gc.length < 1) continue;

        const fieldKey = gc[0];
        const valueIds = gc.slice(1);
        const mappedFieldId = remap(fieldKey);

        // 判断是否为已知字段实例（fieldDef 必须存在于白名单中）
        const isField = knownFieldIds.has(mappedFieldId);

        if (isField) {
          const entryId = remap(childId);
          const resolvedValueIds = valueIds.map(remap);

          const fieldEntry: NodexNode = {
            id: entryId,
            type: 'fieldEntry',
            fieldDefId: mappedFieldId,
            children: resolvedValueIds,
            tags: [],
            createdAt: child.props.created,
            updatedAt: getUpdatedAt(child),
          };
          output.push({ node: fieldEntry, parentId: remap(doc.id) });
          newChildren.push(entryId);
          stats.fieldEntries++;
          processed.add(childId);

          // 创建值节点
          // 只创建"纯值"节点（_ownerId 是本 tuple 的叶子节点）。
          // 如果值节点有自己的子树（children），则它是被引用的内容节点，
          // 不在此处创建——让 Phase 3 正常处理，fieldEntry.children 保留引用。
          for (const vid of valueIds) {
            if (processed.has(vid)) continue;
            const valDoc = lookup.get(vid);
            if (!valDoc) { stats.missingRefs++; continue; }

            const isLeafValue = (valDoc.children ?? []).length === 0;
            if (isLeafValue) {
              const valNode: NodexNode = {
                id: remap(vid),
                name: valDoc.props.name,
                children: [],
                tags: [],
                createdAt: valDoc.props.created,
                updatedAt: getUpdatedAt(valDoc),
              };
              output.push({ node: valNode, parentId: entryId });
              processed.add(vid);
            }
            // 有子树的值节点不标记 processed，让 Phase 3 处理
          }
        } else {
          // 非字段 tuple，保留原 ID
          newChildren.push(remap(childId));
        }
      } else {
        newChildren.push(remap(childId));
      }
    }

    const node: NodexNode = {
      id: remap(doc.id),
      type,
      name: doc.props.name,
      description: doc.props.description,
      children: newChildren,
      tags: meta.tags.filter(t => knownTagIds.has(t)),
      createdAt: doc.props.created,
      updatedAt: getUpdatedAt(doc),
      completedAt: doc.props._done,
      publishedAt: doc.props._published,
      flags: doc.props._flags,
      templateId: doc.props._sourceId ? remap(doc.props._sourceId) : undefined,
      imageWidth: doc.props._imageWidth,
      imageHeight: doc.props._imageHeight,
    };

    output.push({ node, parentId });
    processed.add(doc.id);
    stats.contentNodes++;
  }

  return { nodes: output, stats, warnings };
}

// ============================================================
// 输出验证（闭环引用完整性检查）
// ============================================================

export interface ValidationIssue {
  nodeId: string;
  type: 'missing_parent' | 'missing_tag' | 'missing_field_def';
  refId: string;
}

/**
 * 验证 TransformResult 的引用完整性。
 * 在写入 LoroDoc 前调用，确保所有引用的目标 ID 都存在于输出集或系统预置集中。
 *
 * @param systemIds 系统预置的 ID 集合（soma bootstrap 会创建的节点/标签/字段）
 */
export function validateTransformResult(
  result: TransformResult,
  systemIds: {
    nodeIds?: Set<string>;
    tagIds?: Set<string>;
    fieldIds?: Set<string>;
  } = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const outputIds = new Set(result.nodes.map(n => n.node.id));
  const allNodeIds = new Set([...outputIds, ...(systemIds.nodeIds ?? []), 'ROOT', 'SCHEMA', 'TRASH', 'JOURNAL']);
  const allTagIds = new Set([...outputIds, ...(systemIds.tagIds ?? [])]);
  const allFieldIds = new Set([...outputIds, ...(systemIds.fieldIds ?? [])]);

  for (const { node, parentId } of result.nodes) {
    // 检查 parentId
    if (!allNodeIds.has(parentId)) {
      issues.push({ nodeId: node.id, type: 'missing_parent', refId: parentId });
    }
    // 检查 tags
    for (const tagId of node.tags) {
      if (!allTagIds.has(tagId)) {
        issues.push({ nodeId: node.id, type: 'missing_tag', refId: tagId });
      }
    }
    // 检查 fieldDefId
    if (node.fieldDefId && !allFieldIds.has(node.fieldDefId)) {
      issues.push({ nodeId: node.id, type: 'missing_field_def', refId: node.fieldDefId });
    }
  }

  return issues;
}

// ============================================================
// Legacy 存根（保持向后兼容）
// ============================================================

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

export interface ValidationResult {
  totalDocs: number;
  missingChildRefs: { docId: string; refId: string }[];
  missingOwnerRefs: { docId: string; refId: string }[];
  missingMetaNodeRefs: { docId: string; refId: string }[];
  missingAssociationRefs: { docId: string; refId: string }[];
  docTypeDistribution: Map<string, number>;
}

export async function importTanaExport(
  data: TanaExportData,
  _userId: string,
): Promise<ImportResult> {
  const result = transformTanaExport(data);
  return {
    totalDocs: data.docs.length,
    importedNodes: result.nodes.length,
    skippedNodes: result.stats.skipped,
    errors: [],
    workspaceId: data.currentWorkspaceId,
    editorCount: data.editors.length,
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

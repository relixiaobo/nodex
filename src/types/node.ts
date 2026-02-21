/**
 * Nodex 核心节点类型定义 — Loro 迁移后新版本
 *
 * 核心变化：
 * - 消除 props 包装层（所有属性直接在 NodexNode 顶层）
 * - 消除 meta Tuple 间接层（tags 直接是 string[]）
 * - 消除 workspaceId per-node（一个 LoroDoc = 一个工作区）
 * - 消除 version / createdBy / updatedBy（Loro 版本向量 + Phase 2 PeerID）
 * - DocType → NodeType（'tuple'→'fieldEntry'，'attrDef'→'fieldDef'，新增'reference'）
 */

// ============================================================
// NodeType 枚举
// ============================================================

/**
 * 节点类型枚举。
 * 无 type 的节点为普通用户内容节点。
 */
/**
 * 节点类型枚举。
 *
 * 仅包含「结构类型」——数据模型或渲染逻辑与普通内容节点有本质差异、
 * 无法用 supertag 替代的类型。
 *
 * 「语义类型」（webClip / journal day / url 等）应通过 supertag 表达，
 * 不在此枚举中定义，符合「一切皆节点」原则。
 *
 * undefined = 普通内容节点（占绝大多数）
 */
export type NodeType =
  // ── 核心结构类型 ──
  | 'fieldEntry'   // 字段实例：children = 值节点列表，fieldDefId 指向定义
  | 'reference'    // 引用节点：targetId 指向被引用节点（LoroTree 单亲约束）

  // ── 定义类型（Schema 层）──
  | 'tagDef'       // Supertag 定义
  | 'fieldDef'     // 字段定义

  // ── 查询与视图 ──
  | 'viewDef'      // 视图配置节点（P3）
  | 'search';      // Live Search / 动态查询节点（P3）

/**
 * 视图模式枚举。
 */
export type ViewMode =
  | 'list'            // 大纲/层级（默认）
  | 'table'           // 表格，字段为列
  | 'tiles'           // 瓦片布局
  | 'cards'           // 卡片布局
  | 'navigationList'; // 简单列表导航

// ============================================================
// 富文本类型（Phase 2 升级为 LoroText，Phase 1 沿用）
// ============================================================

/**
 * 文本格式标记。
 * 偏移区间遵循 [start, end)。
 */
export interface TextMark {
  start: number;
  end: number;
  type: 'bold' | 'italic' | 'strike' | 'code' | 'highlight' | 'headingMark' | 'link';
  attrs?: Record<string, string>;
}

/**
 * 行内引用条目。
 * offset 指向 name 中的 '\uFFFC' 占位符位置。
 */
export interface InlineRefEntry {
  offset: number;
  targetNodeId: string;
  displayName?: string;
}

// ============================================================
// DoneState Mapping（存储在 tagDef 节点的 LoroList 中）
// ============================================================

export interface DoneMappingEntry {
  fieldDefId: string;
  optionId: string;
}

// ============================================================
// 核心节点类型（扁平化，无 props 包装层）
// ============================================================

/**
 * Nodex 核心节点 —— "一切皆节点"。
 *
 * 与旧接口相比：
 * - 扁平化：消除 props 包装层
 * - 去 _ 前缀：所有属性直接命名
 * - 消除间接层：meta Tuple → 直接 tags 属性
 * - 语义化：_done → completedAt, _sourceId → templateId
 * - 消除：workspaceId, version, createdBy, updatedBy, meta, touchCounts, modifiedTs
 */
export interface NodexNode {
  /** 全局唯一标识符 (nanoid 21 字符 或 系统固定 ID) */
  id: string;

  // ─── 核心属性 ───

  /** 节点类型。无此字段 = 普通内容节点 */
  type?: NodeType;

  /** 节点名称/内容（纯文本，\uFFFC 为内联引用占位符） */
  name?: string;

  /** 辅助描述文本 */
  description?: string;

  // ─── 关系（均从 LoroTree 衍生） ───

  /** 有序子节点 ID 列表（LoroTree children 衍生） */
  children: string[];

  /** 已应用的标签定义 ID 列表（替代 meta→TagTuple 链） */
  tags: string[];

  // ─── 时间戳（统一 *At 后缀） ───

  /** 创建时间 (ms) */
  createdAt: number;

  /** 最后修改时间 (ms) */
  updatedAt: number;

  /** 完成时间 (ms)。null/undefined = 未完成（旧 props._done） */
  completedAt?: number;

  /** 发布时间 (ms)（旧 props._published） */
  publishedAt?: number;

  // ─── 富文本（Phase 2 → LoroText 替代） ───

  /** 文本格式标记（旧 props._marks） */
  marks?: TextMark[];

  /** 行内引用（旧 props._inlineRefs） */
  inlineRefs?: InlineRefEntry[];

  // ─── 通用属性 ───

  /** 模板来源 ID（旧 props._sourceId） */
  templateId?: string;

  /** 视图模式（旧 props._view） */
  viewMode?: ViewMode;

  /** 编辑模式（旧 props._editMode） */
  editMode?: boolean;

  /** 位标志（旧 props._flags） */
  flags?: number;

  /** 图片宽度 (px)（旧 props._imageWidth） */
  imageWidth?: number;

  /** 图片高度 (px)（旧 props._imageHeight） */
  imageHeight?: number;

  /** 搜索上下文节点 ID（旧 props.searchContextNode） */
  searchContext?: string;

  // ─── Nodex 扩展 ───

  /** AI 生成摘要 */
  aiSummary?: string;

  /** 来源 URL（网页剪藏） */
  sourceUrl?: string;

  // ─── Reference 专用 ───

  /** 引用目标节点 ID（仅 type='reference' 时有值） */
  targetId?: string;

  // ─── fieldEntry 专用 ───

  /** 字段定义 ID（仅 type='fieldEntry' 时有值，旧 Tuple.children[0]） */
  fieldDefId?: string;

  // ─── tagDef 专用（直接属性，旧为 config Tuple 间接存储） ───

  /** 是否显示 checkbox（旧 [SYS_A55, SYS_V03] config tuple） */
  showCheckbox?: boolean;

  /** 默认子标签 ID（旧 [SYS_A14, tagDefId] config tuple） */
  childSupertag?: string;

  /** 节点颜色（旧 [SYS_A11, value] config tuple） */
  color?: string;

  /** 继承自的父标签 ID（旧 NDX_A05 config tuple） */
  extends?: string;

  /** Done-State Mapping 开关（旧 NDX_A06 config tuple） */
  doneStateEnabled?: boolean;

  // ─── fieldDef 专用（直接属性，旧为 config Tuple 间接存储） ───

  /** 字段数据类型（旧 [SYS_A02, SYS_D*]，现用可读字符串） */
  fieldType?: string;

  /** 基数：'single' | 'list'（旧 [SYS_A10, SYS_V01/02]） */
  cardinality?: 'single' | 'list';

  /** 可为空（旧 [SYS_A01, SYS_V03/04]） */
  nullable?: boolean;

  /** 隐藏字段条件（旧 NDX_A01） */
  hideField?: string;

  /** 自动初始化（旧 NDX_A03） */
  autoInitialize?: boolean;

  /** 自动收集选项（旧 SYS_A44） */
  autocollectOptions?: boolean;

  /** Number 最小值（旧 NDX_A03） */
  minValue?: number;

  /** Number 最大值（旧 NDX_A04） */
  maxValue?: number;

  /** Options from supertag 来源标签 ID（旧 SYS_A06） */
  sourceSupertag?: string;
}

// ============================================================
// 工作区容器（固定 ID，无 workspaceId 前缀）
// ============================================================

/** 工作区容器专用 ID。 */
export const CONTAINER_IDS = {
  LIBRARY: 'LIBRARY',
  INBOX: 'INBOX',
  JOURNAL: 'JOURNAL',
  SEARCHES: 'SEARCHES',
  TRASH: 'TRASH',
  SCHEMA: 'SCHEMA',
  CLIPS: 'CLIPS',
  STASH: 'STASH',
} as const;

export type ContainerId = typeof CONTAINER_IDS[keyof typeof CONTAINER_IDS];

/**
 * 获取容器 ID（新版：直接返回固定常量，无需 workspaceId 参数）
 */
export function getContainerId(containerId: ContainerId): string {
  return containerId;
}

/**
 * 判断一个节点 ID 是否是工作区容器
 */
export function isContainerNode(nodeId: string): boolean {
  return Object.values(CONTAINER_IDS).includes(nodeId as ContainerId);
}

// ============================================================
// 编辑者信息（保留类型，实际数据 Phase 2 用 Loro PeerID 替代）
// ============================================================

export interface Editor {
  identifier: string;
  index: number;
}

// ============================================================
// 辅助输入类型（适配新 NodexNode 接口）
// ============================================================

/**
 * 节点创建参数。
 */
export type CreateNodeInput = {
  id?: string;
  parentId: string;
  index?: number;
  data?: Partial<Omit<NodexNode, 'id' | 'children' | 'tags' | 'createdAt' | 'updatedAt'>>;
};

/**
 * 节点更新参数。
 */
export type UpdateNodeInput = Partial<Omit<NodexNode, 'id' | 'children' | 'tags' | 'createdAt'>>;

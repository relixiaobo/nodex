/**
 * soma 核心节点类型定义 — Loro 迁移后新版本
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
  | 'codeBlock'    // 代码块节点：name 保存代码正文，codeLanguage 可选语言标记
  | 'image'        // 图片节点：mediaUrl = 图片 URL
  | 'embed'        // 嵌入节点：embedType + embedId（如 YouTube 视频）

  // ── 定义类型（Schema 层）──
  | 'tagDef'       // Supertag 定义
  | 'fieldDef'     // 字段定义

  // ── 查询与视图 ──
  | 'viewDef'          // 视图配置节点（P3）
  | 'search'           // Live Search / 动态查询节点
  | 'queryCondition';  // 查询条件节点（search node 子节点）

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
// QueryOp — 搜索条件操作符（上线后只加不改）
// ============================================================

/**
 * 查询条件操作符。
 *
 * 持久化为字符串存储在 Loro 中，上线后只加不改（rename 需迁移）。
 * 未实现的操作符在搜索引擎中必须显式返回 "not supported"，禁止静默忽略。
 *
 * @see docs/plans/search-node-design.md § 2.3
 */
export type QueryOp =
  // Phase 1: Tag + Checkbox
  | 'HAS_TAG'
  | 'TODO'               // 有 checkbox（无论勾选与否）
  | 'DONE'               // completedAt != null
  | 'NOT_DONE'           // showCheckbox && !completedAt

  // Phase 2: Field conditions
  | 'FIELD_IS'           // 字段值匹配任一条件值（多子节点 = OR）
  | 'FIELD_IS_NOT'       // 字段值不匹配所有条件值
  | 'IS_EMPTY'           // 字段无值（= Not Set）
  | 'IS_NOT_EMPTY'       // 字段有值（= Set）
  | 'FIELD_CONTAINS'     // 文本子串匹配（第一个子节点 name 为搜索词）
  | 'LT'                 // 小于（数字/日期）
  | 'GT'                 // 大于（数字/日期）

  // Phase 2: Time conditions
  | 'CREATED_LAST_DAYS'  // createdAt 在 N 天内
  | 'EDITED_LAST_DAYS'   // updatedAt 在 N 天内
  | 'DONE_LAST_DAYS'     // completedAt 在 N 天内

  // Phase 2: Content & Relationship
  | 'HAS_FIELD'          // 含有任意字段
  | 'LINKS_TO'           // 有 inline ref 或 tree ref 指向目标节点
  | 'STRING_MATCH'       // 节点名称文本匹配
  | 'REGEXP_MATCH'       // 节点名称正则匹配

  // Phase 3: Relationships & Type
  | 'CHILD_OF'           // 指定节点的直接子节点
  | 'IS_TYPE'            // 节点类型检查（tagDef, fieldDef, search 等）
  | 'FOR_DATE'           // 含有指向特定日期节点的引用
  | 'FOR_RELATIVE_DATE'  // 含有相对日期引用（today, yesterday, next week 等）

  // Phase 3: Scope
  | 'PARENTS_DESCENDANTS'     // 搜索节点父节点的所有后代
  | 'IN_LIBRARY'              // Library 容器的直接子节点
  | 'ON_DAY_NODE'             // 日历日节点的直接子节点

  // Future（依赖未实现的功能）
  | 'EDITED_BY'          // 依赖 Sync Phase 2 Loro PeerID → userId 映射
  | 'OWNED_BY'           // 依赖 ownerId 概念恢复（当前已消除）
  | 'OVERDUE'            // !completedAt && dueDate < today
  | 'HAS_MEDIA';         // 依赖媒体功能

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
 * soma 核心节点 —— "一切皆节点"。
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

  /** 媒体 URL（图片 src 或 embed URL） */
  mediaUrl?: string;

  /** 图片 alt 文本 */
  mediaAlt?: string;

  /** 嵌入类型（'youtube' | 'twitter' 等） */
  embedType?: string;

  /** 嵌入 ID（视频 ID / 推文 ID 等） */
  embedId?: string;

  /** 搜索上下文节点 ID（旧 props.searchContextNode） */
  searchContext?: string;

  // ─── soma 扩展 ───

  /** AI 生成摘要 */
  aiSummary?: string;

  /** 来源 URL（网页剪藏） */
  sourceUrl?: string;

  // ─── codeBlock 专用 ───

  /** 代码块语言（如：ts、python、css） */
  codeLanguage?: string;

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

  /** 自动初始化策略（逗号分隔，如 "current_date,ancestor_field_value"） */
  autoInitialize?: string;

  /** 自动收集选项（旧 SYS_A44） */
  autocollectOptions?: boolean;

  /** 标记为自动收集的选项节点（由 autoCollectOption 创建，区别于预设选项） */
  autoCollected?: boolean;

  /** Number 最小值（旧 NDX_A03） */
  minValue?: number;

  /** Number 最大值（旧 NDX_A04） */
  maxValue?: number;

  /** Options from supertag 来源标签 ID（旧 SYS_A06） */
  sourceSupertag?: string;

  // ─── queryCondition 专用 ───

  /** 查询逻辑类型（仅 group 节点，与 queryOp 互斥） */
  queryLogic?: 'AND' | 'OR' | 'NOT';

  /** 查询操作符（仅 leaf 节点，与 queryLogic 互斥） */
  queryOp?: QueryOp;

  /** HAS_TAG 条件的目标标签定义 ID */
  queryTagDefId?: string;

  /** 字段条件指向的 fieldDef 节点 ID */
  queryFieldDefId?: string;

  // ─── search 专用 ───

  /** search node 上次执行完整 diff 的时间戳 (ms) */
  lastRefreshedAt?: number;
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
  SETTINGS: 'SETTINGS',
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

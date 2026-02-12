/**
 * Nodex 核心节点类型定义
 *
 * 忠实复制 Tana 的 "Everything is a Node" 数据模型。
 * 所有实体（内容、标签定义、字段定义、搜索、视图、Tuple、Metanode、AssociatedData）
 * 共享同一 Node 结构，通过 docType 区分。
 *
 * 参考：research/tana-data-model-specification.md
 */

// ============================================================
// DocType 枚举
// ============================================================

/**
 * 文档类型枚举。
 * 忠实保留 Tana 全部 22 种类型 + Nodex 新增类型。
 * 无 docType 的节点为普通用户内容节点（Tana 中占 46.6%）。
 */
export type DocType =
  // ── 核心结构类型（Tana 间接层，忠实保留）──
  | 'tuple'           // 万能键值对容器 (Tana 29.3%)
  | 'metanode'        // 元信息代理节点 (Tana 13.5%)
  | 'associatedData'  // 字段值索引数据 (Tana 6.3%)

  // ── 定义类型 ──
  | 'tagDef'          // 超级标签定义
  | 'attrDef'         // 字段/属性定义
  | 'viewDef'         // 视图定义

  // ── 内容类型 ──
  | 'codeblock'       // 代码块
  | 'visual'          // 图片/视觉内容
  | 'url'             // URL 链接
  | 'chat'            // 聊天对话

  // ── 日志类型 ──
  | 'journal'         // 日志根容器 (Calendar)
  | 'journalPart'     // 日志分区 (年/周/日)

  // ── 搜索与查询 ──
  | 'search'          // Live Search / 动态查询

  // ── 系统/工具类型 ──
  | 'command'         // 系统命令
  | 'systemTool'      // 系统工具
  | 'chatbot'         // 聊天机器人定义
  | 'syntax'          // 语法定义
  | 'placeholder'     // 占位符

  // ── 工作区类型 ──
  | 'workspace'       // 工作区/布局节点
  | 'home'            // 主页根节点
  | 'settings'        // 设置容器

  // ── Nodex 新增 ──
  | 'webClip';        // 网页剪藏

/**
 * 视图模式枚举。
 * 对应 Tana 的 _view 属性值。
 */
export type ViewMode =
  | 'list'            // 大纲/层级（默认）
  | 'table'           // 表格，字段为列
  | 'tiles'           // 瓦片布局
  | 'cards'           // 卡片布局
  | 'navigationList'; // 简单列表导航

// ============================================================
// 节点属性（Props）
// ============================================================

/**
 * 节点属性接口。
 * 忠实复制 Tana Node 的 props 结构。
 */
export interface NodeProps {
  /** 创建时间戳（毫秒，JavaScript epoch）—— 所有节点必有 */
  created: number;

  /** 节点名称/内容。支持 HTML 富文本编码。
   *  富文本格式：<strong>, <code>, <mark>, <em>, <strike>, <a href>
   *  内联引用：<span data-inlineref-node="nodeId"></span>
   *  内联日期：<span data-inlineref-date='{"dateTimeString":"...","timezone":"..."}'></span>
   *  Wiki 引用：[[节点名^nodeId]] */
  name?: string;

  /** 节点描述。辅助文本，UI 显示为灰色小字 */
  description?: string;

  // ─── 类型与所有权 ───

  /** 文档类型标识。22+1 种枚举值。无此字段表示普通内容节点 */
  _docType?: DocType;

  /** 父/所有者节点 ID。每个节点恰好一个 Owner。
   *  特殊值: "{wsId}_TRASH"(回收站), "{wsId}_SCHEMA"(架构), "SYS_0"(系统根) */
  _ownerId?: string;

  /** 关联元节点 ID。Metanode 存储标签、锁定状态等元信息。
   *  Metanode 的 children 全部是 Tuple，每个 Tuple 承载一条元信息。
   *  ContentNode._metaNodeId → Metanode
   *  Metanode._ownerId → ContentNode （双向链接） */
  _metaNodeId?: string;

  /** 模板来源 ID。从 TagDef 模板实例化时，指向原始模板 Tuple。
   *  用于追踪字段 Tuple 的来源定义。 */
  _sourceId?: string;

  // ─── 状态标记 ───

  /** 位标志。1=基础标记, 2=次要, 64=特殊, 65=组合 */
  _flags?: number;

  /** 完成时间戳（毫秒）。非布尔值，记录 checkbox 勾选的精确时刻。
   *  null/undefined = 未完成 */
  _done?: number;

  // ─── 视觉/媒体 ───

  /** 图片宽度（像素） */
  _imageWidth?: number;
  /** 图片高度（像素） */
  _imageHeight?: number;

  /** 视图模式 */
  _view?: ViewMode;

  /** 发布时间戳 */
  _published?: number;

  /** 编辑模式标志 */
  _editMode?: boolean;

  /** 搜索上下文节点 */
  searchContextNode?: string;
}

// ============================================================
// 核心节点类型
// ============================================================

/**
 * Nodex 核心节点 —— "一切皆节点"。
 *
 * 忠实复制 Tana 的 Node 结构，包括：
 * - Tuple 万能键值对 (children[0]=key, children[1:]=values)
 * - Metanode 元信息代理 (通过 _metaNodeId 链接)
 * - AssociatedData 字段值索引 (通过 associationMap 映射)
 *
 * Nodex 扩展字段：workspaceId, aiSummary, sourceUrl, version, updatedAt, createdBy, updatedBy
 */
export interface NodexNode {
  /** 全局唯一标识符。
   *  用户节点：nanoid 生成（21 字符，URL-safe base64）
   *  系统节点：以 "SYS_" 前缀（如 SYS_A13, SYS_D06, SYS_V03） */
  id: string;

  /** 节点属性 */
  props: NodeProps;

  // ─── 关系与数据 ───

  /** 子节点 ID 有序列表。决定 UI 中的渲染顺序。
   *
   *  对于 Tuple (docType='tuple'):
   *    children[0] = 键 (SYS_A* 系统属性 ID 或 attrDef 字段定义 ID)
   *    children[1:] = 值 (节点 ID 或 SYS_V* 枚举值 ID)
   *
   *  对于 Metanode (docType='metanode'):
   *    children = [tupleId1, tupleId2, ...] 全部是 Tuple 子节点
   *
   *  对于普通内容节点:
   *    children = [childId1, childId2, ...] 混合内容子节点和字段 Tuple */
  children?: string[];

  /** 字段值关联映射。key=子节点ID（字段 Tuple）, value=associatedData 节点 ID。
   *  提供字段值的快速索引查找。
   *
   *  关键发现：Tana 中 2,605/2,606 的 associationMap 值指向 associatedData 类型节点。 */
  associationMap?: Record<string, string>;

  /** 各编辑者的访问/编辑计数。索引对应全局 editors 数组 */
  touchCounts?: number[];

  /** 各编辑者的最后修改时间戳。索引对应全局 editors 数组。0=未修改 */
  modifiedTs?: number[];

  // ─── Nodex 扩展字段 ───

  /** 工作区 ID。
   *  Tana 通过 _ownerId 链向上追溯推导工作区归属。
   *  Nodex 直接存储以提升查询效率（PostgreSQL WHERE 子句）。 */
  workspaceId: string;

  /** AI 生成的摘要。用于搜索预览和语义理解。 */
  aiSummary?: string;

  /** 来源 URL。网页剪藏时记录原始页面地址。Nodex 特有功能。 */
  sourceUrl?: string;

  /** 乐观锁版本号。每次更新 +1，用于冲突检测。 */
  version: number;

  /** 最后修改时间戳（毫秒）。系统自动维护。 */
  updatedAt: number;

  /** 创建者用户 ID */
  createdBy: string;

  /** 最后修改者用户 ID */
  updatedBy: string;
}

// ============================================================
// 工作区容器命名约定
// ============================================================

/**
 * 工作区系统容器后缀。
 * 容器节点 ID 格式："{workspaceId}_{suffix}"
 *
 * 示例：工作区 "ws_001" 的 Schema 容器 ID = "ws_001_SCHEMA"
 */
export const WORKSPACE_CONTAINERS = {
  SCHEMA: 'SCHEMA',             // 标签/字段定义
  LIBRARY: 'LIBRARY',           // 用户内容根（Tana 中为特定 nodeId）
  INBOX: 'INBOX',               // 快速收集（对应 Tana CAPTURE_INBOX）
  JOURNAL: 'JOURNAL',           // 日志/日记
  SEARCHES: 'SEARCHES',         // 保存的搜索
  TRASH: 'TRASH',               // 回收站
  WORKSPACE: 'WORKSPACE',       // 工作区布局配置
  CLIPS: 'CLIPS',               // 网页剪藏（Nodex 新增）
  STASH: 'STASH',               // 暂存区
  SIDEBAR_AREAS: 'SIDEBAR_AREAS',
  PINS: 'PINS',                 // 固定节点
  QUICK_ADD: 'QUICK_ADD',       // 快速添加配置
  USERS: 'USERS',               // 用户列表
} as const;

export type WorkspaceContainerSuffix = typeof WORKSPACE_CONTAINERS[keyof typeof WORKSPACE_CONTAINERS];

/**
 * 生成工作区容器节点 ID
 */
export function getContainerId(workspaceId: string, suffix: WorkspaceContainerSuffix): string {
  return `${workspaceId}_${suffix}`;
}

/**
 * 判断一个节点是否是 workspace root 节点。
 * workspace root 的 ID 等于 workspaceId 本身。
 */
export function isWorkspaceRoot(nodeId: string, workspaceId: string): boolean {
  return nodeId === workspaceId;
}

// ============================================================
// 编辑者信息
// ============================================================

/**
 * 全局编辑者列表。
 * Tana 中存储在导出 JSON 的顶层 editors 字段。
 * touchCounts 和 modifiedTs 的数组索引对应 editors 数组索引。
 */
export interface Editor {
  /** 编辑者标识（邮箱或系统标识） */
  identifier: string;
  /** 在 touchCounts/modifiedTs 数组中的索引 */
  index: number;
}

// ============================================================
// 辅助类型
// ============================================================

/**
 * 节点创建参数。只需提供必要字段。
 */
export type CreateNodeInput = {
  id?: string;
  workspaceId: string;
  props: Partial<NodeProps> & { _docType?: DocType; _ownerId?: string };
  children?: string[];
};

/**
 * 节点更新参数。所有字段可选。props 中所有字段也为可选。
 */
export type UpdateNodeInput = Omit<Partial<NodexNode>, 'id' | 'createdBy' | 'props'> & {
  props?: Partial<NodeProps>;
};

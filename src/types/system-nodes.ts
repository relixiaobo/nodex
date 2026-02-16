/**
 * Tana 系统节点常量定义
 *
 * 忠实复制 Tana 的 SYS_A*（系统属性）、SYS_D*（数据类型）、
 * SYS_V*（枚举值）、SYS_T*（系统标签）完整目录。
 *
 * 数据来源：research/tana-json-analysis-report.md + tana-data-model-specification.md
 */

// ============================================================
// 系统根节点
// ============================================================

export const SYS_ROOT = 'SYS_0';           // 系统节点根
export const SYS_ENUMS_ROOT = 'SYS_V00';   // 系统枚举根

// ============================================================
// SYS_A* —— 系统属性（Tuple 的 children[0] 键值）
// ============================================================

/**
 * 系统属性 ID 常量。
 * 在 Tuple 的 children[0] 位置作为键使用。
 *
 * 用途分类：
 * - 元信息属性（在 Metanode 的 Tuple 中使用）
 * - 字段配置属性（在 AttrDef 的 Tuple 中使用）
 * - 搜索/视图配置属性
 * - 代码块/URL/特殊节点属性
 */
export const SYS_A = {
  // ─── 字段配置属性 ───
  /** 可为空 (Nullable) */
  NULLABLE: 'SYS_A01',
  /** 数据类型选择 (typeChoice) → 值为 SYS_D* */
  TYPE_CHOICE: 'SYS_A02',
  /** 值选项 (Values) */
  VALUES: 'SYS_A03',
  /** 选项来源标签 (Source supertag) → Options from supertag */
  SOURCE_SUPERTAG: 'SYS_A06',
  /** 反向引用字段 (Backreference) */
  BACKREFERENCE: 'SYS_A08',
  /** 基数 (Cardinality) → SYS_V01(单值) / SYS_V02(多值) */
  CARDINALITY: 'SYS_A10',

  // ─── 节点元信息属性（在 Metanode Tuple 中使用）───
  /** 节点颜色 */
  COLOR: 'SYS_A11',
  /** 锁定状态 → SYS_V03(Yes) / SYS_V04(No) */
  LOCKED: 'SYS_A12',
  /** 节点超级标签 (Node supertags) → 值为 tagDef ID —— 最核心的属性 */
  NODE_SUPERTAGS: 'SYS_A13',
  /** 子节点默认标签 (Child supertag) */
  CHILD_SUPERTAG: 'SYS_A14',
  /** 搜索表达式 (Search expression) */
  SEARCH_EXPRESSION: 'SYS_A15',
  /** 视图配置 (Views for node) → 值为 viewDef ID */
  VIEWS: 'SYS_A16',

  // ─── 视图配置属性 ───
  /** 列定义 */
  COLUMN_DEFS: 'SYS_A17',
  /** 过滤表达式 */
  FILTER_EXPRESSIONS: 'SYS_A18',
  /** 排序定义 */
  SORT_ORDER: 'SYS_A19',
  /** 排序字段 */
  SORT_FIELD: 'SYS_A20',

  // ─── 内容属性 ───
  /** 节点名称 */
  NODE_NAME: 'SYS_A21',
  /** 节点描述 */
  NODE_DESCRIPTION: 'SYS_A22',
  /** 标题表达式 */
  TITLE_EXPRESSION: 'SYS_A23',
  /** 侧注 */
  SIDE_NOTE: 'SYS_A24',
  /** 横幅图片 */
  BANNER_IMAGE: 'SYS_A25',
  /** 公式 */
  FORMULA: 'SYS_A26',
  /** 聊天相关配置 */
  CHAT_CONFIG: 'SYS_A27',
  /** 已读游标 */
  READ_CURSOR: 'SYS_A31',
  /** 选项搜索 */
  OPTION_SEARCH: 'SYS_A38',
  /** 自动收集选项 */
  AUTOCOLLECT_OPTIONS: 'SYS_A44',
  /** 目标节点 */
  TARGET_NODES: 'SYS_A47',

  // ─── 状态属性 ───
  /** 显示复选框 (Show done/not done) → SYS_V03(Yes) */
  SHOW_CHECKBOX: 'SYS_A55',
  /** 字段默认值 */
  FIELD_DEFAULTS: 'SYS_A62',

  // ─── 代码块/URL/特殊属性 ───
  /** 代码块语言 → 值为语言节点 ID */
  CODE_LANGUAGE: 'SYS_A70',
  /** 外部节点别名 (Alias for external node only) */
  EXTERNAL_ALIAS: 'SYS_A75',
  /** URL 地址 */
  URL: 'SYS_A78',
  /** 合并到 */
  MERGED_INTO: 'SYS_A84',
  /** 聊天机器人配置 */
  CHATBOT_CONFIG: 'SYS_A89',
  /** 日期字段 */
  DATE: 'SYS_A90',

  // ─── 发布属性 ───
  /** 节点是否已发布 */
  NODE_PUBLISHED: 'SYS_A100',
  /** 发布设置 */
  PUBLISH_SETTINGS: 'SYS_A105',

  // ─── 标签配置属性 ───
  /** 字段建议 */
  FIELD_SUGGESTIONS: 'SYS_A121',
  /** 影子标签节点 */
  SHADOW_TAG_NODES: 'SYS_A129',
  /** 标签建议 */
  TAG_SUGGESTIONS: 'SYS_A130',
  /** 路径 */
  PATH: 'SYS_A131',
  /** 内容配置 */
  CONTENT_CONFIG: 'SYS_A133',
  /** 表单 */
  FORM: 'SYS_A134',
  /** 原始音频 */
  ORIGINAL_AUDIO: 'SYS_A136',
  /** 聊天上下文 */
  CHAT_CONTEXT: 'SYS_A139',
  /** 字段是否提升 */
  IS_FIELD_HOISTED: 'SYS_A141',
  /** 参会人 */
  ATTENDEES: 'SYS_A142',
  /** 图标 */
  ICON: 'SYS_A143',
  /** 相关内容 */
  RELATED_CONTENT: 'SYS_A144',
  /** 标签搜索节点 */
  TAG_SEARCH_NODE: 'SYS_A146',
  /** Schema */
  SCHEMA: 'SYS_A148',

  // ─── 可选字段/模板属性 ───
  /** 可选字段 */
  OPTIONAL_FIELDS: 'SYS_A156',
  /** 字段待定区 */
  FIELD_NURSERY: 'SYS_A157',
  /** AI 指令 */
  AI_INSTRUCTIONS: 'SYS_A160',
  /** 日志日期 */
  JOURNAL_DATE: 'SYS_A169',

  // ─── 搜索/引用属性 ───
  /** 引用数量（原始值） */
  NUM_REFERENCES_RAW: 'SYS_A173',
  /** 侧边过滤器 */
  SIDE_FILTERS: 'SYS_A174',
  /** 命令（完整菜单） */
  COMMANDS_FULL_MENU: 'SYS_A175',
  /** AI payload */
  AI_PAYLOAD: 'SYS_A176',
  /** 超级标签实例是实体 */
  SUPERTAG_INSTANCES_ARE_ENTITIES: 'SYS_A179',
  /** 源材料 */
  SOURCE_MATERIAL: 'SYS_A199',
  /** 链接到 */
  LINKS_TO: 'SYS_A200',
  /** 链接路径 */
  LINKED_PATH: 'SYS_A201',
  /** 节点来源 */
  NODE_SOURCE: 'SYS_A202',
  /** 内联日期 */
  INLINE_DATE: 'SYS_A203',
  /** 内联节点 */
  INLINE_NODE: 'SYS_A204',
  /** 显示密度 */
  DISPLAY_DENSITY: 'SYS_A205',
  /** 草稿 */
  DRAFTS: 'SYS_A206',
  /** 模板已验证 */
  TEMPLATE_IS_VERIFIED: 'SYS_A207',
  /** 属性原型 */
  ATTRIBUTE_PROTOTYPE: 'SYS_A208',
  /** 指派给 */
  ASSIGNED_TO: 'SYS_A209',
  /** 标题样式 */
  HEADING_STYLE: 'SYS_A214',
  /** 引用搜索节点 */
  REFERENCE_SEARCH_NODE: 'SYS_A215',
  /** 别名标签名 */
  ALIAS_TAG_NAMES: 'SYS_A216',
  /** 从搜索和菜单中隐藏 */
  HIDE_FROM_SEARCHES: 'SYS_A250',
  /** 推广用途 */
  PROMOTE_FOR: 'SYS_A251',
  /** 发言者 */
  SPEAKER: 'SYS_A252',

  // ─── Nodex 自定义属性 ───
  /** [Nodex] 隐藏字段条件 → SYS_V54(Never) / SYS_V52(Always) / SYS_V56(WhenEmpty) / SYS_V57(WhenNotEmpty) / NDX_V01(WhenDefault) */
  HIDE_FIELD: 'NDX_A01',
  /** [Nodex] 自动初始化 → SYS_V03(Yes) / SYS_V04(No) — 从祖先节点继承同名字段值 */
  AUTO_INITIALIZE: 'NDX_A02',
  /** [Nodex] Number/Integer 最小值 → Tuple value = 数字字符串 */
  MIN_VALUE: 'NDX_A03',
  /** [Nodex] Number/Integer 最大值 → Tuple value = 数字字符串 */
  MAX_VALUE: 'NDX_A04',
  /** [Nodex] Extend parent tagDef → Tuple [NDX_A05, parentTagDefId] */
  EXTENDS: 'NDX_A05',
  /** [Nodex] Done state mapping toggle → Tuple [NDX_A06, SYS_V03(YES)/SYS_V04(NO)] */
  DONE_STATE_MAPPING: 'NDX_A06',
  /** [Nodex] Done map checked → Tuple [NDX_A07, attrDefId, optionId] (one per mapping) */
  DONE_MAP_CHECKED: 'NDX_A07',
  /** [Nodex] Done map unchecked → Tuple [NDX_A08, attrDefId, optionId] (one per mapping) */
  DONE_MAP_UNCHECKED: 'NDX_A08',
} as const;

export type SystemAttribute = typeof SYS_A[keyof typeof SYS_A];

// ============================================================
// SYS_D* —— 字段数据类型
// ============================================================

/**
 * 字段数据类型常量。
 * 在 AttrDef 的 Tuple [SYS_A02(typeChoice), SYS_D*] 中作为值使用。
 */
export const SYS_D = {
  /** 复选框 */
  CHECKBOX: 'SYS_D01',
  /** 整数 */
  INTEGER: 'SYS_D02',
  /** 日期 */
  DATE: 'SYS_D03',
  /** Options from supertag（来自特定标签实例的选项） */
  OPTIONS_FROM_SUPERTAG: 'SYS_D05',
  /** Plain（默认类型，最灵活） */
  PLAIN: 'SYS_D06',
  /** 公式 */
  FORMULA: 'SYS_D07',
  /** 数字 */
  NUMBER: 'SYS_D08',
  /** Tana 用户 */
  TANA_USER: 'SYS_D09',
  /** URL */
  URL: 'SYS_D10',
  /** 电子邮件 */
  EMAIL: 'SYS_D11',
  /** 选项 */
  OPTIONS: 'SYS_D12',
  /** 选项（别名） */
  OPTIONS_ALT: 'SYS_D13',
  /** 布尔值 (Yes/No toggle) — Nodex 扩展 */
  BOOLEAN: 'NDX_D01',
} as const;

export type SystemDataType = typeof SYS_D[keyof typeof SYS_D];

// ============================================================
// SYS_V* —— 系统枚举值
// ============================================================

/**
 * 系统枚举值常量。
 * 在 Tuple 的 children[1:] 位置作为值使用。
 */
export const SYS_V = {
  // ─── 基数枚举 ───
  /** 单值 */
  SINGLE_VALUE: 'SYS_V01',
  /** 多值列表 */
  LIST_OF_VALUES: 'SYS_V02',

  // ─── 布尔枚举 ───
  /** Yes */
  YES: 'SYS_V03',
  /** No */
  NO: 'SYS_V04',

  // ─── 搜索操作符枚举 ───
  /** 有某字段 */
  HAS_ATTRIBUTE: 'SYS_V14',
  /** 父节点后代 */
  PARENTS_DESCENDANTS: 'SYS_V15',
  /** 祖父节点后代 */
  GRANDPARENTS_DESCENDANTS: 'SYS_V16',
  /** 有某标签 */
  HAS_TAG: 'SYS_V19',
  /** 已定义 */
  DEFINED: 'SYS_V30',
  /** 未定义 */
  NOT_DEFINED: 'SYS_V31',
  /** 父节点后代（含引用） */
  PARENTS_DESCENDANTS_WITH_REFS: 'SYS_V33',
  /** 父节点 */
  PARENT: 'SYS_V36',
  /** 链接到 */
  LINKS_TO: 'SYS_V49',
  /** 始终 */
  ALWAYS: 'SYS_V52',
  /** 是...的子节点 */
  CHILD_OF: 'SYS_V53',
  /** 从不 */
  NEVER: 'SYS_V54',
  /** 属于 */
  OWNED_BY: 'SYS_V55',
  /** 为空时 */
  WHEN_EMPTY: 'SYS_V56',
  /** 不为空时 */
  WHEN_NOT_EMPTY: 'SYS_V57',
  /** 语义"部分" */
  PART_OF: 'SYS_V62',
  /** 递归组件 */
  COMPONENTS_REC: 'SYS_V64',

  // ─── 其他 ───
  /** Tana 聊天机器人 */
  TANA: 'SYS_V86',

  // ─── Nodex 自定义枚举值 ───
  /** [Nodex] 值为默认值时 — Hide field 条件选项 */
  WHEN_VALUE_IS_DEFAULT: 'NDX_V01',
} as const;

export type SystemEnumValue = typeof SYS_V[keyof typeof SYS_V];

// ============================================================
// SYS_T* —— 系统标签
// ============================================================

/**
 * 系统标签常量。
 * 这些是 Tana 预定义的标签定义 (docType='tagDef')。
 */
export const SYS_T = {
  // ─── 元标签 ───
  /** supertag 的元标签 */
  SUPERTAG: 'SYS_T01',
  /** 字段定义标签 */
  FIELD_DEFINITION: 'SYS_T02',
  /** 选项定义 */
  OPTIONS: 'SYS_T03',
  /** 可选选择定义 */
  OPTIONAL_CHOICES: 'SYS_T05',
  /** 数据类型规格 */
  DATATYPE: 'SYS_T06',
  /** 基数选择 */
  CARDINALITY_CHOICES: 'SYS_T09',
  /** 媒体类型 */
  MEDIA: 'SYS_T15',
  /** 元信息标签 */
  META_INFORMATION: 'SYS_T16',
  /** 行默认值 */
  ROW_DEFAULTS: 'SYS_T29',
  /** Tana 应用标签 */
  TAGR_APP: 'SYS_T41',

  // ─── 基础类型（Base Types）───
  /** 会议 */
  MEETING: 'SYS_T98',
  /** 人物 */
  PERSON: 'SYS_T99',
  /** 任务（启用 AI 自动分类） */
  TASK: 'SYS_T100',
  /** 组织 */
  ORGANIZATION: 'SYS_T101',
  /** 地点 */
  LOCATION: 'SYS_T102',
  /** 事件 */
  EVENT: 'SYS_T103',
  /** 项目 */
  PROJECT: 'SYS_T104',
  /** 主题 */
  TOPIC: 'SYS_T105',
  /** 文章 */
  ARTICLE: 'SYS_T117',
  /** 备忘录 */
  MEMO: 'SYS_T118',
  /** 反思 */
  REFLECTION: 'SYS_T119',

  // ─── 日历系统 ───
  /** 日 */
  DAY: 'SYS_T124',
  /** 周 */
  WEEK: 'SYS_T125',
  /** 年 */
  YEAR: 'SYS_T126',

  // ─── 媒体 ───
  /** MIME 类型 */
  MIME_TYPE: 'SYS_T157',
} as const;

export type SystemTag = typeof SYS_T[keyof typeof SYS_T];

/**
 * Tana 系统节点常量定义 — Loro 迁移后新版本
 *
 * 核心变化：
 * - FIELD_TYPES：可读字符串字段类型
 * - SYSTEM_TAGS：可读系统标签 ID
 * - SYS_A/SYS_D/SYS_V/SYS_T：系统常量
 */

// ============================================================
// 系统根节点
// ============================================================

export const SYS_ROOT = 'SYS_0';
export const SYS_ENUMS_ROOT = 'SYS_V00';

// ============================================================
// FIELD_TYPES —— 字段数据类型（可读字符串，替代 SYS_D* opaque ID）
// ============================================================

/**
 * 字段数据类型。直接存储为可读字符串，不再用 SYS_D* ID。
 * fieldDef.data.fieldType = FIELD_TYPES.OPTIONS
 */
export const FIELD_TYPES = {
  CHECKBOX: 'checkbox',
  DATE: 'date',
  OPTIONS_FROM_SUPERTAG: 'options_from_supertag',
  PLAIN: 'plain',
  FORMULA: 'formula',
  NUMBER: 'number',
  TANA_USER: 'tana_user',
  URL: 'url',
  EMAIL: 'email',
  OPTIONS: 'options',
  BOOLEAN: 'boolean',    // soma 扩展
  COLOR: 'color',        // soma 扩展
} as const;

export type FieldType = typeof FIELD_TYPES[keyof typeof FIELD_TYPES];

// ============================================================
// SYSTEM_TAGS —— 日期系统 tagDef 固定 ID（普通 supertag）
// ============================================================

/**
 * 日期系统使用的固定 tagDef 节点 ID。
 * `day/week/year` 在数据模型中是普通 tagDef（普通 supertag），
 * 仅由 journal 功能基于固定 ID 识别其语义。
 */
export const SYSTEM_TAGS = {
  DAY: 'sys:day',
  WEEK: 'sys:week',
  YEAR: 'sys:year',
} as const;

export type SystemTagId = typeof SYSTEM_TAGS[keyof typeof SYSTEM_TAGS];

export function isJournalSystemTagId(tagId: string): boolean {
  return tagId === SYSTEM_TAGS.DAY || tagId === SYSTEM_TAGS.WEEK || tagId === SYSTEM_TAGS.YEAR;
}

// ============================================================
// SYS_A* —— 系统属性（保留，fieldEntry/viewDef 配置仍需）
// ============================================================

/**
 * 系统属性 ID 常量。
 * 在当前模型里，SYS_A13/A55/A12/A11/A14 等不再作为旧配置节点的 key，
 * 但 fieldEntry / view / search 配置仍然会引用这些常量。
 */
export const SYS_A = {
  NULLABLE: 'SYS_A01',
  TYPE_CHOICE: 'SYS_A02',
  VALUES: 'SYS_A03',
  SOURCE_SUPERTAG: 'SYS_A06',
  BACKREFERENCE: 'SYS_A08',
  CARDINALITY: 'SYS_A10',
  COLOR: 'SYS_A11',
  LOCKED: 'SYS_A12',
  NODE_SUPERTAGS: 'SYS_A13',
  CHILD_SUPERTAG: 'SYS_A14',
  SEARCH_EXPRESSION: 'SYS_A15',
  VIEWS: 'SYS_A16',
  COLUMN_DEFS: 'SYS_A17',
  FILTER_EXPRESSIONS: 'SYS_A18',
  SORT_ORDER: 'SYS_A19',
  SORT_FIELD: 'SYS_A20',
  NODE_NAME: 'SYS_A21',
  NODE_DESCRIPTION: 'SYS_A22',
  TITLE_EXPRESSION: 'SYS_A23',
  SIDE_NOTE: 'SYS_A24',
  BANNER_IMAGE: 'SYS_A25',
  FORMULA: 'SYS_A26',
  CHAT_CONFIG: 'SYS_A27',
  READ_CURSOR: 'SYS_A31',
  OPTION_SEARCH: 'SYS_A38',
  AUTOCOLLECT_OPTIONS: 'SYS_A44',
  TARGET_NODES: 'SYS_A47',
  SHOW_CHECKBOX: 'SYS_A55',
  FIELD_DEFAULTS: 'SYS_A62',
  CODE_LANGUAGE: 'SYS_A70',
  EXTERNAL_ALIAS: 'SYS_A75',
  URL: 'SYS_A78',
  MERGED_INTO: 'SYS_A84',
  CHATBOT_CONFIG: 'SYS_A89',
  DATE: 'SYS_A90',
  NODE_PUBLISHED: 'SYS_A100',
  PUBLISH_SETTINGS: 'SYS_A105',
  FIELD_SUGGESTIONS: 'SYS_A121',
  SHADOW_TAG_NODES: 'SYS_A129',
  TAG_SUGGESTIONS: 'SYS_A130',
  PATH: 'SYS_A131',
  CONTENT_CONFIG: 'SYS_A133',
  FORM: 'SYS_A134',
  ORIGINAL_AUDIO: 'SYS_A136',
  CHAT_CONTEXT: 'SYS_A139',
  IS_FIELD_HOISTED: 'SYS_A141',
  ATTENDEES: 'SYS_A142',
  ICON: 'SYS_A143',
  RELATED_CONTENT: 'SYS_A144',
  TAG_SEARCH_NODE: 'SYS_A146',
  SCHEMA: 'SYS_A148',
  OPTIONAL_FIELDS: 'SYS_A156',
  FIELD_NURSERY: 'SYS_A157',
  AI_INSTRUCTIONS: 'SYS_A160',
  JOURNAL_DATE: 'SYS_A169',
  NUM_REFERENCES_RAW: 'SYS_A173',
  SIDE_FILTERS: 'SYS_A174',
  COMMANDS_FULL_MENU: 'SYS_A175',
  AI_PAYLOAD: 'SYS_A176',
  SUPERTAG_INSTANCES_ARE_ENTITIES: 'SYS_A179',
  SOURCE_MATERIAL: 'SYS_A199',
  LINKS_TO: 'SYS_A200',
  LINKED_PATH: 'SYS_A201',
  NODE_SOURCE: 'SYS_A202',
  INLINE_DATE: 'SYS_A203',
  INLINE_NODE: 'SYS_A204',
  DISPLAY_DENSITY: 'SYS_A205',
  DRAFTS: 'SYS_A206',
  TEMPLATE_IS_VERIFIED: 'SYS_A207',
  ATTRIBUTE_PROTOTYPE: 'SYS_A208',
  ASSIGNED_TO: 'SYS_A209',
  HEADING_STYLE: 'SYS_A214',
  REFERENCE_SEARCH_NODE: 'SYS_A215',
  ALIAS_TAG_NAMES: 'SYS_A216',
  HIDE_FROM_SEARCHES: 'SYS_A250',
  PROMOTE_FOR: 'SYS_A251',
  SPEAKER: 'SYS_A252',

  // ─── soma 自定义属性 ───
  HIDE_FIELD: 'NDX_A01',
  AUTO_INITIALIZE: 'NDX_A02',
  MIN_VALUE: 'NDX_A03',
  MAX_VALUE: 'NDX_A04',
  EXTENDS: 'NDX_A05',
  DONE_STATE_MAPPING: 'NDX_A06',
  DONE_MAP_CHECKED: 'NDX_A07',
  DONE_MAP_UNCHECKED: 'NDX_A08',
} as const;

export type SystemAttribute = typeof SYS_A[keyof typeof SYS_A];

// ============================================================
// AUTO_INIT_STRATEGY —— 字段自动初始化策略
// ============================================================

/**
 * Strategies for auto-initializing field values when a tag is applied.
 * Multiple strategies can be enabled simultaneously; they are evaluated
 * in priority order (highest first). First non-null result wins.
 */
export const AUTO_INIT_STRATEGY = {
  /** Reference the nearest ancestor tagged with the field's sourceSupertag. */
  ANCESTOR_SUPERTAG_REF: 'ancestor_supertag_ref',
  /** Fill with today's date (ISO string). Date fields only. */
  CURRENT_DATE: 'current_date',
  /** Fill with the date from the nearest Day node ancestor. Date fields only. */
  ANCESTOR_DAY_NODE: 'ancestor_day_node',
  /** Copy value from the nearest ancestor that has the same field. All field types. */
  ANCESTOR_FIELD_VALUE: 'ancestor_field_value',
} as const;

export type AutoInitStrategy = typeof AUTO_INIT_STRATEGY[keyof typeof AUTO_INIT_STRATEGY];

/** Priority order: first match wins. Reference types first. */
export const AUTO_INIT_PRIORITY: AutoInitStrategy[] = [
  AUTO_INIT_STRATEGY.ANCESTOR_SUPERTAG_REF,
  AUTO_INIT_STRATEGY.CURRENT_DATE,
  AUTO_INIT_STRATEGY.ANCESTOR_DAY_NODE,
  AUTO_INIT_STRATEGY.ANCESTOR_FIELD_VALUE,
];

// ============================================================
// SYS_D* —— 字段数据类型（保留，用于过渡）
// ============================================================

export const SYS_D = {
  CHECKBOX: 'SYS_D01',
  /** @deprecated Use SYS_D.NUMBER instead. Kept for legacy Tana import data. */
  INTEGER: 'SYS_D02',
  DATE: 'SYS_D03',
  OPTIONS_FROM_SUPERTAG: 'SYS_D05',
  PLAIN: 'SYS_D06',
  FORMULA: 'SYS_D07',
  NUMBER: 'SYS_D08',
  TANA_USER: 'SYS_D09',
  URL: 'SYS_D10',
  EMAIL: 'SYS_D11',
  OPTIONS: 'SYS_D12',
  OPTIONS_ALT: 'SYS_D13',
  BOOLEAN: 'NDX_D01',
  COLOR: 'NDX_D02',
} as const;

export type SystemDataType = typeof SYS_D[keyof typeof SYS_D];

// ============================================================
// SYS_V* —— 系统枚举值（保留）
// ============================================================

export const SYS_V = {
  SINGLE_VALUE: 'SYS_V01',
  LIST_OF_VALUES: 'SYS_V02',
  YES: 'SYS_V03',
  NO: 'SYS_V04',
  HAS_ATTRIBUTE: 'SYS_V14',
  PARENTS_DESCENDANTS: 'SYS_V15',
  GRANDPARENTS_DESCENDANTS: 'SYS_V16',
  HAS_TAG: 'SYS_V19',
  DEFINED: 'SYS_V30',
  NOT_DEFINED: 'SYS_V31',
  PARENTS_DESCENDANTS_WITH_REFS: 'SYS_V33',
  PARENT: 'SYS_V36',
  LINKS_TO: 'SYS_V49',
  ALWAYS: 'SYS_V52',
  CHILD_OF: 'SYS_V53',
  NEVER: 'SYS_V54',
  OWNED_BY: 'SYS_V55',
  WHEN_EMPTY: 'SYS_V56',
  WHEN_NOT_EMPTY: 'SYS_V57',
  PART_OF: 'SYS_V62',
  COMPONENTS_REC: 'SYS_V64',
  TANA: 'SYS_V86',
  WHEN_VALUE_IS_DEFAULT: 'NDX_V01',
} as const;

export type SystemEnumValue = typeof SYS_V[keyof typeof SYS_V];

// ============================================================
// SYS_T* —— 系统标签（保留，用于过渡）
// ============================================================

export const SYS_T = {
  SUPERTAG: 'SYS_T01',
  FIELD_DEFINITION: 'SYS_T02',
  OPTIONS: 'SYS_T03',
  OPTIONAL_CHOICES: 'SYS_T05',
  DATATYPE: 'SYS_T06',
  CARDINALITY_CHOICES: 'SYS_T09',
  MEDIA: 'SYS_T15',
  META_INFORMATION: 'SYS_T16',
  ROW_DEFAULTS: 'SYS_T29',
  TAGR_APP: 'SYS_T41',
  MEETING: 'SYS_T98',
  PERSON: 'SYS_T99',
  TASK: 'SYS_T100',
  ORGANIZATION: 'SYS_T101',
  LOCATION: 'SYS_T102',
  EVENT: 'SYS_T103',
  PROJECT: 'SYS_T104',
  TOPIC: 'SYS_T105',
  ARTICLE: 'SYS_T117',
  MEMO: 'SYS_T118',
  REFLECTION: 'SYS_T119',
  DAY: 'SYS_T124',
  WEEK: 'SYS_T125',
  YEAR: 'SYS_T126',
  MIME_TYPE: 'SYS_T157',

  // ─── soma 内置标签 ───
  HIGHLIGHT: 'SYS_T200',
  NOTE: 'SYS_T201',
  SOURCE: 'SYS_T202',
} as const;

export type SystemTag = typeof SYS_T[keyof typeof SYS_T];

// ============================================================
// NDX_F* —— soma 固定 FieldDef ID（防止 CRDT 合并时重复创建）
// ============================================================

export const NDX_F = {
  /** Source URL fieldDef (child of #source tagDef) */
  SOURCE_URL: 'NDX_F01',
  /** Source fieldDef (child of #highlight tagDef, options_from_supertag → #source) */
  HIGHLIGHT_SOURCE: 'NDX_F02',
  /** Author fieldDef (child of #source tagDef) */
  AUTHOR: 'NDX_F03',
  /** Published fieldDef (child of #source tagDef) */
  PUBLISHED: 'NDX_F04',
  /** Duration fieldDef (child of #video tagDef) */
  DURATION: 'NDX_F05',
  /** Highlights fieldDef (child of #note tagDef, options_from_supertag → #highlight) */
  NOTE_HIGHLIGHTS: 'NDX_F06',
  /** Anchor fieldDef (child of #highlight tagDef, hidden plain field for anchor JSON) */
  HIGHLIGHT_ANCHOR: 'NDX_F07',
  /** Settings: Highlight & Comment toggle (boolean, on Settings container) */
  SETTING_HIGHLIGHT_ENABLED: 'NDX_F10',
} as const;

export type NdxFieldDef = typeof NDX_F[keyof typeof NDX_F];

// ============================================================
// NDX_T* —— soma 剪藏类型标签（extends #source）
// ============================================================

export const NDX_T = {
  /** Workspace settings schema tagDef */
  WORKSPACE_SETTINGS: 'NDX_T10',
  /** #article tagDef — extends #source */
  ARTICLE: 'NDX_T01',
  /** #video tagDef — extends #source */
  VIDEO: 'NDX_T02',
  /** #social tagDef — extends #source */
  SOCIAL: 'NDX_T03',
} as const;

export type NdxTag = typeof NDX_T[keyof typeof NDX_T];

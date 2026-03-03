export type {
  NodeType,
  ViewMode,
  TextMark,
  InlineRefEntry,
  DoneMappingEntry,
  NodexNode,
  ContainerId,
  Editor,
  CreateNodeInput,
  UpdateNodeInput,
} from './node.js';

export {
  CONTAINER_IDS,
  getContainerId,
  isContainerNode,
} from './node.js';

export {
  SYS_ROOT,
  SYS_ENUMS_ROOT,
  SYS_A,
  SYS_D,
  SYS_V,
  SYS_T,
  NDX_F,
  FIELD_TYPES,
  SYSTEM_TAGS,
  AUTO_INIT_STRATEGY,
  AUTO_INIT_PRIORITY,
  isJournalSystemTagId,
} from './system-nodes.js';

export type {
  SystemAttribute,
  SystemDataType,
  SystemEnumValue,
  SystemTag,
  NdxFieldDef,
  SystemTagId,
  FieldType,
  AutoInitStrategy,
} from './system-nodes.js';

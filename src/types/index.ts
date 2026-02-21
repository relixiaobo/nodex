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
  FIELD_TYPES,
  SYSTEM_TAGS,
} from './system-nodes.js';

export type {
  SystemAttribute,
  SystemDataType,
  SystemEnumValue,
  SystemTag,
  SystemTagId,
  FieldType,
} from './system-nodes.js';

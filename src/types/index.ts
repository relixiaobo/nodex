export type {
  NodeType,
  DocType,         // @deprecated 使用 NodeType
  ViewMode,
  TextMark,
  InlineRefEntry,
  DoneMappingEntry,
  NodexNode,
  ContainerSuffix,
  ContainerId,
  WorkspaceContainerSuffix,  // @deprecated 使用 ContainerId
  Editor,
  CreateNodeInput,
  UpdateNodeInput,
} from './node.js';

export {
  CONTAINERS,
  CONTAINER_IDS,
  WORKSPACE_CONTAINERS,  // @deprecated 使用 CONTAINER_IDS
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
  SYS_D_TO_FIELD_TYPE,
  SYS_T_TO_SYSTEM_TAG,
} from './system-nodes.js';

export type {
  SystemAttribute,
  SystemDataType,
  SystemEnumValue,
  SystemTag,
  SystemTagId,
  FieldType,
} from './system-nodes.js';

export { initSupabase, getSupabase } from './supabase.js';

export {
  createNode,
  getNode,
  getNodes,
  updateNode,
  trashNode,
  deleteNode,
  getChildren,
  addChild,
  moveNode,
  reorderChildren,
  getNodesByDocType,
  getNodesByOwner,
  fullTextSearch as fullTextSearchNodes,
  createNodes,
} from './node-service.js';

export {
  applyTag,
  removeTag,
  getNodeTags,
  getWorkspaceTags,
  resolveTagFields,
} from './tag-service.js';

export {
  getFieldValues,
  getFieldValue,
  getFieldDataType,
  getFieldOptions,
  setFieldValue,
  setFieldTextValue,
  clearFieldValue,
  handleDoneStateChange,
} from './field-service.js';

export type { FieldValueEntry, FieldValueMap } from './field-service.js';

export {
  getSearchConfig,
  executeSearch,
  fullTextSearch,
  getBacklinks,
  getInlineBacklinks,
} from './search-service.js';

export type { SearchConfig } from './search-service.js';

export {
  importTanaExport,
  validateTanaExport,
  importEditors,
} from './tana-import.js';

export type {
  TanaExportData,
  TanaDoc,
  ImportResult,
  ImportError,
  ValidationResult,
} from './tana-import.js';

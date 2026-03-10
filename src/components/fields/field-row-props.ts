import type { FieldEntry } from '../../hooks/use-node-fields.js';
import type { ConfigFieldDef } from '../../lib/field-utils.js';

export interface FieldRowEntryProps {
  attrDefId: string;
  attrDefName: string;
  fieldEntryId: string;
  valueNodeId?: string;
  valueName?: string;
  dataType: string;
  trashed?: boolean;
  isRequired?: boolean;
  isEmpty?: boolean;
  isSystemConfig?: boolean;
  configKey?: string;
  configControl?: ConfigFieldDef['control'];
}

export function toFieldRowEntryProps(field: FieldEntry): FieldRowEntryProps {
  return {
    attrDefId: field.fieldDefId,
    attrDefName: field.attrDefName,
    fieldEntryId: field.fieldEntryId,
    valueNodeId: field.valueNodeId,
    valueName: field.valueName,
    dataType: field.dataType,
    trashed: field.trashed,
    isRequired: field.isRequired,
    isEmpty: field.isEmpty,
    isSystemConfig: field.isSystemConfig,
    configKey: field.configKey,
    configControl: field.configControl,
  };
}

/**
 * Field type picker — thin wrapper around NodePicker.
 *
 * Maps FIELD_TYPE_LIST to NodePicker options and calls
 * changeFieldType on selection.
 *
 * - allowCreate: false (fixed type list)
 * - isReference: false (normal bullet)
 */
import { useCallback } from 'react';
import { useNodeStore } from '../../stores/node-store.js';
import { useWorkspaceStore } from '../../stores/workspace-store.js';
import { FIELD_TYPE_LIST } from '../../lib/field-utils.js';
import { NodePicker } from './NodePicker.js';

interface FieldTypePickerProps {
  attrDefId: string;
  currentValue: string; // SYS_D* constant
}

const pickerOptions = FIELD_TYPE_LIST.map((ft) => ({ id: ft.value, name: ft.label }));

export function FieldTypePicker({ attrDefId, currentValue }: FieldTypePickerProps) {
  const userId = useWorkspaceStore((s) => s.userId) ?? 'local';

  const handleSelect = useCallback(
    (id: string) => {
      useNodeStore.getState().changeFieldType(attrDefId, id, userId);
    },
    [attrDefId, userId],
  );

  return (
    <NodePicker
      options={pickerOptions}
      selectedId={currentValue}
      onSelect={handleSelect}
      placeholder="Select type"
    />
  );
}

/**
 * Dropdown picker for field type (SYS_D*).
 *
 * Renders inside a FieldRow value column when the field is a typeChoice
 * tuple on an attrDef node. Mirrors Tana's TupleAsPicker component.
 */
import { useCallback } from 'react';
import { useNodeStore } from '../../stores/node-store.js';
import { useWorkspaceStore } from '../../stores/workspace-store.js';
import { FIELD_TYPE_LIST } from '../../lib/field-utils.js';

interface FieldTypePickerProps {
  attrDefId: string;
  currentValue: string; // SYS_D* constant
}

export function FieldTypePicker({ attrDefId, currentValue }: FieldTypePickerProps) {
  const userId = useWorkspaceStore((s) => s.userId) ?? 'local';

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      useNodeStore.getState().changeFieldType(attrDefId, e.target.value, userId);
    },
    [attrDefId, userId],
  );

  return (
    <select
      value={currentValue}
      onChange={handleChange}
      className="h-[22px] px-1 text-sm bg-transparent border-none outline-none cursor-pointer text-foreground/80 hover:text-foreground"
    >
      {FIELD_TYPE_LIST.map((ft) => (
        <option key={ft.value} value={ft.value}>
          {ft.label}
        </option>
      ))}
    </select>
  );
}

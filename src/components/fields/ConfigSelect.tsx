/**
 * Config select picker — thin wrapper around NodePicker.
 *
 * Maps config field options (from ATTRDEF_CONFIG_FIELDS) to
 * NodePicker and calls setConfigValue on selection.
 *
 * - allowCreate: false (fixed option list)
 * - isReference: false (normal bullet)
 */
import { useCallback, useMemo } from 'react';
import { useNodeStore } from '../../stores/node-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { ATTRDEF_CONFIG_FIELDS } from '../../lib/field-utils.js';
import { NodePicker } from './NodePicker';

interface ConfigSelectProps {
  tupleId: string;
  fieldKey: string;
  currentValue?: string;
}

export function ConfigSelect({ tupleId, fieldKey, currentValue }: ConfigSelectProps) {
  const setConfigValue = useNodeStore((s) => s.setConfigValue);
  const userId = useWorkspaceStore((s) => s.userId) ?? 'local';

  const configDef = ATTRDEF_CONFIG_FIELDS.find((f) => f.key === fieldKey);
  const pickerOptions = useMemo(
    () => (configDef?.options ?? []).map((opt) => ({ id: opt.value, name: opt.label })),
    [configDef?.options],
  );

  const handleSelect = useCallback(
    (id: string) => {
      setConfigValue(tupleId, id, userId);
    },
    [tupleId, setConfigValue, userId],
  );

  return (
    <NodePicker
      options={pickerOptions}
      selectedId={currentValue ?? configDef?.defaultValue}
      onSelect={handleSelect}
      placeholder="Select"
    />
  );
}

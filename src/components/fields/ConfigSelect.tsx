/**
 * Dropdown select for attrDef config fields (Hide field).
 *
 * Options come from the ATTRDEF_CONFIG_FIELDS registry.
 * onChange updates the Tuple value via setConfigValue.
 *
 * Description is rendered by FieldRow (name column), not here.
 */
import { useCallback } from 'react';
import { useNodeStore } from '../../stores/node-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { ATTRDEF_CONFIG_FIELDS } from '../../lib/field-utils.js';

interface ConfigSelectProps {
  tupleId: string;
  fieldKey: string;
  currentValue?: string;
}

export function ConfigSelect({ tupleId, fieldKey, currentValue }: ConfigSelectProps) {
  const setConfigValue = useNodeStore((s) => s.setConfigValue);
  const userId = useWorkspaceStore((s) => s.userId) ?? 'local';

  const configDef = ATTRDEF_CONFIG_FIELDS.find(f => f.key === fieldKey);
  const options = configDef?.options ?? [];

  const handleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setConfigValue(tupleId, e.target.value, userId);
  }, [tupleId, setConfigValue, userId]);

  return (
    <select
      value={currentValue ?? configDef?.defaultValue ?? ''}
      onChange={handleChange}
      className="h-[22px] text-sm bg-transparent border border-border/40 rounded px-1.5 text-foreground cursor-pointer outline-none hover:border-border/80 transition-colors"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

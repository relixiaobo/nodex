/**
 * Number input for attrDef config fields (Min/Max value).
 *
 * Inline text input that commits on blur or Enter.
 * Stores value as Tuple children[1] via setConfigValue.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNodeStore } from '../../stores/node-store';
import { useWorkspaceStore } from '../../stores/workspace-store';

interface ConfigNumberInputProps {
  tupleId: string;
  fieldKey: string;
  currentValue?: string;
}

export function ConfigNumberInput({ tupleId, currentValue }: ConfigNumberInputProps) {
  const setConfigValue = useNodeStore((s) => s.setConfigValue);
  const userId = useWorkspaceStore((s) => s.userId) ?? 'local';
  const [value, setValue] = useState(currentValue ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external changes
  useEffect(() => {
    setValue(currentValue ?? '');
  }, [currentValue]);

  const commit = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed === (currentValue ?? '')) return;
    setConfigValue(tupleId, trimmed, userId);
  }, [value, currentValue, tupleId, setConfigValue, userId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
      inputRef.current?.blur();
    } else if (e.key === 'Escape') {
      setValue(currentValue ?? '');
      inputRef.current?.blur();
    }
  }, [commit, currentValue]);

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      placeholder="—"
      className="h-7 w-20 rounded-md border border-border bg-transparent px-2 text-sm text-foreground placeholder:text-foreground-tertiary focus:outline-none focus:ring-2 focus:ring-primary/40"
    />
  );
}

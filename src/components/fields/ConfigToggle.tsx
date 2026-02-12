/**
 * Toggle switch for attrDef config fields (Required, Auto-collect).
 *
 * Green pill when ON (SYS_V03/YES), gray when OFF (SYS_V04/NO).
 * Click toggles the value via setConfigValue.
 *
 * Description is rendered by FieldRow (name column), not here.
 */
import { useCallback } from 'react';
import { useNodeStore } from '../../stores/node-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { SYS_V } from '../../types/index.js';

interface ConfigToggleProps {
  tupleId: string;
  fieldKey: string;
  currentValue?: string;
}

export function ConfigToggle({ tupleId, currentValue }: ConfigToggleProps) {
  const setConfigValue = useNodeStore((s) => s.setConfigValue);
  const userId = useWorkspaceStore((s) => s.userId) ?? 'local';

  const isOn = currentValue === SYS_V.YES;

  const handleClick = useCallback(() => {
    setConfigValue(tupleId, isOn ? SYS_V.NO : SYS_V.YES, userId);
  }, [tupleId, isOn, setConfigValue, userId]);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      onClick={handleClick}
      className={`
        relative inline-flex h-[18px] w-8 shrink-0 cursor-pointer rounded-full
        transition-colors duration-200 ease-in-out
        ${isOn ? 'bg-success' : 'bg-foreground/[0.15]'}
      `}
    >
      <span
        className={`
          pointer-events-none inline-block h-[14px] w-[14px] rounded-full bg-white shadow-sm
          transform transition-transform duration-200 ease-in-out mt-[2px]
          ${isOn ? 'translate-x-[16px]' : 'translate-x-[2px]'}
        `}
      />
    </button>
  );
}

/**
 * Config tag picker — thin wrapper around NodePicker.
 *
 * Maps workspace tags to NodePicker and calls setConfigValue on selection.
 * Used by both attrDef (SOURCE_SUPERTAG) and tagDef (CHILD_SUPERTAG) config fields.
 */
import { useCallback } from 'react';
import { useNodeStore } from '../../stores/node-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { useWorkspaceTags } from '../../hooks/use-workspace-tags';
import { NodePicker } from './NodePicker';

interface ConfigTagPickerProps {
  tupleId: string;
  fieldKey: string;
  currentValue?: string;
}

export function ConfigTagPicker({ tupleId, fieldKey, currentValue }: ConfigTagPickerProps) {
  const tags = useWorkspaceTags();
  const setConfigValue = useNodeStore((s) => s.setConfigValue);
  const userId = useWorkspaceStore((s) => s.userId) ?? 'local';

  const handleSelect = useCallback(
    (id: string) => {
      setConfigValue(tupleId, id, userId);
    },
    [tupleId, setConfigValue, userId],
  );

  const handleClear = useCallback(() => {
    setConfigValue(tupleId, '', userId);
  }, [tupleId, setConfigValue, userId]);

  return (
    <NodePicker
      options={tags}
      selectedId={currentValue || undefined}
      onSelect={handleSelect}
      onClear={handleClear}
      placeholder="Select supertag"
    />
  );
}

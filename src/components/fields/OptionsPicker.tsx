/**
 * Options field value picker — thin wrapper around NodePicker.
 *
 * Connects field-specific data (useFieldOptions, assocData, store actions)
 * to the generic NodePicker combobox interaction.
 *
 * - allowCreate: true (auto-collect new option values)
 * - isReference: true (dotted reference bullet for selected value)
 */
import { useCallback } from 'react';
import { useFieldOptions } from '../../hooks/use-field-options';
import { useNodeStore } from '../../stores/node-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { useChildren } from '../../hooks/use-children';
import { NodePicker } from './NodePicker';

interface OptionsPickerProps {
  nodeId: string;
  attrDefId: string;
  assocDataId?: string;
}

export function OptionsPicker({ nodeId, attrDefId, assocDataId }: OptionsPickerProps) {
  const options = useFieldOptions(attrDefId);
  const setOptionsFieldValue = useNodeStore((s) => s.setOptionsFieldValue);
  const autoCollectOption = useNodeStore((s) => s.autoCollectOption);
  const userId = useWorkspaceStore((s) => s.userId);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  // Load current selection from assocData.children
  useChildren(assocDataId ?? '');
  const selectedId = useNodeStore((s) => {
    if (!assocDataId) return undefined;
    const assoc = s.entities[assocDataId];
    return assoc?.children?.[0] || undefined;
  });

  const handleSelect = useCallback(
    (optionId: string) => {
      if (!userId) return;
      setOptionsFieldValue(nodeId, attrDefId, optionId, userId);
    },
    [nodeId, attrDefId, userId, setOptionsFieldValue],
  );

  const handleCreate = useCallback(
    (name: string) => {
      if (!userId || !workspaceId) return;
      autoCollectOption(nodeId, attrDefId, name, workspaceId, userId);
    },
    [nodeId, attrDefId, userId, workspaceId, autoCollectOption],
  );

  const handleClear = useCallback(() => {
    if (!assocDataId) return;
    useNodeStore.setState((state) => {
      const assoc = state.entities[assocDataId];
      if (assoc) assoc.children = [];
    });
  }, [assocDataId]);

  return (
    <NodePicker
      options={options}
      selectedId={selectedId}
      onSelect={handleSelect}
      onClear={handleClear}
      allowCreate
      onCreate={handleCreate}
      placeholder="Select option"
      isReference
    />
  );
}

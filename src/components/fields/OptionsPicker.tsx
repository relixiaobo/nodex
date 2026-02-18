/**
 * Options field value picker — thin wrapper around NodePicker.
 *
 * Connects field-specific data (useFieldOptions, tuple, store actions)
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
  tupleId?: string;
}

export function OptionsPicker({ nodeId, attrDefId, tupleId }: OptionsPickerProps) {
  const options = useFieldOptions(attrDefId);
  const setOptionsFieldValue = useNodeStore((s) => s.setOptionsFieldValue);
  const autoCollectOption = useNodeStore((s) => s.autoCollectOption);
  const userId = useWorkspaceStore((s) => s.userId);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  // Load current selection from tuple.children[1:]
  useChildren(tupleId ?? '');
  const selectedId = useNodeStore((s) => {
    if (!tupleId) return undefined;
    const tuple = s.entities[tupleId];
    const valIds = tuple?.children?.slice(1) ?? [];
    return valIds.find((cid) => options.some((opt) => opt.id === cid)) || undefined;
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
    if (!tupleId) return;
    useNodeStore.setState((state) => {
      const tuple = state.entities[tupleId];
      if (tuple && tuple.children) {
        // Keep children[0] (the key/attrDefId), remove value children
        tuple.children = [tuple.children[0]];
      }
    });
  }, [tupleId]);

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

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
  const clearFieldValue = useNodeStore((s) => s.clearFieldValue);

  // Load current selection from fieldEntry.children (new model: no key prefix)
  useChildren(tupleId ?? '');
  const selectedId = useNodeStore((s) => {
    void s._version;
    if (!tupleId) return undefined;
    const tuple = s.getNode(tupleId);
    const valIds = tuple?.children ?? [];
    return valIds.find((cid) => options.some((opt) => opt.id === cid)) || undefined;
  });

  const handleSelect = useCallback(
    (optionId: string) => {
      setOptionsFieldValue(nodeId, attrDefId, optionId);
    },
    [nodeId, attrDefId, setOptionsFieldValue],
  );

  const handleCreate = useCallback(
    (name: string) => {
      autoCollectOption(nodeId, attrDefId, name);
    },
    [nodeId, attrDefId, autoCollectOption],
  );

  const handleClear = useCallback(() => {
    clearFieldValue(nodeId, attrDefId);
  }, [nodeId, attrDefId, clearFieldValue]);

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

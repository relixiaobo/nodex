/**
 * Options field value picker — thin wrapper around NodePicker.
 *
 * Connects field-specific data (useFieldOptions, field entry, store actions)
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
import type { NodexNode } from '../../types/index.js';
import { t } from '../../i18n/strings.js';

interface OptionsPickerProps {
  nodeId: string;
  attrDefId: string;
  fieldEntryId?: string;
}

export function isAutoCollectCreationEnabled(fieldDef: NodexNode | null | undefined): boolean {
  // Default-on semantics unless explicitly disabled.
  return fieldDef?.autocollectOptions !== false;
}

export function OptionsPicker({ nodeId, attrDefId, fieldEntryId }: OptionsPickerProps) {
  const options = useFieldOptions(attrDefId);
  const setOptionsFieldValue = useNodeStore((s) => s.setOptionsFieldValue);
  const autoCollectOption = useNodeStore((s) => s.autoCollectOption);
  const clearFieldValue = useNodeStore((s) => s.clearFieldValue);
  const allowCreate = useNodeStore((s) => {
    void s._version;
    const fieldDef = s.getNode(attrDefId);
    return isAutoCollectCreationEnabled(fieldDef);
  });

  // Load current selection from fieldEntry.children (new model: no key prefix)
  useChildren(fieldEntryId ?? '');
  const selectedId = useNodeStore((s) => {
    void s._version;
    if (!fieldEntryId) return undefined;
    const fieldEntry = s.getNode(fieldEntryId);
    const valueNodeId = fieldEntry?.children?.[0];
    if (!valueNodeId) return undefined;
    const valueNode = s.getNode(valueNodeId);
    const targetId = valueNode?.targetId;
    return targetId && options.some((opt) => opt.id === targetId) ? targetId : undefined;
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
      allowCreate={allowCreate}
      onCreate={handleCreate}
      placeholder={t('field.selectOption')}
      isReference
    />
  );
}

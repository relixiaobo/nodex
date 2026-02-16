/**
 * Done mapping entries — field value input for "Map checked to" / "Map unchecked to".
 *
 * Shows existing field+option pairs as "FieldName: OptionValue" entries with delete button.
 * Provides a two-step picker (select field → select option) to add new entries.
 *
 * Data model: each entry is a tuple [NDX_A07|NDX_A08, attrDefId, optionId]
 * nested under the NDX_A06 toggle tuple.
 */
import { useState, useCallback, useMemo } from 'react';
import { X } from 'lucide-react';
import { useNodeStore } from '../../stores/node-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { useWorkspaceFields } from '../../hooks/use-workspace-fields';
import { NodePicker, type NodePickerOption } from './NodePicker';
import { BulletChevron } from '../outliner/BulletChevron';

const noop = () => {};

interface DoneMappingEntriesProps {
  /** NDX_A06 toggle tuple ID (parent of mapping entry tuples) */
  toggleTupleId: string;
  /** NDX_A07 (checked) or NDX_A08 (unchecked) */
  mappingKey: string;
}

interface MappingEntry {
  entryTupleId: string;
  attrDefId: string;
  attrDefName: string;
  optionId: string;
  optionName: string;
}

export function DoneMappingEntries({ toggleTupleId, mappingKey }: DoneMappingEntriesProps) {
  const userId = useWorkspaceStore((s) => s.userId) ?? 'local';
  const addDoneMappingEntry = useNodeStore((s) => s.addDoneMappingEntry);
  const removeDoneMappingEntry = useNodeStore((s) => s.removeDoneMappingEntry);

  // Two-step picker state: null = not picking, 'field' = selecting field, 'option' = selecting option
  const [pickerStep, setPickerStep] = useState<null | 'field' | 'option'>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  // Read existing entries from store
  const entries = useNodeStore((s): MappingEntry[] => {
    const toggle = s.entities[toggleTupleId];
    if (!toggle?.children) return [];
    const result: MappingEntry[] = [];
    for (const cid of toggle.children) {
      const child = s.entities[cid];
      if (!child?.children || child.props._docType !== 'tuple') continue;
      if (child.children[0] !== mappingKey) continue;
      const attrDefId = child.children[1];
      const optionId = child.children[2];
      if (!attrDefId || !optionId) continue;
      const attrDef = s.entities[attrDefId];
      const option = s.entities[optionId];
      result.push({
        entryTupleId: cid,
        attrDefId,
        attrDefName: attrDef?.props.name ?? 'Unknown field',
        optionId,
        optionName: option?.props.name ?? 'Unknown option',
      });
    }
    return result;
  });

  // Workspace fields for step 1 picker
  const allFields = useWorkspaceFields();
  const fieldOptions: NodePickerOption[] = useMemo(
    () => allFields.filter(f => !f.id.startsWith('NDX_SYS_')).map(f => ({ id: f.id, name: f.name })),
    [allFields],
  );

  // Options for step 2 picker (children of selected field that are content nodes = option nodes)
  const optionOptions: NodePickerOption[] = useNodeStore((s): NodePickerOption[] => {
    if (!selectedFieldId) return [];
    const attrDef = s.entities[selectedFieldId];
    if (!attrDef?.children) return [];
    return attrDef.children
      .map(cid => s.entities[cid])
      .filter(n => n && !n.props._docType)
      .map(n => ({ id: n!.id, name: n!.props.name ?? 'Untitled' }));
  });

  const handleDelete = useCallback(
    (entryTupleId: string) => {
      removeDoneMappingEntry(toggleTupleId, entryTupleId, userId);
    },
    [toggleTupleId, removeDoneMappingEntry, userId],
  );

  const handleFieldSelect = useCallback((fieldId: string) => {
    setSelectedFieldId(fieldId);
    setPickerStep('option');
  }, []);

  const handleOptionSelect = useCallback(
    (optionId: string) => {
      if (!selectedFieldId) return;
      addDoneMappingEntry(toggleTupleId, mappingKey, selectedFieldId, optionId, userId);
      setPickerStep(null);
      setSelectedFieldId(null);
    },
    [toggleTupleId, mappingKey, selectedFieldId, addDoneMappingEntry, userId],
  );

  const handlePickerCancel = useCallback(() => {
    setPickerStep(null);
    setSelectedFieldId(null);
  }, []);

  const handleAddClick = useCallback(() => {
    setPickerStep('field');
    setSelectedFieldId(null);
  }, []);

  return (
    <div className="flex flex-col">
      {/* Existing entries */}
      {entries.map((entry) => (
        <div
          key={entry.entryTupleId}
          className="flex min-h-7 items-center gap-2 py-1 group/entry"
          style={{ paddingLeft: 6 }}
        >
          <BulletChevron hasChildren={false} isExpanded={false} onBulletClick={noop} />
          <span className="flex-1 min-w-0 text-sm leading-[21px] text-foreground truncate">
            {entry.attrDefName}: {entry.optionName}
          </span>
          <button
            className="shrink-0 opacity-0 group-hover/entry:opacity-100 transition-opacity text-foreground-tertiary hover:text-destructive p-0.5"
            onClick={() => handleDelete(entry.entryTupleId)}
            title="Remove mapping"
          >
            <X size={12} />
          </button>
        </div>
      ))}

      {/* Add area — step-based picker */}
      {pickerStep === 'field' ? (
        <div style={{ paddingLeft: 6 }}>
          <NodePicker
            options={fieldOptions}
            onSelect={handleFieldSelect}
            onClear={handlePickerCancel}
            placeholder="Select field..."
          />
        </div>
      ) : pickerStep === 'option' ? (
        <div style={{ paddingLeft: 6 }}>
          <NodePicker
            options={optionOptions}
            onSelect={handleOptionSelect}
            onClear={handlePickerCancel}
            placeholder="Select option value..."
          />
        </div>
      ) : (
        <div
          className="flex min-h-7 items-center gap-2 py-1 cursor-pointer group/add"
          style={{ paddingLeft: 6 }}
          onClick={handleAddClick}
        >
          <BulletChevron hasChildren={false} isExpanded={false} onBulletClick={noop} dimmed />
          <span className="text-sm leading-[21px] text-foreground-tertiary select-none group-hover/add:text-foreground-secondary transition-colors">
            Add field mapping...
          </span>
        </div>
      )}
    </div>
  );
}

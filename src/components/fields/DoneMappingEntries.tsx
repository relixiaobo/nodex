/**
 * Done mapping entries — field value input for "Map checked to" / "Map unchecked to".
 *
 * Shows existing field+option pairs as "FieldName: OptionValue" entries with delete button.
 * Provides a two-step picker (select field → select option) to add new entries.
 *
 * Data model (Loro): entries are stored directly on the tagDef as DoneMappingEntry[],
 * accessed via loroDoc.getDoneMappings(tagDefId, checked).
 *
 * Uses JSON.stringify as Zustand selector return to avoid React 19 infinite loop.
 */
import { useState, useCallback, useMemo } from 'react';
import { X } from '../../lib/icons.js';
import { useNodeStore } from '../../stores/node-store';
import { useWorkspaceFields } from '../../hooks/use-workspace-fields';
import { NodePicker, type NodePickerOption } from './NodePicker';
import { BulletChevron } from '../outliner/BulletChevron';
import * as loroDoc from '../../lib/loro-doc.js';
import { SYS_A } from '../../types/index.js';

const noop = () => {};
const EMPTY = '[]';

interface DoneMappingEntriesProps {
  /** Owner tagDef ID */
  tagDefId: string;
  /** NDX_A07 (checked) or NDX_A08 (unchecked) attrDef key */
  mappingKey: string;
}

interface MappingEntry {
  index: number;
  fieldDefId: string;
  fieldDefName: string;
  optionId: string;
  optionName: string;
}

export function DoneMappingEntries({ tagDefId, mappingKey }: DoneMappingEntriesProps) {
  const addDoneMappingEntry = useNodeStore((s) => s.addDoneMappingEntry);
  const removeDoneMappingEntry = useNodeStore((s) => s.removeDoneMappingEntry);

  // Derive checked flag from config key
  const checked = mappingKey === SYS_A.DONE_MAP_CHECKED;

  // Two-step picker state
  const [pickerStep, setPickerStep] = useState<null | 'field' | 'option'>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  // Read existing entries from loroDoc done mappings
  const entriesJson = useNodeStore((s) => {
    void s._version;
    if (!tagDefId) return EMPTY;
    const raw = loroDoc.getDoneMappings(tagDefId, checked);
    if (raw.length === 0) return EMPTY;
    const result: MappingEntry[] = raw.map((entry, i) => ({
      index: i,
      fieldDefId: entry.fieldDefId,
      fieldDefName: s.getNode(entry.fieldDefId)?.name ?? 'Unknown field',
      optionId: entry.optionId,
      optionName: s.getNode(entry.optionId)?.name ?? 'Unknown option',
    }));
    return JSON.stringify(result);
  });
  const entries: MappingEntry[] = useMemo(
    () => (entriesJson === EMPTY ? [] : JSON.parse(entriesJson)),
    [entriesJson],
  );

  // Workspace fields for step 1 picker
  const allFields = useWorkspaceFields();
  const fieldOptions: NodePickerOption[] = useMemo(
    () => allFields.filter(f => !f.id.startsWith('NDX_SYS_')).map(f => ({ id: f.id, name: f.name })),
    [allFields],
  );

  // Options for step 2 picker (children of selectedFieldId that are regular content nodes)
  const optionOptionsJson = useNodeStore((s) => {
    void s._version;
    if (!selectedFieldId) return EMPTY;
    const children = loroDoc.getChildren(selectedFieldId);
    const opts = children
      .map(cid => s.getNode(cid))
      .filter(n => n && !n.type)
      .map(n => ({ id: n!.id, name: n!.name ?? 'Untitled' }));
    if (opts.length === 0) return EMPTY;
    return JSON.stringify(opts);
  });
  const optionOptions: NodePickerOption[] = useMemo(
    () => (optionOptionsJson === EMPTY ? [] : JSON.parse(optionOptionsJson)),
    [optionOptionsJson],
  );

  const handleDelete = useCallback(
    (index: number) => {
      if (!tagDefId) return;
      removeDoneMappingEntry(tagDefId, checked, index);
    },
    [tagDefId, checked, removeDoneMappingEntry],
  );

  const handleFieldSelect = useCallback((fieldId: string) => {
    setSelectedFieldId(fieldId);
    setPickerStep('option');
  }, []);

  const handleOptionSelect = useCallback(
    (optionId: string) => {
      if (!selectedFieldId || !tagDefId) return;
      addDoneMappingEntry(tagDefId, checked, selectedFieldId, optionId);
      setPickerStep(null);
      setSelectedFieldId(null);
    },
    [tagDefId, checked, selectedFieldId, addDoneMappingEntry],
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
          key={entry.index}
          className="flex min-h-7 items-center gap-2 py-1 group/entry"
          style={{ paddingLeft: 25 }}
        >
          <BulletChevron hasChildren={false} isExpanded={false} onBulletClick={noop} />
          <span className="flex-1 min-w-0 text-sm leading-[21px] text-foreground truncate">
            {entry.fieldDefName}: {entry.optionName}
          </span>
          <button
            className="shrink-0 opacity-0 group-hover/entry:opacity-100 transition-opacity text-foreground-tertiary hover:text-destructive p-0.5"
            onClick={() => handleDelete(entry.index)}
            title="Remove mapping"
          >
            <X size={12} />
          </button>
        </div>
      ))}

      {/* Add area — step-based picker */}
      {pickerStep === 'field' ? (
        <div>
          <NodePicker
            options={fieldOptions}
            onSelect={handleFieldSelect}
            onClear={handlePickerCancel}
            placeholder="Select field..."
            insetLeft={25}
          />
        </div>
      ) : pickerStep === 'option' ? (
        <div>
          <NodePicker
            options={optionOptions}
            onSelect={handleOptionSelect}
            onClear={handlePickerCancel}
            placeholder="Select option value..."
            insetLeft={25}
          />
        </div>
      ) : (
        <div
          className="flex min-h-7 items-center gap-2 py-1 cursor-pointer group/add"
          style={{ paddingLeft: 25 }}
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

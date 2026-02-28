/**
 * Mini outliner for field values (all types that store values as nodes).
 *
 * Uses the field Tuple as the root. Values are stored in tuple.children[1:]
 * (children[0] is the key/attrDefId). Value nodes are rendered with full
 * OutlinerItem capabilities (Enter, Tab, children, etc.).
 * Field tuples are rendered as FieldRow (same as OutlinerItem).
 * Shows a TrailingInput when empty or at the end.
 *
 * Used for Plain and Options field types. fieldDataType and attrDefId are
 * passed through for future type-specific rendering (e.g., option autocomplete).
 */
import { useMemo, useState, useCallback, useRef } from 'react';
import { useNodeStore } from '../../stores/node-store';
import { useChildren } from '../../hooks/use-children';
import { useNodeFields, type FieldEntry } from '../../hooks/use-node-fields';
import { useFieldOptions } from '../../hooks/use-field-options.js';
import { OutlinerItem } from '../outliner/OutlinerItem';
import { RowHost } from '../outliner/RowHost.js';
import { TrailingInput } from '../editor/TrailingInput';
import { FieldRow } from './FieldRow';
import { toFieldRowEntryProps } from './field-row-props.js';
import { NodePicker, type NodePickerOption } from './NodePicker';
import { BulletChevron } from '../outliner/BulletChevron';
import { SYS_A, SYS_V } from '../../types';
import {
  configKeyToPropName,
  isBooleanFieldType,
  isCheckboxFieldType,
  isColorFieldType,
  isDateFieldType,
  isEmailFieldType,
  isOptionsFromSupertagFieldType,
  isUrlFieldType,
  resolveConfigValue,
} from '../../lib/field-utils.js';
import { isOutlinerContentNodeType } from '../../lib/node-type-utils.js';
import { ColorSwatchPicker } from './ColorSwatchPicker';
import { DatePicker, formatDateDisplay } from './DatePicker.js';
import { useUIStore } from '../../stores/ui-store.js';
import * as loroDoc from '../../lib/loro-doc.js';
import { t } from '../../i18n/strings.js';
import { FIELD_OVERLAY_Z_INDEX, FIELD_VALUE_INSET } from './field-layout.js';
import { shouldShowTrailingInput, type OutlinerRowItem } from '../outliner/row-model.js';
import { useDragSelect } from '../../hooks/use-drag-select.js';

interface FieldValueOutlinerProps {
  tupleId: string;
  /** Field data type (e.g., SYS_D.OPTIONS) — for future type-specific value rendering */
  fieldDataType?: string;
  /** AttrDef ID — for future option autocomplete */
  attrDefId?: string;
  /** For virtual config entries (__virtual_*): parent tagDef/fieldDef node ID to resolve value from */
  configNodeId?: string;
  /** Called when arrow navigation escapes field value boundaries */
  onNavigateOut?: (direction: 'up' | 'down') => void;
}

export function shouldShowFieldValueTrailingInput(
  items: Array<{ type: 'field' | 'content' }>,
): boolean {
  return shouldShowTrailingInput(items);
}

export function resolveSupertagPickerSelectedId(
  tupleId: string,
  getNode: (id: string) => { children?: string[]; name?: string; targetId?: string } | null,
): string | undefined {
  const tuple = getNode(tupleId);
  const valueNodeId = tuple?.children?.[0];
  if (!valueNodeId) return undefined;
  const valueNode = getNode(valueNodeId);
  return valueNode?.name || undefined;
}

export function FieldValueOutliner({ tupleId, fieldDataType, attrDefId, configNodeId, onNavigateOut }: FieldValueOutlinerProps) {
  useChildren(tupleId);

  // Values are fieldEntry.children (no key prefix in new model)
  const childIdsJson = useNodeStore((s) => {
    void s._version;
    const t = s.getNode(tupleId);
    const c = t?.children ?? [];
    return JSON.stringify(c);
  });
  const childIds: string[] = useMemo(() => JSON.parse(childIdsJson), [childIdsJson]);

  const _version = useNodeStore((s) => s._version);

  // Detect fields on the Tuple (created via > trigger inside field values)
  const fields = useNodeFields(tupleId);
  const fieldMap = useMemo(() => {
    const m = new Map<string, FieldEntry>();
    for (const f of fields) m.set(f.fieldEntryId, f);
    return m;
  }, [fields]);

  // Separate children into fields and content (same logic as OutlinerItem)
  const visibleChildren = useMemo(() => {
    const result: OutlinerRowItem[] = [];
    for (const cid of childIds) {
      if (fieldMap.has(cid)) {
        result.push({ id: cid, type: 'field' });
      } else {
        const nodeType = useNodeStore.getState().getNode(cid)?.type;
        if (isOutlinerContentNodeType(nodeType)) result.push({ id: cid, type: 'content' });
        // else skip: fieldEntry/fieldDef/tagDef 等结构节点
      }
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childIds, fieldMap, _version]);

  const selectableChildIds = useMemo(
    () => visibleChildren.map((c) => c.id),
    [visibleChildren],
  );

  // --- ALL hooks must be declared before any early returns (React rules of hooks) ---
  const toggleCheckboxField = useNodeStore((s) => s.toggleCheckboxField);
  const setFieldValue = useNodeStore((s) => s.setFieldValue);
  const clearFieldValue = useNodeStore((s) => s.clearFieldValue);
  const setConfigValue = useNodeStore((s) => s.setConfigValue);
  const setFocusedNode = useUIStore((s) => s.setFocusedNode);
  const clearFocus = useUIStore((s) => s.clearFocus);
  const setEditingFieldName = useUIStore((s) => s.setEditingFieldName);

  // Drop zone hooks (must be before early returns)
  const moveNodeTo = useNodeStore((s) => s.moveNodeTo);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Drag select: document-level mouse tracking for multi-node selection
  useDragSelect({ containerRef, rootChildIds: selectableChildIds, rootNodeId: tupleId });

  const handleContainerDragOver = useCallback((e: React.DragEvent) => {
    const dragId = useUIStore.getState().dragNodeId;
    if (!dragId) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  }, []);

  const handleContainerDragLeave = useCallback((e: React.DragEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleContainerDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const dragId = useUIStore.getState().dragNodeId;
    if (!dragId) return;
    moveNodeTo(dragId, tupleId);
    useUIStore.getState().setDrag(null);
  }, [tupleId, moveNodeTo]);

  const firstIsField = visibleChildren.length > 0 && visibleChildren[0].type === 'field';
  const lastIsField = visibleChildren.length > 0 && visibleChildren[visibleChildren.length - 1].type === 'field';
  const showTrailingInput = shouldShowFieldValueTrailingInput(visibleChildren);

  const handleTrailingNavigateOut = useCallback((direction: 'up' | 'down') => {
    if (direction === 'up') {
      const last = visibleChildren[visibleChildren.length - 1];
      if (!last) {
        onNavigateOut?.('up');
        return;
      }
      if (last.type === 'field') {
        clearFocus();
        setEditingFieldName(last.id);
        return;
      }
      useUIStore.getState().setFocusClickCoords({
        nodeId: last.id,
        parentId: tupleId,
        textOffset: (useNodeStore.getState().getNode(last.id)?.name ?? '').length,
      });
      setFocusedNode(last.id, tupleId);
      return;
    }
    onNavigateOut?.('down');
  }, [visibleChildren, onNavigateOut, clearFocus, setEditingFieldName, tupleId, setFocusedNode]);

  // --- Special control early returns (Boolean, Checkbox, Date) ---

  // --- BOOLEAN: Yes/No toggle switch ---
  // For virtual config entries: read from node attribute directly.
  // For real fieldEntry: reads value from tuple.children[0] (SYS_V.YES or SYS_V.NO).
  const isBoolean = isBooleanFieldType(fieldDataType);
  if (isBoolean) {
    const isVirtualEntry = tupleId.startsWith('__virtual_');
    let isYes: boolean;
    if (isVirtualEntry && configNodeId && attrDefId) {
      const configNode = loroDoc.toNodexNode(configNodeId);
      const val = configNode ? resolveConfigValue(configNode, attrDefId) : undefined;
      isYes = val === undefined
        ? attrDefId === SYS_A.AUTOCOLLECT_OPTIONS
        : val === SYS_V.YES;
    } else {
      const currentValue = selectableChildIds[0];
      isYes = currentValue === SYS_V.YES;
    }
    const label = isYes ? 'Yes' : 'No';

    return (
      <div className="flex min-h-6 items-start gap-2 py-1" style={{ paddingLeft: FIELD_VALUE_INSET }}>
        <BulletChevron hasChildren={false} isExpanded={false} onBulletClick={() => { }} />
        <button
          onClick={() => {
            const newIsYes = !isYes;
            if (isVirtualEntry && configNodeId && attrDefId) {
              const propName = configKeyToPropName(attrDefId);
              if (propName) setConfigValue(configNodeId, propName, newIsYes);
            } else {
              const parentId = loroDoc.getParentId(tupleId) ?? '';
              const fieldDefId = loroDoc.toNodexNode(tupleId)?.fieldDefId ?? '';
              if (parentId && fieldDefId) setFieldValue(parentId, fieldDefId, [newIsYes ? SYS_V.YES : SYS_V.NO]);
            }
          }}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isYes ? 'bg-primary' : 'bg-border hover:bg-foreground/20'
            }`}
          role="switch"
          aria-checked={isYes}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-sm ring-0 transition-transform duration-200 ease-in-out ${isYes ? 'translate-x-4' : 'translate-x-0'
              }`}
          />
        </button>
        <span className="text-[15px] leading-6 text-foreground select-none">{label}</span>
      </div>
    );
  }

  // --- COLOR: swatch selector ---
  if (isColorFieldType(fieldDataType)) {
    return <ColorSwatchPicker tupleId={tupleId} configNodeId={configNodeId} />;
  }

  // --- OPTIONS_FROM_SUPERTAG: single-select tagged-node picker ---
  if (isOptionsFromSupertagFieldType(fieldDataType) && attrDefId) {
    return (
      <TaggedNodePickerField tupleId={tupleId} attrDefId={attrDefId} />
    );
  }

  const isCheckbox = isCheckboxFieldType(fieldDataType);
  if (isCheckbox) {
    const valueNodeId = selectableChildIds[0];
    const valueNode = valueNodeId ? useNodeStore.getState().getNode(valueNodeId) : undefined;
    const isChecked = valueNode?.name === SYS_V.YES;

    return (
      <div className="flex min-h-6 items-start gap-2 py-1" style={{ paddingLeft: FIELD_VALUE_INSET }}>
        <BulletChevron hasChildren={false} isExpanded={false} onBulletClick={() => { }} />
        <input
          type="checkbox"
          checked={isChecked}
          onChange={() => toggleCheckboxField(tupleId)}
          className="mt-[3px] h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
        />
      </div>
    );
  }

  // --- DATE: click-to-pick, similar to Options pattern ---
  if (isDateFieldType(fieldDataType)) {
    const valueNodeId = selectableChildIds[0];
    const valueNode = valueNodeId ? useNodeStore.getState().getNode(valueNodeId) : undefined;
    const currentValue = valueNode?.name ?? '';

    return (
      <DatePickerField
        value={currentValue}
        onSelect={(v) => {
          const parentId = loroDoc.getParentId(tupleId) ?? '';
          const fieldDefId = loroDoc.toNodexNode(tupleId)?.fieldDefId ?? '';
          if (!parentId || !fieldDefId) return;
          if (v === '') {
            clearFieldValue(parentId, fieldDefId);
            return;
          }
          setFieldValue(parentId, fieldDefId, [v]);
        }}
      />
    );
  }

  // --- URL: clickable link ---
  if (isUrlFieldType(fieldDataType)) {
    const valueNodeId = selectableChildIds[0];
    const valueNode = valueNodeId ? useNodeStore.getState().getNode(valueNodeId) : undefined;
    const url = valueNode?.name ?? '';

    return (
      <div className="flex min-h-6 items-start gap-2 py-1" style={{ paddingLeft: FIELD_VALUE_INSET }}>
        <BulletChevron hasChildren={false} isExpanded={false} onBulletClick={() => { }} dimmed={!url} />
        <div className="flex-1 min-w-0 flex items-center">
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              title={url}
              className="text-[15px] leading-6 text-primary underline truncate"
              onClick={(e) => e.stopPropagation()}
            >
              {url}
            </a>
          ) : (
            <span className="text-[15px] leading-6 text-foreground-tertiary select-none">Empty</span>
          )}
        </div>
      </div>
    );
  }

  // --- EMAIL: clickable mailto link ---
  if (isEmailFieldType(fieldDataType)) {
    const valueNodeId = selectableChildIds[0];
    const valueNode = valueNodeId ? useNodeStore.getState().getNode(valueNodeId) : undefined;
    const email = valueNode?.name ?? '';

    return (
      <div className="flex min-h-6 items-start gap-2 py-1" style={{ paddingLeft: FIELD_VALUE_INSET }}>
        <BulletChevron hasChildren={false} isExpanded={false} onBulletClick={() => { }} dimmed={!email} />
        <div className="flex-1 min-w-0 flex items-center">
          {email ? (
            <a
              href={`mailto:${email}`}
              title={email}
              className="text-[15px] leading-6 text-primary underline truncate"
              onClick={(e) => e.stopPropagation()}
            >
              {email}
            </a>
          ) : (
            <span className="text-[15px] leading-6 text-foreground-tertiary select-none">Empty</span>
          )}
        </div>
      </div>
    );
  }

  const dragActive = isDragOver && useUIStore.getState().dragNodeId != null;

  return (
    <div
      ref={containerRef}
      className={`min-h-[22px]${firstIsField ? ' pt-1' : ''}${lastIsField ? ' pb-1' : ''}${dragActive ? ' ring-1 ring-primary/30 bg-primary/5 rounded-sm' : ''}`}
      data-row-scope-parent-id={tupleId}
      onDragOver={handleContainerDragOver}
      onDragLeave={handleContainerDragLeave}
      onDrop={handleContainerDrop}
    >
      <RowHost
        rows={visibleChildren}
        renderField={(row, i, rows) => (
          <div className="@container relative has-[.field-overlay-open]:z-[80]" style={{ paddingLeft: 6 + 15 + 4 }}>
            <FieldRow
              nodeId={tupleId}
              {...toFieldRowEntryProps(fieldMap.get(row.id)!)}
              rootChildIds={selectableChildIds}
              rootNodeId={tupleId}
              isLastInGroup={i === rows.length - 1 || rows[i + 1].type !== 'field'}
              onNavigateOut={(direction) => {
                if (direction === 'up') {
                  for (let j = i - 1; j >= 0; j--) {
                    const prev = rows[j];
                    if (prev.type === 'field') {
                      clearFocus();
                      setEditingFieldName(prev.id);
                      return;
                    }
                    setFocusedNode(prev.id, tupleId);
                    return;
                  }
                  onNavigateOut?.('up');
                  return;
                }
                for (let j = i + 1; j < rows.length; j++) {
                  const next = rows[j];
                  if (next.type === 'field') {
                    clearFocus();
                    setEditingFieldName(next.id);
                    return;
                  }
                  setFocusedNode(next.id, tupleId);
                  return;
                }
                onNavigateOut?.('down');
              }}
            />
          </div>
        )}
        renderContent={(row) => (
          <OutlinerItem
            nodeId={row.id}
            depth={0}
            rootChildIds={selectableChildIds}
            parentId={tupleId}
            rootNodeId={tupleId}
            fieldDataType={fieldDataType}
            attrDefId={attrDefId}
            onNavigateOut={onNavigateOut}
          />
        )}
      />
      {showTrailingInput && (
        <TrailingInput
          parentId={tupleId}
          depth={0}
          parentExpandKey={`${loroDoc.getParentId(tupleId) ?? ''}:${tupleId}`}
          fieldDataType={fieldDataType}
          attrDefId={attrDefId}
          onNavigateOut={handleTrailingNavigateOut}
        />
      )}
    </div>
  );
}

/** Single-select tagged-node picker for OPTIONS_FROM_SUPERTAG value fields.
 *  Shows all nodes tagged with the source supertag as selectable options. */
function TaggedNodePickerField({ tupleId, attrDefId }: { tupleId: string; attrDefId: string }) {
  const fieldOptions = useFieldOptions(attrDefId);
  const setFieldValue = useNodeStore((s) => s.setFieldValue);
  const clearFieldValue = useNodeStore((s) => s.clearFieldValue);

  const selectedId = useNodeStore((s) => {
    void s._version;
    return resolveSupertagPickerSelectedId(tupleId, s.getNode);
  });

  const options: NodePickerOption[] = useMemo(
    () => fieldOptions.map((o) => ({ id: o.id, name: o.name })),
    [fieldOptions],
  );

  const handleSelect = useCallback(
    (id: string) => {
      const parentId = loroDoc.getParentId(tupleId) ?? '';
      const fieldDefId = loroDoc.toNodexNode(tupleId)?.fieldDefId ?? '';
      if (parentId && fieldDefId) setFieldValue(parentId, fieldDefId, [id]);
    },
    [tupleId, setFieldValue],
  );

  const handleClear = useCallback(() => {
    const parentId = loroDoc.getParentId(tupleId) ?? '';
    const fieldDefId = loroDoc.toNodexNode(tupleId)?.fieldDefId ?? '';
    if (parentId && fieldDefId) clearFieldValue(parentId, fieldDefId);
  }, [tupleId, clearFieldValue]);

  return (
    <NodePicker
      options={options}
      selectedId={selectedId}
      onSelect={handleSelect}
      onClear={handleClear}
      placeholder={t('field.selectValue')}
      isReference
    />
  );
}

/** Click-to-pick date field with custom DatePicker popover. */
function DatePickerField({ value, onSelect }: { value: string; onSelect: (v: string) => void }) {
  const [open, setOpen] = useState(false);

  const handleClick = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  return (
    <div className={`relative ${open ? 'isolate field-overlay-open' : ''}`} style={open ? { zIndex: FIELD_OVERLAY_Z_INDEX } : undefined}>
      <div className="flex min-h-6 items-start gap-2 py-1" style={{ paddingLeft: FIELD_VALUE_INSET }}>
        <BulletChevron hasChildren={false} isExpanded={false} onBulletClick={() => { }} dimmed={!value} />
        <div className="flex-1 min-w-0 flex items-center cursor-pointer" onClick={handleClick}>
          <span className={`text-[15px] leading-6 select-none ${value ? '' : 'text-foreground-tertiary'}`}>
            {value ? formatDateDisplay(value) : t('field.empty')}
          </span>
        </div>
      </div>
      {open && (
        <DatePicker
          value={value}
          onSelect={onSelect}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

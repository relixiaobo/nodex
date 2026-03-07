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
import { useMemo, useState, useCallback, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNodeStore } from '../../stores/node-store';
import { useChildren } from '../../hooks/use-children';
import { useNodeFields, type FieldEntry } from '../../hooks/use-node-fields';
import { OutlinerItem } from '../outliner/OutlinerItem';
import { RowHost } from '../outliner/RowHost.js';
import { TrailingInput } from '../editor/TrailingInput';
import { FieldRow } from './FieldRow';
import { toFieldRowEntryProps } from './field-row-props.js';
import { FieldValueRow } from './FieldValueRow.js';
import { SYS_A, SYS_V } from '../../types';
import {
  configKeyToPropName,
  isBooleanFieldType,
  isCheckboxFieldType,
  isColorFieldType,
  isDateFieldType,
  isEmailFieldType,
  isUrlFieldType,
  resolveConfigValue,
} from '../../lib/field-utils.js';
import { isOutlinerContentNodeType } from '../../lib/node-type-utils.js';
import { ColorSwatchPicker } from './ColorSwatchPicker';
import { DatePicker, formatDateDisplay } from './DatePicker.js';
import { useUIStore } from '../../stores/ui-store.js';
import * as loroDoc from '../../lib/loro-doc.js';
import { t } from '../../i18n/strings.js';
import { FIELD_OVERLAY_Z_INDEX } from './field-layout.js';
import { shouldShowTrailingInput, type OutlinerRowItem, type OutlinerRowType } from '../outliner/row-model.js';
import { useDragSelect } from '../../hooks/use-drag-select.js';
import { navigateToSiblingRow } from '../../lib/outliner-navigation.js';

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
  items: Array<{ type: string }>,
): boolean {
  return shouldShowTrailingInput(items as Array<{ type: OutlinerRowType }>);
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

  const navToField = useCallback((fieldId: string) => {
    clearFocus();
    setEditingFieldName(fieldId);
  }, [clearFocus, setEditingFieldName]);

  const navToContent = useCallback((id: string, parentId: string, textOffset: number) => {
    const offset = textOffset === Infinity
      ? (useNodeStore.getState().getNode(id)?.name ?? '').length
      : textOffset;
    useUIStore.getState().setFocusClickCoords({ nodeId: id, parentId, textOffset: offset });
    setFocusedNode(id, parentId);
  }, [setFocusedNode]);

  const handleTrailingNavigateOut = useCallback((direction: 'up' | 'down') => {
    navigateToSiblingRow({
      rows: visibleChildren,
      currentIndex: visibleChildren.length,
      direction,
      parentId: tupleId,
      onField: navToField,
      onContent: navToContent,
      onEscape: onNavigateOut,
    });
  }, [visibleChildren, tupleId, navToField, navToContent, onNavigateOut]);

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
      <FieldValueRow>
        <div className="flex items-start gap-2">
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
            className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isYes ? 'bg-primary' : 'bg-border hover:bg-foreground/20'
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
      </FieldValueRow>
    );
  }

  // --- COLOR: swatch selector ---
  if (isColorFieldType(fieldDataType)) {
    return <ColorSwatchPicker tupleId={tupleId} configNodeId={configNodeId} />;
  }

  // OPTIONS_FROM_SUPERTAG: render as standard outliner (same as Tana).
  // Values are child nodes under the fieldEntry, displayed as outliner items.
  // No special picker — autocomplete will be handled by TrailingInput.

  const isCheckbox = isCheckboxFieldType(fieldDataType);
  if (isCheckbox) {
    const valueNodeId = selectableChildIds[0];
    const valueNode = valueNodeId ? useNodeStore.getState().getNode(valueNodeId) : undefined;
    const isChecked = valueNode?.name === SYS_V.YES;

    return (
      <FieldValueRow>
        <input
          type="checkbox"
          checked={isChecked}
          onChange={() => toggleCheckboxField(tupleId)}
          className="mt-[3px] h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
        />
      </FieldValueRow>
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
      <FieldValueRow dimmed={!url}>
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
            <span className="text-[15px] leading-6 text-foreground/20 select-none">{t('field.emptyUrl')}</span>
          )}
        </div>
      </FieldValueRow>
    );
  }

  // --- EMAIL: clickable mailto link ---
  if (isEmailFieldType(fieldDataType)) {
    const valueNodeId = selectableChildIds[0];
    const valueNode = valueNodeId ? useNodeStore.getState().getNode(valueNodeId) : undefined;
    const email = valueNode?.name ?? '';

    return (
      <FieldValueRow dimmed={!email}>
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
            <span className="text-[15px] leading-6 text-foreground/20 select-none">{t('field.emptyEmail')}</span>
          )}
        </div>
      </FieldValueRow>
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
              onNavigateOut={(direction) => navigateToSiblingRow({
                rows,
                currentIndex: i,
                direction,
                parentId: tupleId,
                onField: navToField,
                onContent: navToContent,
                onEscape: onNavigateOut,
              })}
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
/** Click-to-pick date field with custom DatePicker popover. */
function DatePickerField({ value, onSelect }: { value: string; onSelect: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);

  const handleClick = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setPickerPos(null);
      return;
    }
    const updatePos = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        setPickerPos({ top: rect.bottom + 4, left: rect.left });
      }
    };
    updatePos();
    const scrollContainer = triggerRef.current.closest('.overflow-y-auto, [style*="overflow"]');
    scrollContainer?.addEventListener('scroll', updatePos, { passive: true });
    window.addEventListener('resize', updatePos, { passive: true });
    return () => {
      scrollContainer?.removeEventListener('scroll', updatePos);
      window.removeEventListener('resize', updatePos);
    };
  }, [open]);

  return (
    <div ref={triggerRef} className={`relative ${open ? 'isolate field-overlay-open' : ''}`}>
      <FieldValueRow dimmed={!value}>
        <div className="flex-1 min-w-0 flex items-center cursor-pointer" onClick={handleClick}>
          <span className={`text-[15px] leading-6 select-none ${value ? '' : 'text-foreground/20'}`}>
            {value ? formatDateDisplay(value) : t('field.emptyDate')}
          </span>
        </div>
      </FieldValueRow>
      {open && pickerPos && createPortal(
        <div style={{ position: 'fixed', top: pickerPos.top, left: pickerPos.left, zIndex: FIELD_OVERLAY_Z_INDEX }}>
          <DatePicker
            value={value}
            onSelect={onSelect}
            onClose={() => setOpen(false)}
          />
        </div>,
        document.body,
      )}
    </div>
  );
}

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
import { useMemo, useState, useCallback } from 'react';
import { useNodeStore } from '../../stores/node-store';
import { useChildren } from '../../hooks/use-children';
import { useNodeFields, type FieldEntry } from '../../hooks/use-node-fields';
import { useWorkspaceTags } from '../../hooks/use-workspace-tags';
import { OutlinerItem } from '../outliner/OutlinerItem';
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
  isOptionsFromSupertagFieldType,
  resolveConfigValue,
} from '../../lib/field-utils.js';
import { isOutlinerContentNodeType } from '../../lib/node-type-utils.js';
import { ColorSwatchPicker } from './ColorSwatchPicker';
import { DatePicker, formatDateDisplay } from './DatePicker.js';
import { useUIStore } from '../../stores/ui-store.js';
import * as loroDoc from '../../lib/loro-doc.js';
import { FIELD_VALUE_INSET } from './field-layout.js';

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
  if (items.length === 0) return true;
  return items[items.length - 1]?.type === 'field';
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
    const result: { id: string; type: 'field' | 'content' }[] = [];
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

  const contentChildIds = useMemo(
    () => visibleChildren.filter((c) => c.type === 'content').map((c) => c.id),
    [visibleChildren],
  );

  // --- Special control early returns (Boolean, Checkbox, Date) ---
  const toggleCheckboxField = useNodeStore((s) => s.toggleCheckboxField);
  const setFieldValue = useNodeStore((s) => s.setFieldValue);
  const clearFieldValue = useNodeStore((s) => s.clearFieldValue);
  const setConfigValue = useNodeStore((s) => s.setConfigValue);
  const setFocusedNode = useUIStore((s) => s.setFocusedNode);
  const clearFocus = useUIStore((s) => s.clearFocus);
  const setEditingFieldName = useUIStore((s) => s.setEditingFieldName);

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
      const currentValue = contentChildIds[0];
      isYes = currentValue === SYS_V.YES;
    }
    const label = isYes ? 'Yes' : 'No';

    return (
      <div className="flex min-h-7 items-center gap-2 py-1" style={{ paddingLeft: FIELD_VALUE_INSET }}>
        <BulletChevron hasChildren={false} isExpanded={false} onBulletClick={() => {}} />
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
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            isYes ? 'bg-primary' : 'bg-muted'
          }`}
          role="switch"
          aria-checked={isYes}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform duration-200 ease-in-out ${
              isYes ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
        <span className="text-sm leading-[21px] text-foreground select-none">{label}</span>
      </div>
    );
  }

  // --- COLOR: swatch selector ---
  if (isColorFieldType(fieldDataType)) {
    return <ColorSwatchPicker tupleId={tupleId} configNodeId={configNodeId} />;
  }

  // --- OPTIONS_FROM_SUPERTAG: single-select supertag picker ---
  if (isOptionsFromSupertagFieldType(fieldDataType)) {
    return (
      <SupertagPickerField tupleId={tupleId} />
    );
  }

  const isCheckbox = isCheckboxFieldType(fieldDataType);
  if (isCheckbox) {
    const valueNodeId = contentChildIds[0];
    const valueNode = valueNodeId ? useNodeStore.getState().getNode(valueNodeId) : undefined;
    const isChecked = valueNode?.name === SYS_V.YES;

    return (
      <div className="flex min-h-7 items-start gap-2 py-1" style={{ paddingLeft: FIELD_VALUE_INSET }}>
        <BulletChevron hasChildren={false} isExpanded={false} onBulletClick={() => {}} />
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
    const valueNodeId = contentChildIds[0];
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

  // Prevent border stacking: when nested FieldRows are first/last, add padding
  // so their border-t/border-b doesn't visually coincide with the parent FieldRow's borders
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

  return (
    <div
      className={`min-h-[22px]${firstIsField ? ' pt-1' : ''}${lastIsField ? ' pb-1' : ''}`}
      data-row-scope-parent-id={tupleId}
    >
      {visibleChildren.map(({ id, type }, i) =>
        type === 'field' ? (
          <div key={id} className="@container" style={{ paddingLeft: 6 + 15 + 4 }}>
            <FieldRow
              nodeId={tupleId}
              {...toFieldRowEntryProps(fieldMap.get(id)!)}
              isLastInGroup={i === visibleChildren.length - 1 || visibleChildren[i + 1].type !== 'field'}
            />
          </div>
        ) : (
          <OutlinerItem
            key={id}
            nodeId={id}
            depth={0}
            rootChildIds={contentChildIds}
            parentId={tupleId}
            rootNodeId={tupleId}
            fieldDataType={fieldDataType}
            attrDefId={attrDefId}
            onNavigateOut={onNavigateOut}
          />
        ),
      )}
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

/** Single-select supertag picker for OPTIONS_FROM_SUPERTAG config fields. */
function SupertagPickerField({ tupleId }: { tupleId: string }) {
  const tags = useWorkspaceTags();
  const setFieldValue = useNodeStore((s) => s.setFieldValue);
  const clearFieldValue = useNodeStore((s) => s.clearFieldValue);

  // Read selected supertagId from value node name.
  const selectedId = useNodeStore((s) => {
    void s._version;
    return resolveSupertagPickerSelectedId(tupleId, s.getNode);
  });

  const options: NodePickerOption[] = useMemo(
    () => tags.map((t) => ({ id: t.id, name: t.name, isTagDef: true })),
    [tags],
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
      placeholder="Select supertag"
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
    <div className={`relative ${open ? 'isolate z-[1200]' : ''}`}>
      <div className="flex min-h-7 items-start gap-2 py-1" style={{ paddingLeft: FIELD_VALUE_INSET }}>
        <BulletChevron hasChildren={false} isExpanded={false} onBulletClick={() => {}} dimmed={!value} />
        <div className="flex-1 min-w-0 flex items-center cursor-pointer" onClick={handleClick}>
          <span className={`text-sm leading-[21px] select-none ${value ? '' : 'text-foreground-tertiary'}`}>
            {value ? formatDateDisplay(value) : 'Empty'}
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

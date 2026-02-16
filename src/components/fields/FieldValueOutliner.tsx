/**
 * Mini outliner for field values (all types that store values as nodes).
 *
 * Uses AssociatedData node as the root. Its children are value nodes
 * rendered with full OutlinerItem capabilities (Enter, Tab, children, etc.).
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
import { NodePicker, type NodePickerOption } from './NodePicker';
import { BulletChevron } from '../outliner/BulletChevron';
import { SYS_D, SYS_V } from '../../types';
import { ColorSwatchPicker } from './ColorSwatchPicker';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { DatePicker, formatDateDisplay } from './DatePicker.js';

interface FieldValueOutlinerProps {
  assocDataId: string;
  /** Field data type (e.g., SYS_D.OPTIONS) — for future type-specific value rendering */
  fieldDataType?: string;
  /** AttrDef ID — for future option autocomplete */
  attrDefId?: string;
  /** Called when arrow navigation escapes field value boundaries */
  onNavigateOut?: (direction: 'up' | 'down') => void;
}

export function FieldValueOutliner({ assocDataId, fieldDataType, attrDefId, onNavigateOut }: FieldValueOutlinerProps) {
  useChildren(assocDataId);
  const childIds = useNodeStore((s) => s.entities[assocDataId]?.children ?? []);
  const entities = useNodeStore((s) => s.entities);

  // Detect fields on the AssociatedData (created via > trigger inside field values)
  const fields = useNodeFields(assocDataId);
  const fieldMap = useMemo(() => {
    const m = new Map<string, FieldEntry>();
    for (const f of fields) m.set(f.tupleId, f);
    return m;
  }, [fields]);

  // Separate children into fields and content (same logic as OutlinerItem)
  const visibleChildren = useMemo(() => {
    const result: { id: string; type: 'field' | 'content' }[] = [];
    for (const cid of childIds) {
      if (fieldMap.has(cid)) {
        result.push({ id: cid, type: 'field' });
      } else {
        const dt = entities[cid]?.props._docType;
        if (!dt) result.push({ id: cid, type: 'content' });
        // else skip: metanode, associatedData, SYS tuple, tag tuple
      }
    }
    return result;
  }, [childIds, fieldMap, entities]);

  const contentChildIds = useMemo(
    () => visibleChildren.filter((c) => c.type === 'content').map((c) => c.id),
    [visibleChildren],
  );

  // --- Special control early returns (Boolean, Checkbox, Date) ---
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const userId = useWorkspaceStore((s) => s.userId);
  const toggleCheckboxField = useNodeStore((s) => s.toggleCheckboxField);
  const setConfigValue = useNodeStore((s) => s.setConfigValue);
  const createChild = useNodeStore((s) => s.createChild);
  const updateNodeName = useNodeStore((s) => s.updateNodeName);

  // --- BOOLEAN: Yes/No toggle switch ---
  // Reads value from AssociatedData children[0] (reference to SYS_V.YES or SYS_V.NO)
  const isBoolean = fieldDataType === SYS_D.BOOLEAN;
  const booleanTupleId = useNodeStore((s) => {
    if (!isBoolean) return undefined;
    // Find the tuple that owns this assocData via parent's associationMap
    const assoc = s.entities[assocDataId];
    const parentId = assoc?.props._ownerId;
    const parent = parentId ? s.entities[parentId] : undefined;
    if (!parent?.associationMap) return undefined;
    for (const [tid, aid] of Object.entries(parent.associationMap)) {
      if (aid === assocDataId) return tid;
    }
    return undefined;
  });
  if (isBoolean && booleanTupleId) {
    const currentValue = contentChildIds[0];
    const isYes = currentValue === SYS_V.YES;
    const label = isYes ? 'Yes' : 'No';

    return (
      <div className="flex min-h-7 items-center gap-2 py-1" style={{ paddingLeft: 25 }}>
        <BulletChevron hasChildren={false} isExpanded={false} onBulletClick={() => {}} />
        <button
          onClick={() => {
            if (!userId) return;
            const newVal = isYes ? SYS_V.NO : SYS_V.YES;
            setConfigValue(booleanTupleId, newVal, userId);
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
  if (fieldDataType === SYS_D.COLOR) {
    return <ColorSwatchPicker assocDataId={assocDataId} />;
  }

  // --- OPTIONS_FROM_SUPERTAG: single-select supertag picker ---
  if (fieldDataType === SYS_D.OPTIONS_FROM_SUPERTAG) {
    return (
      <SupertagPickerField assocDataId={assocDataId} />
    );
  }

  const isCheckbox = fieldDataType === SYS_D.CHECKBOX;
  if (isCheckbox) {
    const valueNodeId = contentChildIds[0];
    const valueNode = valueNodeId ? entities[valueNodeId] : undefined;
    const checked = valueNode?.props.name === SYS_V.YES;

    // paddingLeft: 6(base) + 15(chevron space) + 4(gap-1) = 25
    // Then BulletChevron (15px) + gap-2 (8px) + checkbox → bullet aligns with sibling fields
    return (
      <div className="flex min-h-7 items-start gap-2 py-1" style={{ paddingLeft: 25 }}>
        <BulletChevron hasChildren={false} isExpanded={false} onBulletClick={() => {}} />
        <input
          type="checkbox"
          checked={checked}
          onChange={() => {
            if (wsId && userId) toggleCheckboxField(assocDataId, wsId, userId);
          }}
          className="mt-[3px] h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
        />
      </div>
    );
  }

  // --- DATE: click-to-pick, similar to Options pattern ---
  if (fieldDataType === SYS_D.DATE) {
    const valueNodeId = contentChildIds[0];
    const valueNode = valueNodeId ? entities[valueNodeId] : undefined;
    const currentValue = valueNode?.props.name ?? '';

    return (
      <DatePickerField
        value={currentValue}
        onSelect={(v) => {
          if (!wsId || !userId) return;
          if (v === '') {
            // Clear: if value node exists, set name to empty
            if (valueNodeId) updateNodeName(valueNodeId, '', userId);
            return;
          }
          if (valueNodeId) {
            updateNodeName(valueNodeId, v, userId);
          } else {
            createChild(assocDataId, wsId, userId, v);
          }
        }}
      />
    );
  }

  // Prevent border stacking: when nested FieldRows are first/last, add padding
  // so their border-t/border-b doesn't visually coincide with the parent FieldRow's borders
  const firstIsField = visibleChildren.length > 0 && visibleChildren[0].type === 'field';
  const lastIsField = visibleChildren.length > 0 && visibleChildren[visibleChildren.length - 1].type === 'field';

  return (
    <div className={`min-h-[22px]${firstIsField ? ' pt-1' : ''}${lastIsField ? ' pb-1' : ''}`}>
      {visibleChildren.map(({ id, type }, i) =>
        type === 'field' ? (
          <div key={id} className="@container" style={{ paddingLeft: 6 + 15 + 4 }}>
            <FieldRow
              nodeId={assocDataId}
              attrDefId={fieldMap.get(id)!.attrDefId}
              attrDefName={fieldMap.get(id)!.attrDefName}
              tupleId={id}
              valueNodeId={fieldMap.get(id)!.valueNodeId}
              valueName={fieldMap.get(id)!.valueName}
              dataType={fieldMap.get(id)!.dataType}
              assocDataId={fieldMap.get(id)!.assocDataId}
              isLastInGroup={i === visibleChildren.length - 1 || visibleChildren[i + 1].type !== 'field'}
              trashed={fieldMap.get(id)!.trashed}
              isRequired={fieldMap.get(id)!.isRequired}
              isEmpty={fieldMap.get(id)!.isEmpty}
            />
          </div>
        ) : (
          <OutlinerItem
            key={id}
            nodeId={id}
            depth={0}
            rootChildIds={contentChildIds}
            parentId={assocDataId}
            rootNodeId={assocDataId}
            fieldDataType={fieldDataType}
            attrDefId={attrDefId}
            onNavigateOut={onNavigateOut}
          />
        ),
      )}
      {/* Show TrailingInput only when no content children yet (matches OutlinerItem pattern).
          Users add more values via Enter in existing value nodes. */}
      {contentChildIds.length === 0 && (
        <TrailingInput parentId={assocDataId} depth={0} parentExpandKey={`${entities[assocDataId]?.props._ownerId ?? ''}:${assocDataId}`} fieldDataType={fieldDataType} attrDefId={attrDefId} onNavigateOut={onNavigateOut} />
      )}
    </div>
  );
}

/** Single-select supertag picker for OPTIONS_FROM_SUPERTAG config fields. */
function SupertagPickerField({ assocDataId }: { assocDataId: string }) {
  const tags = useWorkspaceTags();
  const setConfigValue = useNodeStore((s) => s.setConfigValue);
  const userId = useWorkspaceStore((s) => s.userId);

  // Reverse-lookup tupleId from assocDataId (same as BOOLEAN)
  const tupleId = useNodeStore((s) => {
    const assoc = s.entities[assocDataId];
    const parentId = assoc?.props._ownerId;
    const parent = parentId ? s.entities[parentId] : undefined;
    if (!parent?.associationMap) return undefined;
    for (const [tid, aid] of Object.entries(parent.associationMap)) {
      if (aid === assocDataId) return tid;
    }
    return undefined;
  });

  // Read selected value directly from assocData.children[0]
  // (tagDef refs have _docType so contentChildIds would filter them out)
  const selectedId = useNodeStore((s) => {
    const assoc = s.entities[assocDataId];
    return assoc?.children?.[0] || undefined;
  });

  const options: NodePickerOption[] = useMemo(
    () => tags.map((t) => ({ id: t.id, name: t.name, isTagDef: true })),
    [tags],
  );

  const handleSelect = useCallback(
    (id: string) => {
      if (!userId || !tupleId) return;
      setConfigValue(tupleId, id, userId);
    },
    [userId, tupleId, setConfigValue],
  );

  const handleClear = useCallback(() => {
    if (!userId || !tupleId) return;
    setConfigValue(tupleId, '', userId);
  }, [userId, tupleId, setConfigValue]);

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
    <div className="relative">
      <div className="flex min-h-7 items-start gap-2 py-1" style={{ paddingLeft: 25 }}>
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

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
import { useMemo, useRef, useCallback } from 'react';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { useChildren } from '../../hooks/use-children';
import { useNodeFields, type FieldEntry } from '../../hooks/use-node-fields';
import { OutlinerItem } from '../outliner/OutlinerItem';
import { TrailingInput } from '../editor/TrailingInput';
import { FieldRow } from './FieldRow';
import { BulletChevron } from '../outliner/BulletChevron';
import { SYS_D, SYS_V } from '../../types';
import { useWorkspaceStore } from '../../stores/workspace-store';

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

  // --- Special control early returns (Checkbox, Date) ---
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const userId = useWorkspaceStore((s) => s.userId);
  const toggleCheckboxField = useNodeStore((s) => s.toggleCheckboxField);
  const createChild = useNodeStore((s) => s.createChild);
  const updateNodeName = useNodeStore((s) => s.updateNodeName);
  const setFocusedNode = useUIStore((s) => s.setFocusedNode);
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
      <div className="flex min-h-7 items-start gap-2 py-1" style={{ paddingLeft: 25 }}>
        <BulletChevron hasChildren={false} isExpanded={false} onBulletClick={() => {}} dimmed={!currentValue} />
        <DatePickerDisplay
          value={currentValue}
          onSelect={(v) => {
            if (!wsId || !userId) return;
            if (valueNodeId) {
              updateNodeName(valueNodeId, v, userId);
            } else {
              createChild(assocDataId, wsId, userId, v);
            }
          }}
        />
      </div>
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

/** Click-to-pick date display. Hidden native input provides the date picker overlay. */
function DatePickerDisplay({ value, onSelect }: { value: string; onSelect: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    try { input.showPicker(); } catch { /* fallback: input gets focus, user can type */ }
  }, []);

  return (
    <div className="flex-1 min-w-0 flex items-center cursor-pointer relative" onClick={handleClick}>
      <span className={`text-sm leading-[21px] select-none ${value ? '' : 'text-foreground-tertiary'}`}>
        {value ? formatDateDisplay(value) : 'Empty'}
      </span>
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => onSelect(e.target.value)}
        className="absolute w-px h-px opacity-0 pointer-events-none"
        tabIndex={-1}
      />
    </div>
  );
}

/** Format ISO date (YYYY-MM-DD) for display: "Mar 15, 2025" */
function formatDateDisplay(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return dateStr;
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

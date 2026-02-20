/**
 * Single field row: two-column layout with separator line.
 *
 * Three rendering paths:
 *
 * 1. System metadata fields (__system_*__): read-only name + value, not editable
 * 2. System config fields (isSystemConfig): read-only name + description, unified value via FieldValueOutliner
 * 3. Regular fields: editable name, FieldValueOutliner
 *
 * ──────────────────────────────────────
 * [icon] [field name    ] • value node
 *        [description]     • value node 2
 * ──────────────────────────────────────
 */
import { useCallback, useRef, useEffect, useMemo } from 'react';
import { Trash2 } from '../../lib/icons.js';
import { useNodeFields } from '../../hooks/use-node-fields';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import * as loroDoc from '../../lib/loro-doc.js';
import { getFieldTypeIcon, ATTRDEF_CONFIG_MAP, TAGDEF_CONFIG_MAP, resolveMinValue, resolveMaxValue, SYSTEM_FIELD_MAP } from '../../lib/field-utils.js';
import { FieldValueOutliner } from './FieldValueOutliner';
import { FieldNameInput } from './FieldNameInput';
import { ConfigOutliner } from './ConfigOutliner';
import { AutoCollectSection } from './AutoCollectSection';
import { VALIDATED_FIELD_TYPES, validateFieldValue, ValidationWarning } from './field-validation';
import { ATTRDEF_OUTLINER_FIELDS, TAGDEF_OUTLINER_FIELDS } from '../../lib/field-utils.js';
import { SYS_A } from '../../types/index.js';

function focusTrailingInputForParent(parentId: string): boolean {
  const roots = document.querySelectorAll<HTMLElement>('[data-trailing-parent-id]');
  for (const root of roots) {
    if (root.dataset.trailingParentId !== parentId) continue;
    const editor = root.querySelector<HTMLElement>('.ProseMirror');
    if (!editor) continue;
    editor.focus();
    return true;
  }
  return false;
}

interface FieldRowProps {
  nodeId: string;
  attrDefId: string;
  attrDefName: string;
  tupleId: string;
  valueNodeId?: string;
  valueName?: string;
  dataType: string;
  isLastInGroup?: boolean;
  trashed?: boolean;
  /** When true AND isEmpty, show red asterisk on field name */
  isRequired?: boolean;
  /** Field has no value (for required visual hint) */
  isEmpty?: boolean;
  /** Called when arrow navigation escapes field value boundaries */
  onNavigateOut?: (direction: 'up' | 'down') => void;
  /** Owner tag color: tints the field icon and bullet in this color (inherited template items) */
  ownerTagColor?: string;
  /** Hide-field condition from attrDef config (SYS_V.NEVER by default) */
  hideMode?: string;
  /** True when this is a system config field — read-only name, not deletable */
  isSystemConfig?: boolean;
  /** Config field metadata key for looking up icon/description */
  configKey?: string;
}

export function FieldRow({
  nodeId,
  attrDefId,
  attrDefName,
  tupleId,
  valueNodeId,
  valueName,
  dataType,
  isLastInGroup,
  trashed,
  isRequired,
  isEmpty,
  onNavigateOut,
  ownerTagColor,
  isSystemConfig,
  configKey,
}: FieldRowProps) {
  const navigateTo = useUIStore((s) => s.navigateTo);
  const editingFieldNameId = useUIStore((s) => s.editingFieldNameId);
  const setEditingFieldName = useUIStore((s) => s.setEditingFieldName);
  const setFocusedNode = useUIStore((s) => s.setFocusedNode);
  const clearFocus = useUIStore((s) => s.clearFocus);
  // Derive boolean from Set to avoid Zustand infinite re-render (Set creates new reference each time)
  const isTupleInSelectedSet = useUIStore((s) => s.selectedNodeIds.has(tupleId));
  const focusedNodeId = useUIStore((s) => s.focusedNodeId);
  const clearSelection = useUIStore((s) => s.clearSelection);
  const createChild = useNodeStore((s) => s.createChild);
  const moveFieldTuple = useNodeStore((s) => s.moveFieldTuple);
  const removeField = useNodeStore((s) => s.removeField);
  const _version = useNodeStore((s) => s._version);
  const siblingFields = useNodeFields(nodeId);
  const clickOffsetXRef = useRef<number | undefined>(undefined);

  const isSystemField = dataType === '__system_date__' || dataType === '__system_text__' || dataType === '__system_node__';
  const isOutliner = dataType === '__outliner__';
  const isVirtual = tupleId.startsWith('__virtual_');
  const isEditing = editingFieldNameId === tupleId;
  const isFieldSelected = isTupleInSelectedSet && !focusedNodeId && !isEditing;

  // Config metadata for system config fields (icon, description)
  const configDef = configKey
    ? ATTRDEF_CONFIG_MAP.get(configKey) ?? TAGDEF_CONFIG_MAP.get(configKey) ?? ATTRDEF_OUTLINER_FIELDS.find(f => f.key === configKey) ?? TAGDEF_OUTLINER_FIELDS.find(f => f.key === configKey)
    : undefined;
  const Icon = getFieldTypeIcon(dataType);

  // Validation: read first value child of fieldEntry to check value
  const validationWarning = useNodeStore((s) => {
    void s._version;
    if (!VALIDATED_FIELD_TYPES.has(dataType)) return null;
    const tuple = s.getNode(tupleId);
    if (!tuple?.children || tuple.children.length === 0) return null;
    const min = resolveMinValue(attrDefId);
    const max = resolveMaxValue(attrDefId);
    for (const cid of tuple.children) {
      const child = s.getNode(cid);
      if (child && !child.type && child.name) {
        return validateFieldValue(dataType, child.name, { min, max });
      }
    }
    return null;
  });

  // Auto-collect count for SYS_A44 name display
  const isAutoCollect = configKey === SYS_A.AUTOCOLLECT_OPTIONS;
  const autoCollectCount = useNodeStore((s) => {
    void s._version;
    if (!isAutoCollect) return 0;
    const tuple = s.getNode(tupleId);
    // fieldEntry.children = value nodes (no key prefix in new model)
    return Math.max(0, (tuple?.children?.length ?? 0) - 1);
  });

  const siblingFieldIds = useMemo(
    () => new Set(siblingFields.map((f) => f.fieldEntryId)),
    [siblingFields],
  );
  const renderableSiblings = useMemo(() => {
    const parentChildren = useNodeStore.getState().getNode(nodeId)?.children ?? [];
    const result: Array<{ id: string; type: 'field' | 'content' }> = [];
    for (const cid of parentChildren) {
      if (siblingFieldIds.has(cid)) {
        result.push({ id: cid, type: 'field' });
        continue;
      }
      if (!useNodeStore.getState().getNode(cid)?.type) {
        result.push({ id: cid, type: 'content' });
      }
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_version, nodeId, siblingFieldIds]);

  const moveToSibling = useCallback((direction: 'up' | 'down') => {
    const index = renderableSiblings.findIndex((item) => item.type === 'field' && item.id === tupleId);
    if (index < 0) return false;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex >= 0 && targetIndex < renderableSiblings.length) {
      const target = renderableSiblings[targetIndex];
      if (target.type === 'field') {
        clearFocus();
        setEditingFieldName(target.id);
        return true;
      }
      useUIStore.getState().setFocusClickCoords({
        nodeId: target.id,
        parentId: nodeId,
        textOffset: direction === 'up'
          ? (useNodeStore.getState().getNode(target.id)?.name ?? '').length
          : 0,
      });
      setFocusedNode(target.id, nodeId);
      return true;
    }
    if (direction === 'down' && focusTrailingInputForParent(nodeId)) {
      return true;
    }
    if (onNavigateOut) {
      onNavigateOut(direction);
      return true;
    }
    return false;
  }, [renderableSiblings, tupleId, clearFocus, setEditingFieldName, nodeId, setFocusedNode, onNavigateOut]);

  const handleIndentField = useCallback(() => {
    const index = renderableSiblings.findIndex((item) => item.type === 'field' && item.id === tupleId);
    if (index <= 0) return;

    const prev = renderableSiblings[index - 1];
    if (!prev) return;

    if (prev.type === 'field') {
      // Move this tuple under the previous field's tuple directly
      void moveFieldTuple(nodeId, tupleId, prev.id, '');
      return;
    }

    if (prev.type === 'content') {
      void moveFieldTuple(nodeId, tupleId, prev.id, '');
    }
  }, [tupleId, renderableSiblings, nodeId, moveFieldTuple]);

  const handleOutdentField = useCallback(() => {
    const grandparentId = loroDoc.getParentId(nodeId);
    if (!grandparentId) return;
    const grandparent = useNodeStore.getState().getNode(grandparentId);
    if (!grandparent?.children) return;
    // Find the insertion point after the parent node in the grandparent's children.
    let insertAt = grandparent.children.length;
    const parentIndex = grandparent.children.indexOf(nodeId);
    if (parentIndex >= 0) insertAt = parentIndex + 1;
    void moveFieldTuple(nodeId, tupleId, grandparentId, '', insertAt);
  }, [tupleId, nodeId, moveFieldTuple]);

  const handleEnterConfirm = useCallback(() => {
    let insertParentId = nodeId;
    const parent = useNodeStore.getState().getNode(insertParentId);
    if (!parent?.children?.includes(tupleId)) {
      // Fallback: find the parent that contains this tupleId via loroDoc
      const actualParentId = loroDoc.getParentId(tupleId);
      if (actualParentId) insertParentId = actualParentId;
    }

    const actualParent = useNodeStore.getState().getNode(insertParentId);
    const tupleIdx = actualParent?.children?.indexOf(tupleId) ?? -1;
    const position = tupleIdx >= 0 ? tupleIdx + 1 : undefined;

    const newNode = createChild(insertParentId, position);
    setFocusedNode(newNode.id, insertParentId);
  }, [tupleId, nodeId, createChild, setFocusedNode]);

  const handleNameClick = useCallback((e: React.MouseEvent<HTMLSpanElement>) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    clickOffsetXRef.current = e.clientX - rect.left;
    setEditingFieldName(tupleId);
  }, [tupleId, setEditingFieldName]);

  // Keyboard handler for field-selected state: Escape clears, Enter re-edits
  useEffect(() => {
    if (!isFieldSelected) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        // Second Escape: re-enter field name editing so cursor returns
        clearSelection();
        setEditingFieldName(tupleId);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        clearSelection();
        setEditingFieldName(tupleId);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        clearSelection();
        moveToSibling('up');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        clearSelection();
        moveToSibling('down');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFieldSelected, tupleId, clearSelection, setEditingFieldName, moveToSibling]);

  // ─── Path 1: System metadata fields (NDX_SYS_*) — read-only ───
  if (isSystemField) {
    const sysFieldDef = SYSTEM_FIELD_MAP.get(attrDefId);
    const SysIcon = sysFieldDef?.icon;
    const displayText = valueName || '—';
    return (
      <div
        className={`border-t ${isLastInGroup ? 'border-b' : ''} border-border-subtle flex flex-col @sm:flex-row @sm:items-start min-h-[28px]`}
        data-field-row
        data-field-row-id={tupleId}
        data-node-id={tupleId}
        data-parent-id={nodeId}
        data-row-kind="field"
      >
        <div className="flex items-center gap-1 @sm:shrink-0 @sm:w-[130px] min-w-0 h-7 py-1">
          <span className="shrink-0 w-[15px] flex items-center justify-center text-foreground-tertiary">
            {SysIcon && <SysIcon size={12} />}
          </span>
          <span
            className="block text-sm leading-[22px] h-[22px] text-foreground-tertiary truncate cursor-default outline-none focus:ring-1 focus:ring-ring rounded-sm"
            tabIndex={0}
            title={attrDefName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleEnterConfirm();
              } else if (e.key === 'Backspace') {
                e.preventDefault();
                removeField(nodeId, tupleId);
              } else if (e.key === 'Escape') {
                (e.target as HTMLElement).blur();
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                moveToSibling('up');
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                moveToSibling('down');
              } else if (e.key === 'Tab' && !e.shiftKey) {
                e.preventDefault();
                handleIndentField();
              } else if (e.key === 'Tab' && e.shiftKey) {
                e.preventDefault();
                handleOutdentField();
              }
            }}
          >
            {attrDefName}
          </span>
        </div>
        <div className="flex flex-1 min-w-0 items-center min-h-7 py-1" data-field-value>
          {dataType === '__system_node__' && valueNodeId ? (
            <button
              className="text-sm leading-[22px] text-foreground-tertiary hover:text-foreground-secondary cursor-pointer truncate"
              onClick={() => navigateTo(valueNodeId)}
              title={`Navigate to ${displayText}`}
            >
              {displayText}
            </button>
          ) : (
            <span className="text-sm leading-[22px] text-foreground-tertiary truncate">
              {displayText}
            </span>
          )}
        </div>
      </div>
    );
  }

  // ─── Path 2: System config fields — read-only name + description, unified value ───
  if (isSystemConfig) {
    const displayName = isAutoCollect && autoCollectCount > 0
      ? `${attrDefName} (${autoCollectCount})`
      : attrDefName;

    return (
      <div
        className={`border-t ${isLastInGroup ? 'border-b' : ''} border-border-subtle flex flex-col @sm:flex-row @sm:items-start min-h-[28px] py-1.5`}
        data-field-row
        data-field-row-id={tupleId}
        data-node-id={tupleId}
        data-parent-id={nodeId}
        data-row-kind="field"
      >
        {/* Name column — icon + name + description */}
        <div className="flex gap-1 @sm:shrink-0 @sm:w-[180px] min-w-0">
          {Icon ? (
            <span className="shrink-0 w-[15px] flex items-start justify-center text-foreground-tertiary mt-1">
              <Icon size={12} />
            </span>
          ) : (
            <span className="shrink-0 w-[15px]" />
          )}
          <div className="flex-1 min-w-0">
            <span className="block text-sm font-medium leading-[22px] text-foreground">
              {displayName}
            </span>
            {configDef?.description && (
              <span className="block text-xs leading-tight text-foreground-tertiary mt-0.5">
                {configDef.description}
              </span>
            )}
          </div>
        </div>
        {/* Value column — unified rendering */}
        <div className="flex-1 min-w-0 min-h-[22px]" data-field-value>
          {isOutliner ? (
            <ConfigOutliner nodeId={nodeId} />
          ) : isAutoCollect ? (
            <>
              <FieldValueOutliner
                tupleId={tupleId}
                fieldDataType={dataType}
                attrDefId={attrDefId}
                configNodeId={isVirtual ? nodeId : undefined}
                onNavigateOut={onNavigateOut}
              />
              <AutoCollectSection tupleId={tupleId} />
            </>
          ) : (
            <FieldValueOutliner
              tupleId={tupleId}
              fieldDataType={dataType}
              attrDefId={attrDefId}
              configNodeId={isVirtual ? nodeId : undefined}
              onNavigateOut={onNavigateOut}
            />
          )}
        </div>
      </div>
    );
  }

  // ─── Path 3: Regular fields — editable name, FieldValueOutliner ───
  return (
    <div
      className={`relative border-t ${isLastInGroup ? 'border-b' : ''} border-border-subtle flex flex-col @sm:flex-row @sm:items-start min-h-[28px]`}
      data-field-row
      data-field-row-id={tupleId}
      data-node-id={tupleId}
      data-parent-id={nodeId}
      data-row-kind="field"
    >
      {isFieldSelected && (
        <div className="absolute inset-0 bg-selection-row rounded-sm pointer-events-none z-0" />
      )}
      {/* Name column — aligned to first line of value */}
      <div className="flex items-center gap-1 @sm:shrink-0 @sm:w-[130px] min-w-0 h-7 py-1">
        <button
          className={`shrink-0 w-[15px] flex items-center justify-center transition-colors ${ownerTagColor ? '' : 'text-foreground-tertiary hover:text-foreground-secondary'}`}
          onClick={trashed || isVirtual ? undefined : () => navigateTo(attrDefId)}
          title={trashed || isVirtual ? undefined : 'Configure field'}
          style={trashed || isVirtual ? { cursor: 'default' } : ownerTagColor ? { color: ownerTagColor } : undefined}
        >
          {Icon && <Icon size={12} />}
        </button>
        <div
          className={`flex-1 min-w-0 flex items-center gap-0.5${!trashed && !isVirtual && !isEditing ? ' cursor-text' : ''}`}
          onClick={!trashed && !isVirtual && !isEditing ? handleNameClick : undefined}
        >
          {trashed && (
            <span title={`Field "${attrDefName}" has been deleted`}>
              <Trash2 size={12} className="shrink-0 text-foreground-tertiary" />
            </span>
          )}
          {isEditing ? (
            <FieldNameInput
              tupleId={tupleId}
              nodeId={nodeId}
              attrDefId={attrDefId}
              currentName={attrDefName}
              onEnterConfirm={handleEnterConfirm}
              onNavigateRow={moveToSibling}
              onIndentRow={handleIndentField}
              onOutdentRow={handleOutdentField}
              clickOffsetX={clickOffsetXRef.current}
            />
          ) : (
            <span
              className="block text-sm leading-[22px] h-[22px] text-foreground truncate"
              title={attrDefName}
            >
              {attrDefName}
              {isRequired && isEmpty && <span className="text-destructive ml-0.5">*</span>}
            </span>
          )}
        </div>
      </div>
      {/* Value column */}
      <div className="flex flex-1 min-w-0 items-start" data-field-value>
        <div className="flex-1 min-w-0">
          {isOutliner ? (
            <ConfigOutliner nodeId={nodeId} />
          ) : (
            <FieldValueOutliner tupleId={tupleId} fieldDataType={dataType} attrDefId={attrDefId} onNavigateOut={onNavigateOut} />
          )}
        </div>
        {validationWarning && (
          <div className="flex items-center h-7 pr-1">
            <ValidationWarning message={validationWarning} />
          </div>
        )}
      </div>
    </div>
  );
}

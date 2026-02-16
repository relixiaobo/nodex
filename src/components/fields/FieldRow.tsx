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
import { useCallback, useRef, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { getFieldTypeIcon, ATTRDEF_CONFIG_MAP, TAGDEF_CONFIG_MAP, resolveMinValue, resolveMaxValue, SYSTEM_FIELD_MAP } from '../../lib/field-utils.js';
import { FieldValueOutliner } from './FieldValueOutliner';
import { FieldNameInput } from './FieldNameInput';
import { ConfigOutliner } from './ConfigOutliner';
import { AutoCollectSection } from './AutoCollectSection';
import { BulletChevron } from '../outliner/BulletChevron';
import { VALIDATED_FIELD_TYPES, validateFieldValue, ValidationWarning } from './field-validation';
import { ATTRDEF_OUTLINER_FIELDS, TAGDEF_OUTLINER_FIELDS } from '../../lib/field-utils.js';
import { SYS_A } from '../../types/index.js';

const noop = () => {};

interface FieldRowProps {
  nodeId: string;
  attrDefId: string;
  attrDefName: string;
  tupleId: string;
  valueNodeId?: string;
  valueName?: string;
  dataType: string;
  assocDataId?: string;
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
  assocDataId,
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
  // Derive boolean from Set to avoid Zustand infinite re-render (Set creates new reference each time)
  const isTupleInSelectedSet = useUIStore((s) => s.selectedNodeIds.has(tupleId));
  const focusedNodeId = useUIStore((s) => s.focusedNodeId);
  const clearSelection = useUIStore((s) => s.clearSelection);
  const createChild = useNodeStore((s) => s.createChild);
  const removeField = useNodeStore((s) => s.removeField);
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const userId = useWorkspaceStore((s) => s.userId);
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

  // Validation: read first content child of assocData to check value
  const validationWarning = useNodeStore((s) => {
    if (!assocDataId || !VALIDATED_FIELD_TYPES.has(dataType)) return null;
    const assoc = s.entities[assocDataId];
    if (!assoc?.children) return null;
    const min = resolveMinValue(s.entities, attrDefId);
    const max = resolveMaxValue(s.entities, attrDefId);
    for (const cid of assoc.children) {
      const child = s.entities[cid];
      if (child && !child.props._docType && child.props.name) {
        return validateFieldValue(dataType, child.props.name, { min, max });
      }
    }
    return null;
  });

  // Auto-collect count for SYS_A44 name display
  const isAutoCollect = configKey === SYS_A.AUTOCOLLECT_OPTIONS;
  const autoCollectCount = useNodeStore((s) => {
    if (!isAutoCollect) return 0;
    const tuple = s.entities[tupleId];
    return Math.max(0, (tuple?.children?.length ?? 0) - 2);
  });

  const handleEnterConfirm = useCallback(() => {
    if (!wsId || !userId) return;
    const state = useNodeStore.getState();
    const entities = state.entities;

    let insertParentId = nodeId;
    if (!entities[nodeId]?.children?.includes(tupleId)) {
      const fallbackParent = Object.values(entities).find((n) => n.children?.includes(tupleId));
      if (fallbackParent) insertParentId = fallbackParent.id;
    }

    const parent = entities[insertParentId];
    const beforeIds = new Set(parent?.children ?? []);
    const tupleIdx = parent?.children?.indexOf(tupleId) ?? -1;
    const position = tupleIdx >= 0 ? tupleIdx + 1 : undefined;

    const createPromise = createChild(insertParentId, wsId, userId, '', position);

    const optimisticParent = useNodeStore.getState().entities[insertParentId];
    const optimisticNewId = optimisticParent?.children?.find((cid) => !beforeIds.has(cid));
    if (optimisticNewId) setFocusedNode(optimisticNewId, insertParentId);

    createPromise.then((newNode) => {
      if (useNodeStore.getState().entities[newNode.id]) {
        setFocusedNode(newNode.id, insertParentId);
      }
    });
  }, [tupleId, nodeId, wsId, userId, createChild, setFocusedNode]);

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
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFieldSelected, tupleId, clearSelection, setEditingFieldName]);

  // ─── Path 1: System metadata fields (NDX_SYS_*) — read-only ───
  if (isSystemField) {
    const sysFieldDef = SYSTEM_FIELD_MAP.get(attrDefId);
    const SysIcon = sysFieldDef?.icon;
    const displayText = valueName || '—';
    return (
      <div className={`border-t ${isLastInGroup ? 'border-b' : ''} border-border-subtle flex flex-col @sm:flex-row @sm:items-start min-h-[28px]`} data-field-row>
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
                if (wsId && userId) removeField(nodeId, tupleId, wsId, userId);
              } else if (e.key === 'Escape') {
                (e.target as HTMLElement).blur();
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
      <div className={`border-t ${isLastInGroup ? 'border-b' : ''} border-border-subtle flex flex-col @sm:flex-row @sm:items-start min-h-[28px] py-1.5`} data-field-row>
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
              {assocDataId ? (
                <FieldValueOutliner assocDataId={assocDataId} fieldDataType={dataType} attrDefId={attrDefId} />
              ) : (
                <div className="flex min-h-7 items-center gap-2 py-1" style={{ paddingLeft: 6 }}>
                  <BulletChevron hasChildren={false} isExpanded={false} onBulletClick={noop} dimmed />
                  <span className="text-sm leading-[21px] text-foreground-tertiary select-none">Empty</span>
                </div>
              )}
              <AutoCollectSection tupleId={tupleId} />
            </>
          ) : assocDataId ? (
            <FieldValueOutliner assocDataId={assocDataId} fieldDataType={dataType} attrDefId={attrDefId} />
          ) : (
            <div className="flex min-h-7 items-center gap-2 py-1" style={{ paddingLeft: 6 }}>
              <BulletChevron hasChildren={false} isExpanded={false} onBulletClick={noop} dimmed />
              <span className="text-sm leading-[21px] text-foreground-tertiary select-none">Empty</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Path 3: Regular fields — editable name, FieldValueOutliner ───
  return (
    <div className={`relative border-t ${isLastInGroup ? 'border-b' : ''} border-border-subtle flex flex-col @sm:flex-row @sm:items-start min-h-[28px]`} data-field-row>
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
          ) : assocDataId ? (
            <FieldValueOutliner assocDataId={assocDataId} fieldDataType={dataType} attrDefId={attrDefId} onNavigateOut={onNavigateOut} />
          ) : (
            <div className="flex min-h-7 items-start gap-2 py-1" style={{ paddingLeft: 6 }}>
              <BulletChevron hasChildren={false} isExpanded={false} onBulletClick={noop} dimmed bulletColor={ownerTagColor} />
              <span className="text-sm leading-[21px] text-foreground-tertiary select-none">Empty</span>
            </div>
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

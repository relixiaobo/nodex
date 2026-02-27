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
import { useCallback, useRef, useEffect, useMemo, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { Trash2 } from '../../lib/icons.js';
import { useNodeFields } from '../../hooks/use-node-fields';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { useWorkspaceTags } from '../../hooks/use-workspace-tags';
import * as loroDoc from '../../lib/loro-doc.js';
import {
  getFieldTypeIcon,
  ATTRDEF_CONFIG_MAP,
  TAGDEF_CONFIG_MAP,
  resolveMinValue,
  resolveMaxValue,
  SYSTEM_FIELD_MAP,
  FIELD_TYPE_LIST,
  configKeyToPropName,
  resolveConfigValue,
  type ConfigFieldDef,
} from '../../lib/field-utils.js';
import { FieldValueOutliner } from './FieldValueOutliner';
import { FieldNameInput } from './FieldNameInput';
import { ConfigOutliner } from './ConfigOutliner';
import { AutoCollectSection } from './AutoCollectSection';
import { VALIDATED_FIELD_TYPES, validateFieldValue, ValidationWarning } from './field-validation';
import { ATTRDEF_OUTLINER_FIELDS, TAGDEF_OUTLINER_FIELDS } from '../../lib/field-utils.js';
import { FIELD_TYPES, SYS_A, SYS_D, SYS_V } from '../../types/index.js';
import { t } from '../../i18n/strings.js';
import { NodePicker, type NodePickerOption } from './NodePicker';
import { DoneMappingEntries } from './DoneMappingEntries';
import { BulletChevron } from '../outliner/BulletChevron';
import { FIELD_VALUE_INSET } from './field-layout.js';
import { dragState } from '../../hooks/use-drag-select.js';
import { getFlattenedVisibleNodes } from '../../lib/tree-utils.js';
import {
  computeRangeSelection,
  filterToRootLevel,
  getEffectiveSelectionBounds,
  toggleNodeInSelection,
} from '../../lib/selection-utils.js';
import { resolveRowPointerSelectAction } from '../../lib/row-pointer-selection.js';
import { resolveDropHoverPosition } from '../../lib/drag-drop-position.js';
import { resolveDropMove } from '../../lib/drag-drop.js';

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
  /** Explicit config control type for system config rows */
  configControl?: ConfigFieldDef['control'];
  /** Root outliner context for unified range selection across field/content rows */
  rootChildIds?: string[];
  rootNodeId?: string;
}

export const FIELD_ROW_SELECTION_OVERLAY_CLASS =
  'absolute right-0 bg-selection-row rounded-sm border border-primary/[0.15] pointer-events-none';
// Align with OutlinerItem row highlight left edge. FieldRow wrapper starts 4px to the right
// (chevron-bullet gap), so the selection mask compensates with left: -4.
export const FIELD_ROW_SELECTION_OVERLAY_STYLE: CSSProperties = { left: -4, top: 1, bottom: 1 };

export function isFieldRowInteractiveTarget(target: HTMLElement | null): boolean {
  if (!target) return true;
  if (target.closest('button, input, textarea, select, a, label, [role="button"], [contenteditable]')) return true;
  // Value column contains mini outliners/pickers; clicks there should keep their own behavior.
  if (target.closest('[data-field-value]')) return true;
  return false;
}

export function shouldSelectFieldRow(params: {
  isEditing: boolean;
  justDragged: boolean;
  target: HTMLElement | null;
}): boolean {
  const { isEditing, justDragged, target } = params;
  if (isEditing || justDragged) return false;
  return !isFieldRowInteractiveTarget(target);
}

export type FieldRowSelectAction = 'single' | 'toggle' | 'range' | null;

export function resolveFieldRowSelectAction(params: {
  isEditing: boolean;
  justDragged: boolean;
  target: HTMLElement | null;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}): FieldRowSelectAction {
  return resolveRowPointerSelectAction({
    justDragged: params.justDragged,
    metaKey: params.metaKey,
    ctrlKey: params.ctrlKey,
    shiftKey: params.shiftKey,
    isEditing: params.isEditing,
    allowSingle: shouldSelectFieldRow({
      isEditing: params.isEditing,
      justDragged: params.justDragged,
      target: params.target,
    }),
  });
}

function ConfigTagPicker({ nodeId, configKey, placeholder }: { nodeId: string; configKey: string; placeholder: string }) {
  const tags = useWorkspaceTags();
  const setConfigValue = useNodeStore((s) => s.setConfigValue);
  const selectedId = useNodeStore((s) => {
    void s._version;
    const node = s.getNode(nodeId);
    return node ? resolveConfigValue(node, configKey) : undefined;
  });

  const options: NodePickerOption[] = useMemo(
    () => tags.map((t) => ({ id: t.id, name: t.name, isTagDef: true })),
    [tags],
  );

  const propName = configKeyToPropName(configKey);
  const handleSelect = useCallback((id: string) => {
    if (!propName) return;
    setConfigValue(nodeId, propName, id);
  }, [nodeId, propName, setConfigValue]);
  const handleClear = useCallback(() => {
    if (!propName) return;
    setConfigValue(nodeId, propName, undefined);
  }, [nodeId, propName, setConfigValue]);

  return (
    <NodePicker
      options={options}
      selectedId={selectedId}
      onSelect={handleSelect}
      onClear={handleClear}
      placeholder={placeholder}
      isReference
    />
  );
}

function ConfigSelectPicker({
  nodeId,
  configKey,
  options,
  placeholder,
}: {
  nodeId: string;
  configKey: string;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
}) {
  const setConfigValue = useNodeStore((s) => s.setConfigValue);
  const selectedId = useNodeStore((s) => {
    void s._version;
    const node = s.getNode(nodeId);
    return node ? resolveConfigValue(node, configKey) : undefined;
  });
  const pickerOptions: NodePickerOption[] = useMemo(
    () => options.map((o) => ({ id: o.value, name: o.label })),
    [options],
  );

  const propName = configKeyToPropName(configKey);
  const handleSelect = useCallback((id: string) => {
    if (!propName) return;
    setConfigValue(nodeId, propName, id);
  }, [nodeId, propName, setConfigValue]);
  const handleClear = useCallback(() => {
    if (!propName) return;
    setConfigValue(nodeId, propName, undefined);
  }, [nodeId, propName, setConfigValue]);

  return (
    <NodePicker
      options={pickerOptions}
      selectedId={selectedId}
      onSelect={handleSelect}
      onClear={handleClear}
      placeholder={placeholder}
    />
  );
}

function ConfigNumberInput({ nodeId, configKey }: { nodeId: string; configKey: string }) {
  const setConfigValue = useNodeStore((s) => s.setConfigValue);
  const value = useNodeStore((s) => {
    void s._version;
    const node = s.getNode(nodeId);
    return node ? resolveConfigValue(node, configKey) : undefined;
  });
  const propName = configKeyToPropName(configKey);
  const valueText = value === undefined || value === null ? '' : String(value);
  const [draft, setDraft] = useState(valueText);

  useEffect(() => {
    setDraft(valueText);
  }, [valueText]);

  const commitDraft = useCallback(() => {
    if (!propName) return;
    const raw = draft.trim();
    if (!raw) {
      setConfigValue(nodeId, propName, undefined);
      return;
    }
    // Keep same behavior as normal number fields: allow any text, validate via warning only.
    setConfigValue(nodeId, propName, raw);
  }, [draft, nodeId, propName, setConfigValue]);

  return (
    <div className="flex min-h-6 items-center gap-2 py-1" style={{ paddingLeft: FIELD_VALUE_INSET }}>
      <BulletChevron hasChildren={false} isExpanded={false} onBulletClick={() => { }} />
      <input
        type="text"
        inputMode="decimal"
        className="h-[24px] min-w-[120px] bg-transparent p-0 text-[15px] leading-6 text-foreground outline-none placeholder:text-foreground-tertiary"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitDraft();
            (e.currentTarget as HTMLInputElement).blur();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setDraft(valueText);
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        placeholder={t('field.empty')}
      />
    </div>
  );
}

interface SystemConfigValueContext {
  nodeId: string;
  attrDefId: string;
  tupleId: string;
  dataType: string;
  isVirtual: boolean;
  onNavigateOut?: (direction: 'up' | 'down') => void;
  isAutoCollectEnabled: boolean;
  configOptions?: Array<{ value: string; label: string }>;
}

type SystemConfigValueRenderer = (context: SystemConfigValueContext) => ReactNode;

const SYSTEM_CONFIG_VALUE_RENDERERS: Partial<Record<ConfigFieldDef['control'], SystemConfigValueRenderer>> = {
  outliner: ({ nodeId }) => <ConfigOutliner nodeId={nodeId} />,
  color_picker: ({ tupleId, attrDefId, nodeId, isVirtual, onNavigateOut }) => (
    <FieldValueOutliner
      tupleId={tupleId}
      fieldDataType={SYS_D.COLOR}
      attrDefId={attrDefId}
      configNodeId={isVirtual ? nodeId : undefined}
      onNavigateOut={onNavigateOut}
    />
  ),
  toggle: ({ tupleId, attrDefId, nodeId, isVirtual, onNavigateOut }) => (
    <FieldValueOutliner
      tupleId={tupleId}
      fieldDataType={SYS_D.BOOLEAN}
      attrDefId={attrDefId}
      configNodeId={isVirtual ? nodeId : undefined}
      onNavigateOut={onNavigateOut}
    />
  ),
  tag_picker: ({ nodeId, attrDefId }) => (
    <ConfigTagPicker nodeId={nodeId} configKey={attrDefId} placeholder={t('field.selectSupertag')} />
  ),
  type_choice: ({ nodeId, attrDefId }) => (
    <ConfigSelectPicker
      nodeId={nodeId}
      configKey={attrDefId}
      options={FIELD_TYPE_LIST.map((f) => ({ value: f.value, label: f.label }))}
      placeholder={t('field.selectFieldType')}
    />
  ),
  select: ({ nodeId, attrDefId, configOptions }) => (
    <ConfigSelectPicker
      nodeId={nodeId}
      configKey={attrDefId}
      options={configOptions ?? []}
      placeholder={t('field.selectValue')}
    />
  ),
  done_map_entries: ({ nodeId, attrDefId }) => (
    <DoneMappingEntries tagDefId={nodeId} mappingKey={attrDefId} />
  ),
  number_input: ({ nodeId, attrDefId }) => (
    <ConfigNumberInput nodeId={nodeId} configKey={attrDefId} />
  ),
  autocollect: ({ tupleId, attrDefId, nodeId, isVirtual, onNavigateOut, isAutoCollectEnabled }) => (
    <>
      <FieldValueOutliner
        tupleId={tupleId}
        fieldDataType={SYS_D.BOOLEAN}
        attrDefId={attrDefId}
        configNodeId={isVirtual ? nodeId : undefined}
        onNavigateOut={onNavigateOut}
      />
      {isAutoCollectEnabled ? <AutoCollectSection fieldDefId={nodeId} /> : null}
    </>
  ),
};

function renderDefaultSystemConfigValue(context: SystemConfigValueContext): ReactNode {
  return (
    <FieldValueOutliner
      tupleId={context.tupleId}
      fieldDataType={context.dataType}
      attrDefId={context.attrDefId}
      configNodeId={context.isVirtual ? context.nodeId : undefined}
      onNavigateOut={context.onNavigateOut}
    />
  );
}

function renderSystemConfigValue(
  control: ConfigFieldDef['control'] | undefined,
  context: SystemConfigValueContext,
): ReactNode {
  if (!control) return renderDefaultSystemConfigValue(context);

  const renderer = SYSTEM_CONFIG_VALUE_RENDERERS[control];
  if (renderer) return renderer(context);

  if (import.meta.env.DEV) {
    console.warn(`[FieldRow] Unhandled config control "${control}" for ${context.attrDefId}`);
  }
  return renderDefaultSystemConfigValue(context);
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
  configControl,
  rootChildIds,
  rootNodeId,
}: FieldRowProps) {
  const navigateTo = useUIStore((s) => s.navigateTo);
  const editingFieldNameId = useUIStore((s) => s.editingFieldNameId);
  const setEditingFieldName = useUIStore((s) => s.setEditingFieldName);
  const setFocusedNode = useUIStore((s) => s.setFocusedNode);
  const setSelectedNode = useUIStore((s) => s.setSelectedNode);
  const setSelectedNodes = useUIStore((s) => s.setSelectedNodes);
  const clearFocus = useUIStore((s) => s.clearFocus);
  // Derive boolean from Set to avoid Zustand infinite re-render (Set creates new reference each time)
  const isTupleInSelectedSet = useUIStore((s) => s.selectedNodeIds.has(tupleId));
  const focusedNodeId = useUIStore((s) => s.focusedNodeId);
  const clearSelection = useUIStore((s) => s.clearSelection);
  const createChild = useNodeStore((s) => s.createChild);
  const moveFieldEntry = useNodeStore((s) => s.moveFieldEntry);
  const removeField = useNodeStore((s) => s.removeField);
  const _version = useNodeStore((s) => s._version);
  const siblingFields = useNodeFields(nodeId);
  const clickOffsetXRef = useRef<number | undefined>(undefined);
  const rowRef = useRef<HTMLDivElement>(null);

  // Drag state for field row reordering
  const dragNodeId = useUIStore((s) => s.dragNodeId);
  const dropTargetId = useUIStore((s) => s.dropTargetId);
  const dropPosition = useUIStore((s) => s.dropPosition);
  const setDrag = useUIStore((s) => s.setDrag);
  const setDropTarget = useUIStore((s) => s.setDropTarget);
  const moveNodeTo = useNodeStore((s) => s.moveNodeTo);

  const isSystemField = dataType === '__system_date__' || dataType === '__system_text__' || dataType === '__system_node__';
  const isOutliner = dataType === '__outliner__';
  const isVirtual = tupleId.startsWith('__virtual_');
  const isEditing = editingFieldNameId === tupleId;
  const isFieldSelected = isTupleInSelectedSet && !focusedNodeId && !isEditing;

  // Config metadata for system config fields (icon, description)
  const configDef = configKey
    ? ATTRDEF_CONFIG_MAP.get(configKey) ?? TAGDEF_CONFIG_MAP.get(configKey) ?? ATTRDEF_OUTLINER_FIELDS.find(f => f.key === configKey) ?? TAGDEF_OUTLINER_FIELDS.find(f => f.key === configKey)
    : undefined;
  const resolvedControl = configControl ?? configDef?.control;
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

  const configNumberValidationWarning = useNodeStore((s) => {
    void s._version;
    if (!isSystemConfig || resolvedControl !== 'number_input') return null;
    const n = s.getNode(nodeId);
    if (!n) return null;
    const raw = resolveConfigValue(n, attrDefId);
    if (raw === undefined || raw === null || raw === '') return null;
    return validateFieldValue(FIELD_TYPES.NUMBER, String(raw));
  });

  // Auto-collect count for SYS_A44 name display
  const isAutoCollect = configKey === SYS_A.AUTOCOLLECT_OPTIONS;
  const isAutoCollectEnabled = useNodeStore((s) => {
    void s._version;
    if (!isAutoCollect) return false;
    const n = s.getNode(nodeId);
    if (!n) return false;
    const val = resolveConfigValue(n, attrDefId);
    return val !== SYS_V.NO;
  });
  const autoCollectCount = useNodeStore((s) => {
    void s._version;
    if (!isAutoCollect) return 0;
    const fieldDef = s.getNode(nodeId);
    if (!fieldDef?.children) return 0;
    return fieldDef.children.reduce((count, cid) => {
      const child = s.getNode(cid);
      return child && !child.type ? count + 1 : count;
    }, 0);
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

  const selectionRootChildIds = useMemo(
    () => (rootChildIds && rootChildIds.length > 0
      ? rootChildIds
      : renderableSiblings.map((item) => item.id)),
    [rootChildIds, renderableSiblings],
  );
  const selectionRootId = rootNodeId ?? nodeId;
  const getSelectionFlatList = useCallback((expandedNodes: Set<string>) => (
    getFlattenedVisibleNodes(selectionRootChildIds, expandedNodes, selectionRootId)
  ), [selectionRootChildIds, selectionRootId]);

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
      void moveFieldEntry(nodeId, tupleId, prev.id);
      return;
    }

    if (prev.type === 'content') {
      void moveFieldEntry(nodeId, tupleId, prev.id);
    }
  }, [tupleId, renderableSiblings, nodeId, moveFieldEntry]);

  const handleOutdentField = useCallback(() => {
    const grandparentId = loroDoc.getParentId(nodeId);
    if (!grandparentId) return;
    const grandparent = useNodeStore.getState().getNode(grandparentId);
    if (!grandparent?.children) return;
    // Find the insertion point after the parent node in the grandparent's children.
    let insertAt = grandparent.children.length;
    const parentIndex = grandparent.children.indexOf(nodeId);
    if (parentIndex >= 0) insertAt = parentIndex + 1;
    void moveFieldEntry(nodeId, tupleId, grandparentId, insertAt);
  }, [tupleId, nodeId, moveFieldEntry]);

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

  const handleNameDoubleClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    clickOffsetXRef.current = e.clientX - rect.left;
    setEditingFieldName(tupleId);
  }, [tupleId, setEditingFieldName]);

  const handleCmdClick = useCallback(() => {
    const state = useUIStore.getState();
    const newSelection = toggleNodeInSelection(tupleId, state.selectedNodeIds);
    let newAnchor = state.selectionAnchorId;
    if (newAnchor && !newSelection.has(newAnchor)) {
      newAnchor = newSelection.size > 0 ? [...newSelection][0] : null;
    }
    if (!newAnchor && newSelection.has(tupleId)) {
      newAnchor = tupleId;
    }
    setSelectedNodes(newSelection, newAnchor);
  }, [tupleId, setSelectedNodes]);

  const handleShiftClick = useCallback(() => {
    const state = useUIStore.getState();
    const anchor = state.selectionAnchorId;
    if (!anchor) {
      setSelectedNode(tupleId, nodeId, 'global');
      return;
    }
    const flatList = getSelectionFlatList(state.expandedNodes);
    const range = computeRangeSelection(anchor, tupleId, flatList);
    setSelectedNodes(range, anchor);
  }, [tupleId, nodeId, setSelectedNode, setSelectedNodes, getSelectionFlatList]);

  const extendSelectionFromAnchor = useCallback((direction: 'up' | 'down') => {
    const state = useUIStore.getState();
    const anchor = state.selectionAnchorId;
    if (!anchor) return;

    const flatList = getSelectionFlatList(state.expandedNodes);
    const anchorIdx = flatList.findIndex((item) => item.nodeId === anchor);
    if (anchorIdx < 0) return;

    const effectiveBounds = getEffectiveSelectionBounds(state.selectedNodeIds, flatList);
    if (!effectiveBounds) return;

    const { firstIdx, lastIdx } = effectiveBounds;
    let extentIdx: number;
    if (anchorIdx <= firstIdx) {
      extentIdx = lastIdx;
    } else if (anchorIdx >= lastIdx) {
      extentIdx = firstIdx;
    } else {
      extentIdx = direction === 'down' ? lastIdx : firstIdx;
    }

    const newExtentIdx = direction === 'up'
      ? Math.max(0, extentIdx - 1)
      : Math.min(flatList.length - 1, extentIdx + 1);

    const start = Math.min(anchorIdx, newExtentIdx);
    const end = Math.max(anchorIdx, newExtentIdx);
    const rangeIds = new Set<string>();
    for (let i = start; i <= end; i++) {
      rangeIds.add(flatList[i].nodeId);
    }
    const filtered = filterToRootLevel(rangeIds, undefined, flatList);
    setSelectedNodes(filtered, anchor);
  }, [getSelectionFlatList, setSelectedNodes]);

  // ─── Drag handlers for field row reordering ───

  const isDropTarget = dropTargetId === tupleId;
  const isDragging = dragNodeId === tupleId;

  const handleDragStart = useCallback(
    (e: DragEvent) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', tupleId);
      setDrag(tupleId);
    },
    [tupleId, setDrag],
  );

  const handleDragOver = useCallback(
    (e: DragEvent) => {
      if (!dragNodeId || dragNodeId === tupleId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const rect = rowRef.current?.getBoundingClientRect();
      if (!rect) return;

      const position = resolveDropHoverPosition({
        offsetY: e.clientY - rect.top,
        rowHeight: rect.height,
      });
      setDropTarget(tupleId, position);
    },
    [tupleId, dragNodeId, setDropTarget],
  );

  const handleDragLeave = useCallback(() => {
    if (dropTargetId === tupleId) {
      setDropTarget(null, null);
    }
  }, [tupleId, dropTargetId, setDropTarget]);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!dragNodeId || dragNodeId === tupleId) {
        setDrag(null);
        return;
      }

      const dropParentId = nodeId;
      const dropParent = useNodeStore.getState().getNode(dropParentId);
      const siblingIndex = dropParent?.children?.indexOf(tupleId) ?? 0;

      const decision = resolveDropMove({
        dragNodeId,
        targetNodeId: tupleId,
        targetParentId: dropParentId,
        targetParentKey: `${nodeId}:${tupleId}`,
        siblingIndex,
        dropPosition,
        targetHasChildren: false,
        targetIsExpanded: false,
      });

      if (decision) {
        moveNodeTo(dragNodeId, decision.newParentId, decision.position);
      }

      setDrag(null);
    },
    [dragNodeId, tupleId, nodeId, dropPosition, moveNodeTo, setDrag],
  );

  const handleDragEnd = useCallback(() => {
    setDrag(null);
  }, [setDrag]);

  const handleFieldRowClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target instanceof HTMLElement ? e.target : null;
    const action = resolveFieldRowSelectAction({
      isEditing,
      justDragged: dragState.justDragged,
      target,
      metaKey: e.metaKey,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
    });
    if (!action) return;
    setEditingFieldName(null);
    if (action === 'toggle') {
      e.preventDefault();
      handleCmdClick();
      return;
    }
    if (action === 'range') {
      e.preventDefault();
      handleShiftClick();
      return;
    }
    // Plain click on non-interactive name area enters field-name editing.
    // Selection is handled only by modifier/range/drag flows, same as content rows.
    if (!trashed && !isVirtual && !isSystemConfig && !isSystemField) {
      clearSelection();
      setEditingFieldName(tupleId);
    }
  }, [
    isEditing,
    tupleId,
    clearSelection,
    setEditingFieldName,
    handleCmdClick,
    handleShiftClick,
    trashed,
    isVirtual,
    isSystemConfig,
    isSystemField,
  ]);

  // Keyboard handler for field-selected state: Escape clears, Enter re-edits
  useEffect(() => {
    if (!isFieldSelected) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && e.key === 'ArrowUp') {
        e.preventDefault();
        extendSelectionFromAnchor('up');
      } else if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && e.key === 'ArrowDown') {
        e.preventDefault();
        extendSelectionFromAnchor('down');
      } else if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key === 'Escape') {
        e.preventDefault();
        // Second Escape: re-enter field name editing so cursor returns
        clearSelection();
        setEditingFieldName(tupleId);
      } else if (!e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && e.key === 'Enter') {
        e.preventDefault();
        clearSelection();
        setEditingFieldName(tupleId);
      } else if (!e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && e.key === 'ArrowUp') {
        e.preventDefault();
        clearSelection();
        moveToSibling('up');
      } else if (!e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && e.key === 'ArrowDown') {
        e.preventDefault();
        clearSelection();
        moveToSibling('down');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFieldSelected, tupleId, clearSelection, setEditingFieldName, moveToSibling, extendSelectionFromAnchor]);

  // ─── Path 1: System metadata fields (NDX_SYS_*) — read-only ───
  if (isSystemField) {
    const sysFieldDef = SYSTEM_FIELD_MAP.get(attrDefId);
    const SysIcon = sysFieldDef?.icon;
    const displayText = valueName || '—';
    return (
      <div
        className={`border-t ${isLastInGroup ? 'border-b' : ''} border-border-subtle flex flex-col @sm:flex-row @sm:items-start min-h-6`}
        data-field-row
        data-field-row-id={tupleId}
        data-node-id={tupleId}
        data-parent-id={nodeId}
        data-row-kind="field"
        onClick={handleFieldRowClick}
      >
        <div className="flex items-center gap-1 @sm:shrink-0 @sm:w-[130px] min-w-0 min-h-6 py-1">
          <span className="shrink-0 w-[15px] flex items-center justify-center text-foreground-tertiary">
            {SysIcon && <SysIcon size={12} />}
          </span>
          <span
            className="block text-[15px] leading-6 h-6 text-foreground-tertiary truncate cursor-default outline-none focus:ring-1 focus:ring-ring rounded-sm"
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
        <div className="flex flex-1 min-w-0 items-start min-h-6 py-1" data-field-value>
          {dataType === '__system_node__' && valueNodeId ? (
            <button
              className="text-[15px] leading-6 text-foreground-tertiary hover:text-foreground-secondary cursor-pointer truncate"
              onClick={() => navigateTo(valueNodeId)}
              title={`Navigate to ${displayText}`}
            >
              {displayText}
            </button>
          ) : (
            <span className="text-[15px] leading-6 text-foreground-tertiary truncate">
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
    const systemConfigValueContext: SystemConfigValueContext = {
      nodeId,
      attrDefId,
      tupleId,
      dataType,
      isVirtual,
      onNavigateOut,
      isAutoCollectEnabled,
      configOptions: configDef?.options,
    };

    return (
      <div
        className={`border-t ${isLastInGroup ? 'border-b' : ''} border-border-subtle flex flex-col @sm:flex-row @sm:items-start min-h-6 py-1 relative has-[.field-overlay-open]:z-[80]`}
        data-field-row
        data-field-row-id={tupleId}
        data-node-id={tupleId}
        data-parent-id={nodeId}
        data-row-kind="field"
        onClick={handleFieldRowClick}
      >
        {/* Name column — icon + name + description */}
        <div className="flex gap-1 @sm:shrink-0 @sm:w-[180px] min-w-0 min-h-6 py-1">
          {Icon ? (
            <span className="shrink-0 w-[15px] flex items-start justify-center text-foreground-tertiary mt-1.5">
              <Icon size={12} />
            </span>
          ) : (
            <span className="shrink-0 w-[15px]" />
          )}
          <div className="flex-1 min-w-0">
            <span className="block text-[15px] font-medium leading-6 text-foreground">
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
        <div className="flex flex-1 min-w-0 items-start py-1" data-field-value>
          <div className="flex-1 min-w-0 min-h-[22px]">
            {renderSystemConfigValue(resolvedControl, systemConfigValueContext)}
          </div>
          {configNumberValidationWarning && (
            <div className="flex items-center min-h-6 py-1 pr-1">
              <ValidationWarning message={configNumberValidationWarning} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Path 3: Regular fields — editable name, FieldValueOutliner ───
  return (
    <div className={`relative ${isDropTarget && dropPosition === 'before' ? '' : ''}`}>
      {/* Drop indicator: before */}
      {isDropTarget && dropPosition === 'before' && (
        <div className="h-0.5 bg-primary rounded-full" />
      )}
      <div
        ref={rowRef}
        className={`relative border-t ${isLastInGroup ? 'border-b' : ''} border-border-subtle flex flex-col @sm:flex-row @sm:items-start min-h-6 has-[.field-overlay-open]:z-[80] ${isDropTarget && dropPosition === 'inside' ? 'bg-primary/10 ring-1 ring-primary/30 rounded-sm' : ''} ${isDragging ? 'opacity-40' : ''}`}
        data-field-row
        data-field-row-id={tupleId}
        data-node-id={tupleId}
        data-parent-id={nodeId}
        data-row-kind="field"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
        onClick={handleFieldRowClick}
      >
        {isFieldSelected && (
          <div className={FIELD_ROW_SELECTION_OVERLAY_CLASS} style={FIELD_ROW_SELECTION_OVERLAY_STYLE} />
        )}
      {/* Name column — aligned to first line of value */}
      <div className="relative z-[1] flex items-center gap-1 @sm:shrink-0 @sm:w-[130px] min-w-0 min-h-6 py-1">
        {/* Field icon is the drag handle for reorder */}
        <button
          className={`shrink-0 w-[15px] flex items-center justify-center transition-colors ${!isVirtual && !isSystemField && !isSystemConfig ? 'cursor-grab active:cursor-grabbing' : ''} ${ownerTagColor ? '' : 'text-foreground-tertiary hover:text-foreground-secondary'}`}
          onClick={trashed || isVirtual ? undefined : () => navigateTo(attrDefId)}
          title={trashed || isVirtual ? undefined : 'Configure field'}
          style={trashed || isVirtual ? { cursor: 'default' } : ownerTagColor ? { color: ownerTagColor } : undefined}
          draggable={!isVirtual && !isSystemField && !isSystemConfig}
          onDragStart={!isVirtual && !isSystemField && !isSystemConfig ? handleDragStart : undefined}
        >
          {Icon && <Icon size={12} />}
        </button>
        <div
          className={`flex-1 min-w-0 flex items-center gap-0.5${!trashed && !isVirtual && !isEditing ? ' cursor-text' : ''}`}
          onDoubleClick={!trashed && !isVirtual && !isEditing ? handleNameDoubleClick : undefined}
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
              className="block text-[15px] leading-6 h-6 text-foreground truncate"
              title={attrDefName}
            >
              {attrDefName}
              {isRequired && isEmpty && <span className="text-destructive ml-0.5">*</span>}
            </span>
          )}
        </div>
      </div>
      {/* Value column */}
      <div className="relative z-[1] flex flex-1 min-w-0 items-start" data-field-value>
        <div className="flex-1 min-w-0">
          {isOutliner ? (
            <ConfigOutliner nodeId={nodeId} />
          ) : (
            <FieldValueOutliner tupleId={tupleId} fieldDataType={dataType} attrDefId={attrDefId} onNavigateOut={onNavigateOut} />
          )}
        </div>
        {validationWarning && (
          <div className="flex items-center min-h-6 py-1 pr-1">
            <ValidationWarning message={validationWarning} />
          </div>
        )}
      </div>
      </div>
      {/* Drop indicator: after */}
      {isDropTarget && dropPosition === 'after' && (
        <div className="h-0.5 bg-primary rounded-full" />
      )}
    </div>
  );
}

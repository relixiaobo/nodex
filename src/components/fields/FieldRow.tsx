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
import { Trash2, type AppIcon } from '../../lib/icons.js';
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
  resolveConfigValueWithDefault,
  type ConfigFieldDef,
} from '../../lib/field-utils.js';
import { FieldValueOutliner } from './FieldValueOutliner';
import { FieldNameInput } from './FieldNameInput';
import { ConfigOutliner } from './ConfigOutliner';
import { AutoCollectSection } from './AutoCollectSection';
import { AutoInitGroup } from './AutoInitGroup';
import { VALIDATED_FIELD_TYPES, validateFieldValue, ValidationWarning } from './field-validation';
import { ATTRDEF_OUTLINER_FIELDS, TAGDEF_OUTLINER_FIELDS } from '../../lib/field-utils.js';
import { FIELD_TYPES, SYS_A, SYS_D, SYS_V } from '../../types/index.js';
import { t } from '../../i18n/strings.js';
import { NodePicker, type NodePickerOption } from './NodePicker';
import { DoneMappingEntries } from './DoneMappingEntries';
import { BulletChevron } from '../outliner/BulletChevron';
import { FieldValueRow } from './FieldValueRow.js';
import { FIELD_VALUE_INSET } from './field-layout.js';
import { dragState } from '../../hooks/use-drag-select.js';
import { resolveRowPointerSelectAction } from '../../lib/row-pointer-selection.js';
import { resolveDropHoverPosition } from '../../lib/drag-drop-position.js';
import { resolveDropMove } from '../../lib/drag-drop.js';
import { OutlinerRow, useRowSelectionState, useRowPointerHandlers } from '../outliner/OutlinerRow.js';
import { canCreateChildrenUnder, getNodeCapabilities } from '../../lib/node-capabilities.js';

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
  fieldEntryId: string;
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
const FIELD_ROW_LAYOUT_CLASS =
  'grid grid-cols-1 gap-y-1.5 py-1 @md:grid-cols-[clamp(10rem,32%,15rem)_minmax(0,1fr)] @md:gap-x-3 @md:gap-y-0';
const FIELD_ROW_NAME_COLUMN_CLASS = 'relative z-[1] flex items-start gap-2 min-w-0';
const FIELD_ROW_VALUE_COLUMN_CLASS = 'relative z-[1] flex min-w-0 items-start';
const FIELD_ROW_ICON_CLASS = 'shrink-0 w-[15px] h-6 self-start flex items-center justify-center';
const noopBulletClick = () => {};

function FieldLeadingBullet({
  icon,
  color,
  interactive = true,
  tooltipLabel,
  draggable = false,
  onDragStart,
  onClick,
}: {
  icon: AppIcon | null;
  color?: string;
  interactive?: boolean;
  tooltipLabel?: string;
  draggable?: boolean;
  onDragStart?: (event: DragEvent) => void;
  onClick?: () => void;
}) {
  if (!icon) {
    return <span className={FIELD_ROW_ICON_CLASS} />;
  }

  return (
    <div
      className={draggable ? 'cursor-grab active:cursor-grabbing' : undefined}
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
    >
      <BulletChevron
        hasChildren={false}
        isExpanded={false}
        onBulletClick={interactive && onClick ? onClick : noopBulletClick}
        interactive={interactive}
        tooltipLabel={tooltipLabel}
        icon={icon}
        bulletColors={color ? [color] : undefined}
      />
    </div>
  );
}

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
    return resolveConfigValueWithDefault(node, configKey);
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
  options: Array<{ value: string; label: string; icon?: AppIcon }>;
  placeholder: string;
}) {
  const setConfigValue = useNodeStore((s) => s.setConfigValue);
  const selectedId = useNodeStore((s) => {
    void s._version;
    const node = s.getNode(nodeId);
    return resolveConfigValueWithDefault(node, configKey);
  });
  const pickerOptions: NodePickerOption[] = useMemo(
    () => options.map((o) => ({ id: o.value, name: o.label, icon: o.icon })),
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
    return resolveConfigValueWithDefault(node, configKey);
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
    <FieldValueRow>
      <input
        type="text"
        inputMode="decimal"
        className="h-6 min-w-[120px] bg-transparent p-0 text-[15px] leading-6 text-foreground outline-none placeholder:text-foreground/20"
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
        placeholder={t('field.emptyNumber')}
      />
    </FieldValueRow>
  );
}

interface SystemConfigValueContext {
  nodeId: string;
  attrDefId: string;
  fieldEntryId: string;
  dataType: string;
  isVirtual: boolean;
  onNavigateOut?: (direction: 'up' | 'down') => void;
  configOptions?: Array<{ value: string; label: string }>;
}

type SystemConfigValueRenderer = (context: SystemConfigValueContext) => ReactNode;

const SYSTEM_CONFIG_VALUE_RENDERERS: Partial<Record<ConfigFieldDef['control'], SystemConfigValueRenderer>> = {
  outliner: ({ nodeId, onNavigateOut }) => <ConfigOutliner nodeId={nodeId} onNavigateOut={onNavigateOut} />,
  color_picker: ({ fieldEntryId, attrDefId, nodeId, isVirtual, onNavigateOut }) => (
    <FieldValueOutliner
      fieldEntryId={fieldEntryId}
      fieldDataType={SYS_D.COLOR}
      attrDefId={attrDefId}
      configNodeId={isVirtual ? nodeId : undefined}
      onNavigateOut={onNavigateOut}
    />
  ),
  toggle: ({ fieldEntryId, attrDefId, nodeId, isVirtual, onNavigateOut }) => (
    <FieldValueOutliner
      fieldEntryId={fieldEntryId}
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
      options={FIELD_TYPE_LIST.map((f) => ({ value: f.value, label: f.label, icon: getFieldTypeIcon(f.value) }))}
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
  autocollect_list: ({ nodeId }) => (
    <AutoCollectSection fieldDefId={nodeId} />
  ),
  auto_init_group: ({ nodeId }) => (
    <AutoInitGroup fieldDefId={nodeId} />
  ),
};

function renderDefaultSystemConfigValue(context: SystemConfigValueContext): ReactNode {
  return (
    <FieldValueOutliner
      fieldEntryId={context.fieldEntryId}
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
  fieldEntryId,
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
  const clearFocus = useUIStore((s) => s.clearFocus);
  const clearSelection = useUIStore((s) => s.clearSelection);
  // Unified selection state + pointer handlers from OutlinerRow
  const { isSelected: isFieldSelected } = useRowSelectionState(fieldEntryId, nodeId);
  const { handleCmdClick, handleShiftClick } = useRowPointerHandlers(
    fieldEntryId, nodeId, rootChildIds ?? [], rootNodeId ?? nodeId,
  );
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
  const isVirtual = fieldEntryId.startsWith('__virtual_');
  const isEditing = editingFieldNameId === fieldEntryId;

  // Config metadata for system config fields (icon, description)
  const configDef = configKey
    ? ATTRDEF_CONFIG_MAP.get(configKey) ?? TAGDEF_CONFIG_MAP.get(configKey) ?? ATTRDEF_OUTLINER_FIELDS.find(f => f.key === configKey) ?? TAGDEF_OUTLINER_FIELDS.find(f => f.key === configKey)
    : undefined;
  const resolvedControl = configControl ?? configDef?.control;
  const Icon = getFieldTypeIcon(dataType);
  const fieldDescription = useNodeStore((s) => {
    void s._version;
    const fieldDef = attrDefId ? s.getNode(attrDefId) : null;
    return fieldDef?.type === 'fieldDef' ? fieldDef.description : undefined;
  });
  const canEditFieldDefinition = useNodeStore((s) => {
    void s._version;
    const fieldDef = attrDefId ? s.getNode(attrDefId) : null;
    return fieldDef?.type === 'fieldDef' ? getNodeCapabilities(attrDefId).canEditNode : false;
  });
  const canManageFieldStructure = useNodeStore((s) => {
    void s._version;
    return canCreateChildrenUnder(nodeId);
  });

  // Validation: read first value child of fieldEntry to check value
  const validationWarning = useNodeStore((s) => {
    void s._version;
    if (!VALIDATED_FIELD_TYPES.has(dataType)) return null;
    const fieldEntry = s.getNode(fieldEntryId);
    if (!fieldEntry?.children || fieldEntry.children.length === 0) return null;
    const min = resolveMinValue(attrDefId);
    const max = resolveMaxValue(attrDefId);
    for (const cid of fieldEntry.children) {
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

  // Auto-collect count for "Collected values" list row name display.
  const isAutoCollectList = configKey === '__AUTOCOLLECT_LIST__';
  const autoCollectCount = useNodeStore((s) => {
    void s._version;
    if (!isAutoCollectList) return 0;
    const fieldDef = s.getNode(nodeId);
    if (!fieldDef?.children) return 0;
    return fieldDef.children.filter((id) => {
      const n = s.getNode(id);
      return n && !n.type && n.autoCollected;
    }).length;
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
    const index = renderableSiblings.findIndex((item) => item.type === 'field' && item.id === fieldEntryId);
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
  }, [renderableSiblings, fieldEntryId, clearFocus, setEditingFieldName, nodeId, setFocusedNode, onNavigateOut]);

  const handleIndentField = useCallback(() => {
    if (!canManageFieldStructure) return;
    const index = renderableSiblings.findIndex((item) => item.type === 'field' && item.id === fieldEntryId);
    if (index <= 0) return;

    const prev = renderableSiblings[index - 1];
    if (!prev) return;

    if (prev.type === 'field') {
      // Move this field entry under the previous field entry directly
      void moveFieldEntry(nodeId, fieldEntryId, prev.id);
      return;
    }

    if (prev.type === 'content') {
      void moveFieldEntry(nodeId, fieldEntryId, prev.id);
    }
  }, [canManageFieldStructure, fieldEntryId, renderableSiblings, nodeId, moveFieldEntry]);

  const handleOutdentField = useCallback(() => {
    if (!canManageFieldStructure) return;
    const grandparentId = loroDoc.getParentId(nodeId);
    if (!grandparentId) return;
    const grandparent = useNodeStore.getState().getNode(grandparentId);
    if (!grandparent?.children) return;
    // Find the insertion point after the parent node in the grandparent's children.
    let insertAt = grandparent.children.length;
    const parentIndex = grandparent.children.indexOf(nodeId);
    if (parentIndex >= 0) insertAt = parentIndex + 1;
    void moveFieldEntry(nodeId, fieldEntryId, grandparentId, insertAt);
  }, [canManageFieldStructure, fieldEntryId, nodeId, moveFieldEntry]);

  const handleEnterConfirm = useCallback(() => {
    if (!canManageFieldStructure) return;
    let insertParentId = nodeId;
    const parent = useNodeStore.getState().getNode(insertParentId);
    if (!parent?.children?.includes(fieldEntryId)) {
      // Fallback: find the parent that contains this fieldEntryId via loroDoc
      const actualParentId = loroDoc.getParentId(fieldEntryId);
      if (actualParentId) insertParentId = actualParentId;
    }

    const actualParent = useNodeStore.getState().getNode(insertParentId);
    const fieldEntryIdx = actualParent?.children?.indexOf(fieldEntryId) ?? -1;
    const position = fieldEntryIdx >= 0 ? fieldEntryIdx + 1 : undefined;

    const newNode = createChild(insertParentId, position);
    setFocusedNode(newNode.id, insertParentId);
  }, [canManageFieldStructure, fieldEntryId, nodeId, createChild, setFocusedNode]);

  const handleNameDoubleClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (!canEditFieldDefinition || !canManageFieldStructure) return;
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    clickOffsetXRef.current = e.clientX - rect.left;
    setEditingFieldName(fieldEntryId);
  }, [canEditFieldDefinition, canManageFieldStructure, fieldEntryId, setEditingFieldName]);

  // Field-specific keyboard pre-processing for selection mode:
  // ArrowUp/Down navigates between sibling rows (field→field or field→content)
  const handleFieldSelectionKeydown = useCallback((e: KeyboardEvent): boolean => {
    if (!e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        clearSelection();
        moveToSibling('up');
        return true;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        clearSelection();
        moveToSibling('down');
        return true;
      }
    }
    return false;
  }, [clearSelection, moveToSibling]);

  // ─── Drag handlers for field row reordering ───

  const isDropTarget = dropTargetId === fieldEntryId;
  const isDragging = dragNodeId === fieldEntryId;

  const handleDragStart = useCallback(
    (e: DragEvent) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', fieldEntryId);
      setDrag(fieldEntryId);
    },
    [fieldEntryId, setDrag],
  );

  const handleDragOver = useCallback(
    (e: DragEvent) => {
      if (!dragNodeId || dragNodeId === fieldEntryId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const rect = rowRef.current?.getBoundingClientRect();
      if (!rect) return;

      const position = resolveDropHoverPosition({
        offsetY: e.clientY - rect.top,
        rowHeight: rect.height,
      });
      setDropTarget(fieldEntryId, position);
    },
    [fieldEntryId, dragNodeId, setDropTarget],
  );

  const handleDragLeave = useCallback(() => {
    if (dropTargetId === fieldEntryId) {
      setDropTarget(null, null);
    }
  }, [fieldEntryId, dropTargetId, setDropTarget]);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!dragNodeId || dragNodeId === fieldEntryId) {
        setDrag(null);
        return;
      }

      const dropParentId = nodeId;
      const dropParent = useNodeStore.getState().getNode(dropParentId);
      const siblingIndex = dropParent?.children?.indexOf(fieldEntryId) ?? 0;

      const decision = resolveDropMove({
        dragNodeId,
        targetNodeId: fieldEntryId,
        targetParentId: dropParentId,
        targetParentKey: `${nodeId}:${fieldEntryId}`,
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
    [dragNodeId, fieldEntryId, nodeId, dropPosition, moveNodeTo, setDrag],
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
    if (!trashed && !isVirtual && !isSystemConfig && !isSystemField && canEditFieldDefinition && canManageFieldStructure) {
      clearSelection();
      setEditingFieldName(fieldEntryId);
    }
  }, [
    isEditing,
    fieldEntryId,
    clearSelection,
    setEditingFieldName,
    handleCmdClick,
    handleShiftClick,
    trashed,
    isVirtual,
    isSystemConfig,
    isSystemField,
    canEditFieldDefinition,
    canManageFieldStructure,
  ]);

  // ─── Path 1: System metadata fields (NDX_SYS_*) — read-only ───
  if (isSystemField) {
    const sysFieldDef = SYSTEM_FIELD_MAP.get(attrDefId);
    const SysIcon = sysFieldDef?.icon;
    const displayText = valueName || '—';
    return (
      <div
        className={`border-t ${isLastInGroup ? 'border-b' : ''} border-border-subtle min-h-6 ${FIELD_ROW_LAYOUT_CLASS}`}
        data-field-row
        data-field-row-id={fieldEntryId}
        data-node-id={fieldEntryId}
        data-parent-id={nodeId}
        data-row-kind="field"
        onClick={handleFieldRowClick}
      >
        <div className={FIELD_ROW_NAME_COLUMN_CLASS}>
          <FieldLeadingBullet icon={SysIcon ?? null} interactive={false} />
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
                removeField(nodeId, fieldEntryId);
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
        <div className={FIELD_ROW_VALUE_COLUMN_CLASS} data-field-value>
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
    const displayName = isAutoCollectList && autoCollectCount > 0
      ? `${attrDefName} (${autoCollectCount})`
      : attrDefName;
    const systemConfigValueContext: SystemConfigValueContext = {
      nodeId,
      attrDefId,
      fieldEntryId,
      dataType,
      isVirtual,
      onNavigateOut,
      configOptions: configDef?.options,
    };

    return (
      <div
        className={`border-t ${isLastInGroup ? 'border-b' : ''} border-border-subtle min-h-6 relative has-[.field-overlay-open]:z-[80] ${FIELD_ROW_LAYOUT_CLASS}`}
        data-field-row
        data-field-row-id={fieldEntryId}
        data-node-id={fieldEntryId}
        data-parent-id={nodeId}
        data-row-kind="field"
        onClick={handleFieldRowClick}
      >
        {/* Name column — icon + name + description */}
        <div className={FIELD_ROW_NAME_COLUMN_CLASS}>
          <FieldLeadingBullet
            icon={Icon}
            interactive={false}
          />
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
        <div className={FIELD_ROW_VALUE_COLUMN_CLASS} data-field-value>
          <div className="flex-1 min-w-0 min-h-6">
            {renderSystemConfigValue(resolvedControl, systemConfigValueContext)}
          </div>
          {configNumberValidationWarning && (
            <div className="flex items-center h-6 pr-1">
              <ValidationWarning message={configNumberValidationWarning} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Path 3: Regular fields — editable name, FieldValueOutliner ───
  return (
    <OutlinerRow
      config={{
        rowId: fieldEntryId,
        parentId: nodeId,
        rootChildIds: rootChildIds ?? renderableSiblings.map((item) => item.id),
        rootNodeId: rootNodeId ?? nodeId,
        isEditing,
        enterEdit: () => setEditingFieldName(fieldEntryId),
        exitEdit: () => setEditingFieldName(null),
        rowKind: 'field',
        onSelectionKeydown: handleFieldSelectionKeydown,
        onBatchDelete: (id) => removeField(nodeId, id),
      }}
    >
      <div className={`relative ${isDropTarget && dropPosition === 'before' ? '' : ''}`}>
      {/* Drop indicator: before */}
      {isDropTarget && dropPosition === 'before' && (
        <div className="h-0.5 bg-primary rounded-full" />
      )}
      <div
        ref={rowRef}
        className={`relative border-t ${isLastInGroup ? 'border-b' : ''} border-border-subtle min-h-6 has-[.field-overlay-open]:z-[80] ${FIELD_ROW_LAYOUT_CLASS} ${isDropTarget && dropPosition === 'inside' ? 'bg-primary/10 ring-1 ring-primary/30 rounded-sm' : ''} ${isDragging ? 'opacity-40' : ''}`}
        data-field-row
        data-field-row-id={fieldEntryId}
        data-node-id={fieldEntryId}
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
      <div className={FIELD_ROW_NAME_COLUMN_CLASS}>
        {/* Field icon is the drag handle for reorder */}
        <FieldLeadingBullet
          icon={Icon}
          color={ownerTagColor}
          interactive={!trashed && !isVirtual}
          tooltipLabel={!trashed && !isVirtual ? t('field.configureField') : undefined}
          draggable={canEditFieldDefinition && canManageFieldStructure && !trashed && !isVirtual && !isSystemField && !isSystemConfig}
          onDragStart={handleDragStart}
          onClick={!trashed && !isVirtual ? () => navigateTo(attrDefId) : undefined}
        />
        <div
          className={`flex-1 min-w-0 flex items-start gap-0.5${!trashed && !isVirtual && !isEditing && canEditFieldDefinition && canManageFieldStructure ? ' cursor-text' : ''}`}
          onDoubleClick={!trashed && !isVirtual && !isEditing && canEditFieldDefinition && canManageFieldStructure ? handleNameDoubleClick : undefined}
        >
          {trashed && (
            <span title={`Field "${attrDefName}" has been deleted`}>
              <Trash2 size={12} className="shrink-0 text-foreground-tertiary" />
            </span>
          )}
          {isEditing ? (
            <FieldNameInput
              fieldEntryId={fieldEntryId}
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
            <div className="min-w-0">
              <span
                className={`block text-[15px] leading-6 min-h-6 truncate ${trashed ? 'text-foreground-tertiary line-through' : !attrDefName || attrDefName === t('common.untitled') ? 'text-foreground/20' : 'text-foreground'}`}
                title={trashed ? `Field "${attrDefName}" has been deleted` : attrDefName}
              >
                {!attrDefName || attrDefName === t('common.untitled') ? t('field.fieldNamePlaceholder') : attrDefName}
                {isRequired && isEmpty && !trashed && <span className="text-destructive ml-0.5">*</span>}
              </span>
              {fieldDescription && (
                <span className="block text-xs leading-tight text-foreground-tertiary mt-0.5">
                  {fieldDescription}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      {/* Value column */}
      <div className={FIELD_ROW_VALUE_COLUMN_CLASS} data-field-value>
        <div className="flex-1 min-w-0">
          {isOutliner ? (
            <ConfigOutliner nodeId={nodeId} onNavigateOut={onNavigateOut} />
          ) : (
            <FieldValueOutliner fieldEntryId={fieldEntryId} fieldDataType={dataType} attrDefId={attrDefId} onNavigateOut={onNavigateOut} />
          )}
        </div>
        {validationWarning && (
          <div className="flex items-center h-8 pr-1">
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
    </OutlinerRow>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import type { EditorView } from 'prosemirror-view';
import { useNode } from '../../hooks/use-node';
import { useChildren } from '../../hooks/use-children';
import { useNodeTags } from '../../hooks/use-node-tags';
import { useNodeFields, type FieldEntry } from '../../hooks/use-node-fields';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import * as loroDoc from '../../lib/loro-doc.js';
import { CONTAINER_IDS } from '../../types/index.js';
import type { NodeType } from '../../types/index.js';
import { BulletChevron, ChevronButton } from './BulletChevron';
import { RichTextEditor, type EditorContentPayload, type TriggerAnchorRect } from '../editor/RichTextEditor';
import { SlashCommandMenu } from '../editor/SlashCommandMenu';
import { TrailingInput } from '../editor/TrailingInput';
import { TagBar } from '../tags/TagBar';
import { TagSelector, type TagDropdownHandle } from '../tags/TagSelector';
import { ReferenceSelector, type ReferenceDropdownHandle } from '../references/ReferenceSelector';
import { FieldRow } from '../fields/FieldRow';
import { FIELD_OVERLAY_Z_INDEX } from '../fields/field-layout.js';
import { toFieldRowEntryProps } from '../fields/field-row-props.js';
import { SYS_V } from '../../types/index.js';
import { useFieldOptions } from '../../hooks/use-field-options.js';
import { resolveInlineReferenceTextColor, resolveTagColor } from '../../lib/tag-colors.js';
import {
  isCheckboxFieldType,
  isOptionsFieldType,
  isSingleValueFieldType,
  resolveNodeStructuralIcon,
} from '../../lib/field-utils.js';
import { isOutlinerContentNodeType } from '../../lib/node-type-utils.js';
import { applyWebClipToNode } from '../../lib/webclip-service.js';
import { toast } from 'sonner';
import { marksToHtml } from '../../lib/editor-marks.js';
import { docToMarks } from '../../lib/pm-doc-utils.js';
import {
  WEBCLIP_CAPTURE_ACTIVE_TAB,
  type WebClipCaptureResponse,
} from '../../lib/webclip-messaging.js';
import { useNodeCheckbox } from '../../hooks/use-node-checkbox.js';
import {
  getFlattenedVisibleNodes,
  getPreviousVisibleNode,
  getNextVisibleNode,
  isOnlyInlineRef,
  getNodeTextLengthById,
} from '../../lib/tree-utils';
import { resolveDropHoverPosition } from '../../lib/drag-drop-position';
import { resolveDropMove } from '../../lib/drag-drop';
import { resolveSelectedReferenceShortcut } from '../../lib/selected-reference-shortcuts';
import { resolveSelectionKeyboardAction } from '../../lib/selection-keyboard';
import { resolveRowPointerSelectAction } from '../../lib/row-pointer-selection';
import {
  toggleNodeInSelection,
  computeRangeSelection,
  filterToRootLevel,
  getFirstSelectedInOrder,
  getSelectionBounds,
  getEffectiveSelectionBounds,
  getSelectedIdsInOrder,
} from '../../lib/selection-utils';
import {
  filterSlashCommands,
  getFirstEnabledSlashIndex,
  getNextEnabledSlashIndex,
  type SlashCommandId,
} from '../../lib/slash-commands';
import { getShortcutKeys, matchesShortcutEvent } from '../../lib/shortcut-registry.js';
import {
  deleteEditorRange,
  isEditorViewAlive,
  replaceEditorRangeWithInlineRef,
  replaceEditorRangeWithText,
  setEditorPlainTextContent,
  setEditorSelection,
  toggleHeadingMark,
} from '../../lib/pm-editor-view.js';
import { dragState } from '../../hooks/use-drag-select';
import { mergeRichTextPayload } from '../../lib/rich-text-merge.js';
import { getTreeReferenceBlockReason, isReferenceDisplayCycle } from '../../lib/reference-rules.js';
import { focusUndoShortcutSink, ensureUndoFocusAfterNavigation } from '../../lib/focus-utils.js';
import { t } from '../../i18n/strings.js';

const DESCRIPTION_SHORTCUT_KEYS = getShortcutKeys('editor.edit_description', ['Ctrl-i']);
const EMPTY_REFERENCE_PATH: readonly string[] = [];

interface OutlinerItemProps {
  nodeId: string;
  depth: number;
  rootChildIds: string[];
  parentId: string;
  rootNodeId: string;
  /** When set, controls how the value node is rendered (e.g. checkbox toggle). Only applies to direct field value nodes. */
  fieldDataType?: string;
  /** AttrDef ID — for Options field dropdown when clicking selected value */
  attrDefId?: string;
  /** Called when arrow navigation reaches a boundary (first/last node in scope).
   * Allows field-value OutlinerItems to escape to the parent outliner context. */
  onNavigateOut?: (direction: 'up' | 'down') => void;
  /** Override bullet colors (e.g. ownerColor for template items in config page). When omitted, colors derive from the node's own supertags. */
  bulletColors?: string[];
  /** Effective-node path in current display recursion (used to stop cyclic reference expansion). */
  referencePath?: readonly string[];
}

function focusTrailingInputForParent(parentId: string): boolean {
  const roots = document.querySelectorAll<HTMLElement>('[data-trailing-parent-id]');
  for (const root of roots) {
    if (root.dataset.trailingParentId !== parentId) continue;
    const editor = root.querySelector<HTMLElement>('.ProseMirror');
    if (!editor) continue;
    editor.focus({ preventScroll: true });
    return true;
  }
  return false;
}

function focusRowUndoTarget(row: HTMLElement | null): void {
  const editor = row?.querySelector<HTMLElement>('.ProseMirror');
  if (editor) {
    editor.focus({ preventScroll: true });
    return;
  }
  focusUndoShortcutSink();
}

type StructuralToggleFocusSnapshot = {
  nodeId: string;
  parentId: string | null;
  expiresAt: number;
};

let structuralToggleFocusSnapshot: StructuralToggleFocusSnapshot | null = null;

function captureStructuralToggleFocusSnapshot(): void {
  const state = useUIStore.getState();
  if (!state.focusedNodeId) {
    structuralToggleFocusSnapshot = null;
    return;
  }
  structuralToggleFocusSnapshot = {
    nodeId: state.focusedNodeId,
    parentId: state.focusedParentId ?? null,
    expiresAt: Date.now() + 1000,
  };
}

function peekStructuralToggleFocusSnapshot(): StructuralToggleFocusSnapshot | null {
  if (!structuralToggleFocusSnapshot) return null;
  if (Date.now() > structuralToggleFocusSnapshot.expiresAt) {
    structuralToggleFocusSnapshot = null;
    return null;
  }
  return structuralToggleFocusSnapshot;
}

function clearStructuralToggleFocusSnapshot(): void {
  structuralToggleFocusSnapshot = null;
}

function focusEditorForNodeId(nodeId: string): boolean {
  const root = document.querySelector<HTMLElement>(`[data-node-id="${nodeId}"]`);
  const editor = root?.querySelector<HTMLElement>('.ProseMirror');
  if (!editor) return false;
  editor.focus({ preventScroll: true });
  return true;
}

function getTreeReferenceBlockMessage(reason: ReturnType<typeof getTreeReferenceBlockReason>): string {
  switch (reason) {
    case 'self_parent':
      return t('reference.blocked.selfChild');
    case 'would_create_display_cycle':
      return t('reference.blocked.cycle');
    case 'missing_parent':
    case 'missing_target':
    default:
      return t('reference.blocked.unavailable');
  }
}

export interface OutlinerVisibleChild {
  id: string;
  type: 'field' | 'content';
  hidden?: boolean;
}

export function isHiddenFieldRow(hideMode: string | undefined, isEmpty: boolean | undefined): boolean {
  switch (hideMode) {
    case SYS_V.ALWAYS:
      return true;
    case SYS_V.WHEN_EMPTY:
      return !!isEmpty;
    case SYS_V.WHEN_NOT_EMPTY:
      return !isEmpty;
    default:
      return false;
  }
}

export function resolvePanelNavigationNodeId(nodeId: string, referenceTargetId: string | null): string {
  return referenceTargetId ?? nodeId;
}

export function shouldRenderReferenceBulletStyle(params: {
  isReference: boolean;
  isPendingConversion: boolean;
  isOptionsValueNode: boolean;
}): boolean {
  return params.isReference || params.isPendingConversion || params.isOptionsValueNode;
}

export function buildFieldOwnerColors(
  fieldMap: Map<string, Pick<FieldEntry, 'fieldDefId' | 'templateId'>>,
  getFieldDefOwnerId: (fieldDefId: string) => string | null,
  getNodeType: (nodeId: string) => string | undefined,
  resolveOwnerColor: (ownerTagDefId: string) => string,
): Map<string, string> {
  const result = new Map<string, string>();
  for (const [entryId, entry] of fieldMap) {
    const ownerLookupIds = [entry.fieldDefId];
    if (entry.templateId && entry.templateId !== entry.fieldDefId) {
      ownerLookupIds.unshift(entry.templateId);
    }
    let ownerTagDefId: string | null = null;
    for (const lookupId of ownerLookupIds) {
      const ownerId = getFieldDefOwnerId(lookupId);
      if (!ownerId) continue;
      if (getNodeType(ownerId) !== 'tagDef') continue;
      ownerTagDefId = ownerId;
      break;
    }
    if (!ownerTagDefId) continue;
    result.set(entryId, resolveOwnerColor(ownerTagDefId));
  }
  return result;
}

export function buildVisibleChildrenRows(params: {
  allChildIds: string[];
  fieldMap: Map<string, Pick<FieldEntry, 'fieldDefId' | 'templateId' | 'hideMode' | 'isEmpty'>>;
  tagIds: string[];
  getFieldDefOwnerId: (fieldDefId: string) => string | null;
  getNodeType: (nodeId: string) => string | undefined;
  getChildNodeType: (childId: string) => NodeType | undefined;
  isOutlinerContentType: (nodeType: NodeType | undefined) => boolean;
}): OutlinerVisibleChild[] {
  const {
    allChildIds,
    fieldMap,
    tagIds,
    getFieldDefOwnerId,
    getNodeType,
    getChildNodeType,
    isOutlinerContentType,
  } = params;

  const tagIdSet = new Set(tagIds);
  const templateFieldsByTagDef = new Map<string, OutlinerVisibleChild[]>();
  const remainingItems: OutlinerVisibleChild[] = [];

  for (const cid of allChildIds) {
    const fieldEntry = fieldMap.get(cid);
    if (fieldEntry) {
      const child: OutlinerVisibleChild = {
        id: cid,
        type: 'field',
        hidden: isHiddenFieldRow(fieldEntry.hideMode, fieldEntry.isEmpty),
      };
      const ownerTagDefId = fieldEntry.templateId
        ? getFieldDefOwnerId(fieldEntry.templateId)
        : getFieldDefOwnerId(fieldEntry.fieldDefId);
      const isTemplateField = !!fieldEntry.templateId
        && ownerTagDefId !== null
        && getNodeType(ownerTagDefId) === 'tagDef'
        && tagIdSet.has(ownerTagDefId);
      if (isTemplateField && ownerTagDefId) {
        let bucket = templateFieldsByTagDef.get(ownerTagDefId);
        if (!bucket) {
          bucket = [];
          templateFieldsByTagDef.set(ownerTagDefId, bucket);
        }
        bucket.push(child);
      } else {
        remainingItems.push(child);
      }
      continue;
    }

    const childType = getChildNodeType(cid);
    if (isOutlinerContentType(childType)) {
      remainingItems.push({ id: cid, type: 'content' });
    }
  }

  const result: OutlinerVisibleChild[] = [];
  for (const tagId of tagIds) {
    const bucket = templateFieldsByTagDef.get(tagId);
    if (bucket) result.push(...bucket);
  }
  result.push(...remainingItems);
  return result;
}

export function OutlinerItem({
  nodeId,
  depth,
  rootChildIds,
  parentId,
  rootNodeId,
  fieldDataType,
  attrDefId,
  onNavigateOut,
  bulletColors,
  referencePath = EMPTY_REFERENCE_PATH,
}: OutlinerItemProps) {
  const node = useNode(nodeId);
  const referenceTargetId = node?.type === 'reference' ? (node.targetId ?? null) : null;
  const referenceTargetNode = useNode(referenceTargetId);
  const effectiveNodeId = referenceTargetId ?? nodeId;
  const panelNavigationNodeId = resolvePanelNavigationNodeId(nodeId, referenceTargetId);
  const effectiveNode = referenceTargetNode ?? node;
  const isCyclicReferenceExpansion = !!referenceTargetId && isReferenceDisplayCycle(effectiveNodeId, referencePath);
  const nextReferencePath = useMemo(
    () => [...referencePath, effectiveNodeId],
    [referencePath, effectiveNodeId],
  );
  // Expansion is instance-scoped by design: the same target referenced from two places
  // can keep independent expanded/collapsed state, so the key stays on ref nodeId.
  const expandKey = `${parentId}:${nodeId}`;
  const isExpanded = useUIStore((s) => s.expandedNodes.has(`${parentId}:${nodeId}`));
  const focusedNodeId = useUIStore((s) => s.focusedNodeId);
  const focusedParentId = useUIStore((s) => s.focusedParentId);
  const setFocusedNode = useUIStore((s) => s.setFocusedNode);
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const selectedParentId = useUIStore((s) => s.selectedParentId);
  const selectionSource = useUIStore((s) => s.selectionSource);
  const setSelectedNode = useUIStore((s) => s.setSelectedNode);
  // Derive booleans from Set to avoid Zustand infinite re-render (Set creates new reference each time)
  const isInSelectedSet = useUIStore((s) => s.selectedNodeIds.has(nodeId));
  const isMultiSelected = useUIStore((s) => s.selectedNodeIds.size > 1);
  const isSelectionAnchor = useUIStore((s) => s.selectionAnchorId === nodeId);
  const setSelectedNodes = useUIStore((s) => s.setSelectedNodes);
  const clearSelection = useUIStore((s) => s.clearSelection);
  const clearFocus = useUIStore((s) => s.clearFocus);
  const toggleExpanded = useUIStore((s) => s.toggleExpanded);
  const setExpanded = useUIStore((s) => s.setExpanded);
  const navigateTo = useUIStore((s) => s.navigateTo);
  const openSearch = useUIStore((s) => s.openSearch);
  const expandedNodes = useUIStore((s) => s.expandedNodes);

  const dragNodeId = useUIStore((s) => s.dragNodeId);
  const dropTargetId = useUIStore((s) => s.dropTargetId);
  const dropPosition = useUIStore((s) => s.dropPosition);
  const setDrag = useUIStore((s) => s.setDrag);
  const setDropTarget = useUIStore((s) => s.setDropTarget);

  const createSibling = useNodeStore((s) => s.createSibling);
  const createChild = useNodeStore((s) => s.createChild);
  const indentNode = useNodeStore((s) => s.indentNode);
  const outdentNode = useNodeStore((s) => s.outdentNode);
  const moveNodeUp = useNodeStore((s) => s.moveNodeUp);
  const moveNodeDown = useNodeStore((s) => s.moveNodeDown);
  const moveNodeTo = useNodeStore((s) => s.moveNodeTo);
  const trashNode = useNodeStore((s) => s.trashNode);
  const toggleNodeDone = useNodeStore((s) => s.toggleNodeDone);
  const cycleNodeCheckbox = useNodeStore((s) => s.cycleNodeCheckbox);
  const _version = useNodeStore((s) => s._version);

  const rowRef = useRef<HTMLDivElement>(null);
  const contentAreaRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const blurClearRafRef = useRef<number | null>(null);
  const deleteBlockedPulseTimeoutRef = useRef<number | null>(null);
  const wasFocusedRef = useRef(false);
  const [deleteBlockedPulse, setDeleteBlockedPulse] = useState(false);

  // # trigger state
  const [hashTagOpen, setHashTagOpen] = useState(false);
  const [hashTagQuery, setHashTagQuery] = useState('');
  const [hashTagSelectedIndex, setHashTagSelectedIndex] = useState(0);
  const [hashTagAnchor, setHashTagAnchor] = useState<TriggerAnchorRect | undefined>(undefined);
  const hashRangeRef = useRef<{ from: number; to: number }>({ from: 0, to: 0 });
  const tagDropdownRef = useRef<TagDropdownHandle>(null);
  const applyTag = useNodeStore((s) => s.applyTag);
  const createTagDef = useNodeStore((s) => s.createTagDef);
  const setNodeName = useNodeStore((s) => s.setNodeName);
  const updateNodeContent = useNodeStore((s) => s.updateNodeContent);
  const updateNodeDescription = useNodeStore((s) => s.updateNodeDescription);
  const removeReference = useNodeStore((s) => s.removeReference);
  const selectFieldOption = useNodeStore((s) => s.selectFieldOption);
  const startRefConversion = useNodeStore((s) => s.startRefConversion);
  const addReference = useNodeStore((s) => s.addReference);
  const revertRefConversion = useNodeStore((s) => s.revertRefConversion);
  const setPendingRefConversion = useUIStore((s) => s.setPendingRefConversion);

  // @ trigger state (reference)
  const [refOpen, setRefOpen] = useState(false);
  const [refQuery, setRefQuery] = useState('');
  const [refSelectedIndex, setRefSelectedIndex] = useState(0);
  const [refAnchor, setRefAnchor] = useState<TriggerAnchorRect | undefined>(undefined);
  const [refTreeContextParentId, setRefTreeContextParentId] = useState<string | null>(null);
  const refRangeRef = useRef<{ from: number; to: number }>({ from: 0, to: 0 });
  const refDropdownRef = useRef<ReferenceDropdownHandle>(null);

  // / trigger state (slash command)
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(-1);
  const [slashAnchor, setSlashAnchor] = useState<TriggerAnchorRect | undefined>(undefined);
  const slashRangeRef = useRef<{ from: number; to: number }>({ from: 0, to: 0 });

  // > trigger (fire-once: instantly creates field)
  const addUnnamedFieldToNode = useNodeStore((s) => s.addUnnamedFieldToNode);
  const setEditingFieldName = useUIStore((s) => s.setEditingFieldName);

  // Lazy-load children when expanded
  useChildren(isExpanded && !isCyclicReferenceExpansion ? effectiveNodeId : null);

  const tagIds = useNodeTags(effectiveNodeId);
  const syncTemplateFields = useNodeStore((s) => s.syncTemplateFields);

  // Sync template fieldEntries/content for tagged nodes — handles the case
  // where fieldDefs were added to tagDef Default content AFTER the tag was applied.
  useEffect(() => {
    if (tagIds.length > 0 && isExpanded) {
      syncTemplateFields(effectiveNodeId);
    }
  }, [tagIds, isExpanded, effectiveNodeId, syncTemplateFields]);

  const fields = useNodeFields(effectiveNodeId);
  const parentFields = useNodeFields(parentId);
  const parentFieldVisibility = useMemo(() => {
    const visibility = new Map<string, boolean>();
    for (const f of parentFields) {
      let hidden = false;
      switch (f.hideMode) {
        case SYS_V.ALWAYS:
          hidden = true;
          break;
        case SYS_V.WHEN_EMPTY:
          hidden = !!f.isEmpty;
          break;
        case SYS_V.WHEN_NOT_EMPTY:
          hidden = !f.isEmpty;
          break;
      }
      visibility.set(f.fieldEntryId, !hidden);
    }
    return visibility;
  }, [parentFields]);
  const filteredSlashCommands = useMemo(
    () => filterSlashCommands(slashQuery),
    [slashQuery],
  );

  const allChildIds = effectiveNode?.children ?? [];
  const renderableSiblings = useMemo(() => {
    void _version;
    const getNode = useNodeStore.getState().getNode;
    const parentChildren = getNode(parentId)?.children ?? [];
    const result: Array<{ id: string; type: 'field' | 'content' }> = [];
    for (const cid of parentChildren) {
      if (parentFieldVisibility.has(cid)) {
        if (!parentFieldVisibility.get(cid)) continue;
        result.push({ id: cid, type: 'field' });
        continue;
      }
      if (isOutlinerContentNodeType(getNode(cid)?.type)) {
        result.push({ id: cid, type: 'content' });
      }
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_version, parentId, parentFieldVisibility]);

  // Build field lookup by tuple ID
  const fieldMap = useMemo(() => {
    const m = new Map<string, FieldEntry>();
    for (const f of fields) m.set(f.fieldEntryId, f);
    return m;
  }, [fields]);

  // Owning tagDef color per fieldEntry — for coloring FieldRow icons.
  // Only tagDef-owned template fields get tint colors. Schema/manual fields stay neutral.
  const fieldOwnerColors = useMemo(() => (
    buildFieldOwnerColors(
      fieldMap,
      (fieldDefId) => loroDoc.getParentId(fieldDefId),
      (ownerId) => useNodeStore.getState().getNode(ownerId)?.type,
      (ownerId) => resolveTagColor(ownerId).text,
    )
  ), [fieldMap]);

  // Classify children for render order:
  // 1) template fields pinned on top, grouped by current supertag order,
  // 2) all remaining children (manual fields + content) keep original sibling order.
  const visibleChildren = useMemo(() => (
    buildVisibleChildrenRows({
      allChildIds,
      fieldMap,
      tagIds,
      getFieldDefOwnerId: (fieldDefId) => loroDoc.getParentId(fieldDefId),
      getNodeType: (id) => useNodeStore.getState().getNode(id)?.type,
      getChildNodeType: (id) => useNodeStore.getState().getNode(id)?.type,
      isOutlinerContentType: isOutlinerContentNodeType,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [allChildIds, fieldMap, tagIds, _version]);

  // Template content clone colors: content children with templateId get the owning tagDef's color.
  // This ensures template-cloned content matches the supertag's bullet color.
  const templateContentColors = useMemo(() => {
    const map = new Map<string, string[]>();
    const getNode = useNodeStore.getState().getNode;
    for (const { id, type } of visibleChildren) {
      if (type !== 'content') continue;
      const child = getNode(id);
      if (!child?.templateId) continue;
      const ownerTagDefId = loroDoc.getParentId(child.templateId);
      if (!ownerTagDefId) continue;
      if (getNode(ownerTagDefId)?.type !== 'tagDef') continue;
      const color = resolveTagColor(ownerTagDefId).text;
      if (color) map.set(id, [color]);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleChildren, _version]);

  const childIds = useMemo(
    () => visibleChildren.filter((c) => c.type === 'content').map((c) => c.id),
    [visibleChildren],
  );
  // For hasChildren: count non-hidden items (hidden-always fields don't count toward expand chevron)
  const hasChildren = !isCyclicReferenceExpansion && visibleChildren.some((c) => !c.hidden);
  // All hidden fields (including ALWAYS): shown as compact pills, click to temporarily reveal
  const hiddenRevealableFields = useMemo(
    () => visibleChildren
      .filter((c) => c.hidden)
      .map((c) => ({ id: c.id, name: fieldMap.get(c.id)!.attrDefName })),
    [visibleChildren, fieldMap],
  );
  const [revealedFieldIds, setRevealedFieldIds] = useState<Set<string>>(() => new Set());
  const childrenScopeRef = useRef<HTMLDivElement>(null);
  // If the last visible child is a field, keep a trailing blank input after fields.
  // This allows direct typing a new content node without first creating it manually.
  const lastRenderableChild = useMemo(() => {
    for (let i = visibleChildren.length - 1; i >= 0; i--) {
      const child = visibleChildren[i];
      if (!child.hidden || revealedFieldIds.has(child.id)) return child;
    }
    return null;
  }, [visibleChildren, revealedFieldIds]);
  const firstRenderableChild = useMemo(() => {
    for (let i = 0; i < visibleChildren.length; i++) {
      const child = visibleChildren[i];
      if (!child.hidden || revealedFieldIds.has(child.id)) return child;
    }
    return null;
  }, [visibleChildren, revealedFieldIds]);
  const shouldShowTrailingInput = !lastRenderableChild || lastRenderableChild.type === 'field';
  const isFocused = focusedNodeId === nodeId &&
    (focusedParentId === null || focusedParentId === parentId);
  const hasTags = tagIds.length > 0;
  const hasFields = fields.length > 0;
  const isReferenceNode = node?.type === 'reference';
  const isReferenceAlias = !isReferenceNode && !!node && loroDoc.getParentId(nodeId) !== parentId;
  const isReference = isReferenceNode || isReferenceAlias;
  const isTagDef = effectiveNode?.type === 'tagDef';
  // Bullet colors: use prop override (template items) or derive from the node's own supertags
  const tagBulletColors = useMemo(
    () => tagIds.map((id) => resolveTagColor(id).text),
    [tagIds],
  );
  const effectiveBulletColors = bulletColors ?? tagBulletColors;
  // Structural icon: fieldDef nodes show the field type icon instead of a dot
  const structuralIcon = node ? resolveNodeStructuralIcon(node) : null;
  const isPendingConversion = useUIStore((s) => s.pendingRefConversion?.tempNodeId === nodeId);
  const pendingConversionRefTargetId = useUIStore((s) =>
    s.pendingRefConversion?.tempNodeId === nodeId ? s.pendingRefConversion.refNodeId : null,
  );
  // Multi-select: check derived boolean. For single-select with parent disambiguation (reference nodes),
  // also check selectedParentId to support the same node appearing in multiple places.
  const isSelected = isInSelectedSet && (
    isMultiSelected ||
    selectedParentId === null ||
    selectedParentId === parentId
  );
  const isSelectedGlobal = isSelected && !isFocused && (
    selectionSource === 'global' || !isReference || isMultiSelected
  );
  const isSelectedRefClick = isSelected && !isFocused && (isReference || isPendingConversion) && !isMultiSelected && selectionSource === 'ref-click';

  // Per-row highlight: only for directly selected nodes (children use subtree mask)
  const showRowHighlight = isSelectedGlobal;

  // Options field dropdown (for changing selected option value)
  const isOptionsField = isOptionsFieldType(fieldDataType);
  const [optionsPickerOpen, setOptionsPickerOpen] = useState(false);
  const [optionsPickerIndex, setOptionsPickerIndex] = useState(0);
  const allFieldOptions = useFieldOptions(isOptionsField && attrDefId ? attrDefId : '');
  const selectedOptionId = useMemo(() => {
    if (!isOptionsField || !effectiveNode) return undefined;
    const targetId = effectiveNode.targetId;
    return targetId && allFieldOptions.some((opt) => opt.id === targetId) ? targetId : undefined;
  }, [isOptionsField, effectiveNode, allFieldOptions]);
  const selectedOptionName = useMemo(
    () => allFieldOptions.find((opt) => opt.id === selectedOptionId)?.name ?? '',
    [allFieldOptions, selectedOptionId],
  );
  const isOptionsValueNode = isOptionsField && !!selectedOptionId;
  const isReferenceLikeRow = shouldRenderReferenceBulletStyle({
    isReference,
    isPendingConversion,
    isOptionsValueNode,
  });
  const pendingConversionInlineRefColor = useMemo(
    () => (pendingConversionRefTargetId ? resolveInlineReferenceTextColor(pendingConversionRefTargetId) : undefined),
    [pendingConversionRefTargetId, _version],
  );
  const pendingConversionStyle = useMemo<CSSProperties | undefined>(() => (
    isPendingConversion
      ? {
        ['--ref-conversion-accent' as string]: pendingConversionInlineRefColor ?? 'var(--color-primary)',
        ['--ref-conversion-dark' as string]: 'var(--color-foreground)',
      }
      : undefined
  ), [isPendingConversion, pendingConversionInlineRefColor]);

  // Checkbox state (supertag SYS_A55 or manual _done)
  const { showCheckbox, isDone } = useNodeCheckbox(effectiveNodeId);

  // Click on checkbox: toggles undone ↔ done (never removes checkbox)
  const handleCheckboxToggle = useCallback(() => {
    toggleNodeDone(effectiveNodeId);
  }, [effectiveNodeId, toggleNodeDone]);

  // Cmd+Enter: 3-state cycle for manual, 2-state for tag-driven
  const handleCycleCheckbox = useCallback(() => {
    cycleNodeCheckbox(effectiveNodeId);
  }, [effectiveNodeId, cycleNodeCheckbox]);

  // Cmd+Click: toggle node in multi-selection
  const handleCmdClick = useCallback(() => {
    const state = useUIStore.getState();
    const newSelection = toggleNodeInSelection(nodeId, state.selectedNodeIds);
    // If anchor was deselected, pick another selected node
    let newAnchor = state.selectionAnchorId;
    if (newAnchor && !newSelection.has(newAnchor)) {
      newAnchor = newSelection.size > 0 ? [...newSelection][0] : null;
    }
    if (!newAnchor && newSelection.has(nodeId)) {
      newAnchor = nodeId;
    }
    setSelectedNodes(newSelection, newAnchor);
  }, [nodeId, setSelectedNodes]);

  // Shift+Click: range select from anchor to this node
  const handleShiftClick = useCallback(() => {
    const state = useUIStore.getState();
    const anchor = state.selectionAnchorId;
    if (!anchor) {
      setSelectedNode(nodeId, parentId);
      return;
    }
    const flatList = getFlattenedVisibleNodes(rootChildIds, state.expandedNodes, rootNodeId);
    const range = computeRangeSelection(anchor, nodeId, flatList);
    setSelectedNodes(range, anchor);
  }, [nodeId, parentId, rootChildIds, rootNodeId, setSelectedNode, setSelectedNodes]);

  // Escape in editor (no dropdown) → clear focus, keep selection (set at click time)
  const handleEscapeSelect = useCallback(() => {
    clearFocus();
  }, [clearFocus]);

  // Shift+↑/↓ in editor → enter selection mode (selection already set at click time)
  const handleShiftArrow = useCallback((_direction: 'up' | 'down') => {
    clearFocus();
  }, [clearFocus]);

  // Cmd+A (double-press) in editor → select all top-level nodes
  const handleSelectAll = useCallback(() => {
    clearFocus();
    const getNode = useNodeStore.getState().getNode;
    const rootNode = getNode(rootNodeId);
    const topLevelIds = (rootNode?.children ?? []).filter(
      (cid) => !getNode(cid)?.type,
    );
    if (topLevelIds.length > 0) {
      setSelectedNodes(new Set(topLevelIds), topLevelIds[0]);
    }
  }, [rootNodeId, clearFocus, setSelectedNodes]);

  // Description editing state
  const [editingDescription, setEditingDescription] = useState(false);
  const descriptionRef = useRef<HTMLDivElement>(null);
  const description = node?.description ?? '';

  // Pending click coordinates for description cursor placement
  const descClickCoordsRef = useRef<{ x: number; y: number } | null>(null);
  const descriptionReturnOffsetRef = useRef<number | null>(null);

  const triggerDeleteBlockedPulse = useCallback(() => {
    if (deleteBlockedPulseTimeoutRef.current !== null) {
      window.clearTimeout(deleteBlockedPulseTimeoutRef.current);
      deleteBlockedPulseTimeoutRef.current = null;
    }
    setDeleteBlockedPulse(false);
    requestAnimationFrame(() => {
      setDeleteBlockedPulse(true);
      deleteBlockedPulseTimeoutRef.current = window.setTimeout(() => {
        setDeleteBlockedPulse(false);
        deleteBlockedPulseTimeoutRef.current = null;
      }, 280);
    });
  }, []);

  useEffect(() => () => {
    if (deleteBlockedPulseTimeoutRef.current !== null) {
      window.clearTimeout(deleteBlockedPulseTimeoutRef.current);
      deleteBlockedPulseTimeoutRef.current = null;
    }
  }, []);

  const captureNameEditorOffset = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || editor.isDestroyed) {
      descriptionReturnOffsetRef.current = null;
      return;
    }
    const { from } = editor.state.selection;
    const maxPos = editor.state.doc.content.size - 1;
    const clampedPos = Math.max(1, Math.min(from, maxPos));
    descriptionReturnOffsetRef.current = clampedPos - 1;
  }, []);

  const commitDescriptionDraft = useCallback(() => {
    if (!descriptionRef.current) return;
    const newDesc = descriptionRef.current.textContent?.trim() ?? '';
    if (newDesc !== description) {
      updateNodeDescription(nodeId, newDesc);
    }
  }, [nodeId, description, updateNodeDescription]);

  const handleDescriptionMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); // Prevent native focus churn
    captureNameEditorOffset();
    descClickCoordsRef.current = { x: e.clientX, y: e.clientY };
    setEditingDescription(true);
  }, [captureNameEditorOffset]);

  const handleDescriptionBlur = useCallback(() => {
    commitDescriptionDraft();
    setEditingDescription(false);
  }, [commitDescriptionDraft]);

  const handleDescriptionKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      descriptionRef.current?.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (descriptionRef.current) descriptionRef.current.textContent = description;
      setEditingDescription(false);
    } else if (DESCRIPTION_SHORTCUT_KEYS.some((binding) => matchesShortcutEvent(e.nativeEvent, binding))) {
      // Ctrl+I toggle: save description and return focus to name editor
      e.preventDefault();
      commitDescriptionDraft();
      setEditingDescription(false);
      const textOffset = descriptionReturnOffsetRef.current;
      if (textOffset !== null) {
        useUIStore.getState().setFocusClickCoords({ nodeId, parentId, textOffset });
      } else {
        useUIStore.getState().setFocusClickCoords(null);
      }
      // Re-enter node editor after React re-render.
      requestAnimationFrame(() => {
        setFocusedNode(nodeId, parentId);
      });
    }
  }, [description, commitDescriptionDraft, nodeId, parentId, setFocusedNode]);

  // Focus description contentEditable when entering edit mode
  useEffect(() => {
    if (editingDescription && descriptionRef.current) {
      const el = descriptionRef.current;
      el.textContent = description;
      el.focus();

      const coords = descClickCoordsRef.current;
      descClickCoordsRef.current = null;

      if (coords && description) {
        // Place cursor at click position
        const doc = el.ownerDocument;
        const caretDoc = doc as Document & {
          caretPositionFromPoint?: (x: number, y: number) => CaretPosition | null;
          caretRangeFromPoint?: (x: number, y: number) => Range | null;
        };
        try {
          const pos = caretDoc.caretPositionFromPoint?.(coords.x, coords.y);
          if (pos && el.contains(pos.offsetNode)) {
            const range = doc.createRange();
            range.setStart(pos.offsetNode, pos.offset);
            range.collapse(true);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
            return;
          }
          const range = caretDoc.caretRangeFromPoint?.(coords.x, coords.y);
          if (range && el.contains(range.startContainer)) {
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
            return;
          }
        } catch { /* fallback to cursor at end */ }
      }

      // Default: cursor at end
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(el);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [editingDescription, description]);

  const handleDescriptionEdit = useCallback(() => {
    setEditingDescription((prev) => {
      if (!prev) {
        captureNameEditorOffset();
        descClickCoordsRef.current = null; // No click coords → cursor at end
      }
      return !prev;
    });
  }, [captureNameEditorOffset]);

  // Open options picker when selected Options value row/reference is selected
  useEffect(() => {
    if (isSelected && isOptionsField && (isReference || isOptionsValueNode)) {
      setOptionsPickerOpen(true);
      // Highlight the currently selected option
      const idx = allFieldOptions.findIndex((o) => o.id === selectedOptionId);
      setOptionsPickerIndex(idx >= 0 ? idx : 0);
    } else {
      setOptionsPickerOpen(false);
    }
  }, [isSelected, isReference, isOptionsField, isOptionsValueNode, allFieldOptions, selectedOptionId]);

  // Close options picker on outside pointer down (capture phase).
  // This keeps behavior consistent with other popovers and avoids "stuck open" overlays.
  useEffect(() => {
    if (!optionsPickerOpen) return;
    const handler = (e: PointerEvent) => {
      const row = rowRef.current;
      if (!row) return;
      if (!row.contains(e.target as Node)) {
        setOptionsPickerOpen(false);
      }
    };
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, [optionsPickerOpen]);

  // Unified keyboard handler for selected nodes (both reference and non-reference).
  // Reference-specific actions (delete ref, convert to inline) are checked first;
  // general selection actions (↑/↓ navigate, Shift+↑/↓ extend, Enter edit, Cmd+A,
  // printable char, Esc clear) handle the rest.
  // For multi-select, only the anchor node handles keyboard events to avoid duplicates.
  const setPendingInputChar = useUIStore((s) => s.setPendingInputChar);
  useEffect(() => {
    if (!isSelected || isFocused) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // If ProseMirror already handled this key (e.g. Escape in editor
      // called clearFocus() synchronously before this handler runs), skip it.
      // Without this, the same Escape event that transitions edit→selected
      // would also immediately clear the selection.
      if (e.defaultPrevented) return;

      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      ) {
        return;
      }

      const uiState = useUIStore.getState();
      if (uiState.focusedNodeId) return;

      // For multi-select, only the anchor node processes keyboard events
      if (uiState.selectedNodeIds.size > 1 && !isSelectionAnchor) {
        return;
      }

      // 1. Reference-specific actions (only for single-selected reference nodes)
      if ((isReference || isOptionsValueNode) && uiState.selectedNodeIds.size <= 1) {
        const refAction = resolveSelectedReferenceShortcut(e, optionsPickerOpen);
        if (refAction) {
          if (refAction === 'delete') {
            // Delete shortcut only removes concrete reference entries.
            // Reference-like aliases are display contexts, not removable nodes.
            if (!isReferenceNode) return;
            e.preventDefault();
            removeReference(nodeId);
            clearSelection();
            return;
          }
          if (refAction === 'convert_printable') {
            if (!isReferenceNode) return;
            e.preventDefault();
            const getNode = useNodeStore.getState().getNode;
            const parent = getNode(parentId);
            const pos = parent?.children?.indexOf(nodeId) ?? -1;
            if (pos < 0) return;
            const revertTargetId = getNode(nodeId)?.targetId;
            if (!revertTargetId) return;
            const tempNodeId = startRefConversion(nodeId, parentId, pos);
            setPendingRefConversion({ tempNodeId, refNodeId: revertTargetId, parentId });
            setPendingInputChar({ char: e.key, nodeId: tempNodeId, parentId });
            clearSelection();
            useUIStore.getState().setFocusClickCoords({
              nodeId: tempNodeId,
              parentId,
              textOffset: 1,
            });
            setFocusedNode(tempNodeId, parentId);
            return;
          }
          if (refAction === 'convert_arrow_right') {
            if (!isReferenceNode) return;
            e.preventDefault();
            const getNode = useNodeStore.getState().getNode;
            const parent = getNode(parentId);
            const pos = parent?.children?.indexOf(nodeId) ?? -1;
            if (pos < 0) return;
            const revertTargetId = getNode(nodeId)?.targetId;
            if (!revertTargetId) return;
            const tempNodeId = startRefConversion(nodeId, parentId, pos);
            setPendingRefConversion({ tempNodeId, refNodeId: revertTargetId, parentId });
            clearSelection();
            useUIStore.getState().setFocusClickCoords({
              nodeId: tempNodeId,
              parentId,
              textOffset: 1,
            });
            setTimeout(() => setFocusedNode(tempNodeId, parentId), 0);
            return;
          }
          if (refAction === 'options_down' && allFieldOptions.length > 0) {
            e.preventDefault();
            setOptionsPickerIndex((i) => Math.min(i + 1, allFieldOptions.length - 1));
            return;
          }
          if (refAction === 'options_up' && allFieldOptions.length > 0) {
            e.preventDefault();
            setOptionsPickerIndex((i) => Math.max(i - 1, 0));
            return;
          }
          if (refAction === 'options_confirm' && allFieldOptions.length > 0) {
            e.preventDefault();
            const opt = allFieldOptions[optionsPickerIndex];
            if (opt) {
              selectFieldOption(parentId, opt.id, nodeId);
            }
            clearSelection();
            return;
          }
          if (refAction === 'escape') {
            e.preventDefault();
            clearSelection();
            return;
          }
          return; // Reference handler consumed the event
        }
      }

      // 2. General selection mode actions (all node types, including multi-select)
      const selAction = resolveSelectionKeyboardAction(e);
      if (!selAction) return;

      if (selAction === 'clear_selection') {
        e.preventDefault();
        // Second Escape: re-enter edit mode on the same node so the cursor
        // returns to its original position (matching Tana behavior).
        clearSelection();
        setFocusedNode(nodeId, parentId);
        return;
      }

      if (selAction === 'select_all') {
        e.preventDefault();
        // Select all top-level content children of root
        const getNode = useNodeStore.getState().getNode;
        const rootNode = getNode(rootNodeId);
        const topLevelIds = (rootNode?.children ?? []).filter(
          (cid) => !getNode(cid)?.type,
        );
        if (topLevelIds.length > 0) {
          setSelectedNodes(new Set(topLevelIds), topLevelIds[0]);
        }
        return;
      }

      // ─── Batch operations (Phase 3) ───

      if (selAction === 'batch_delete') {
        e.preventDefault();
        const latestUi = useUIStore.getState();
        const flatList = getFlattenedVisibleNodes(rootChildIds, latestUi.expandedNodes, rootNodeId);
        const bounds = getSelectionBounds(latestUi.selectedNodeIds, flatList);
        const prev = bounds ? getPreviousVisibleNode(bounds.first.nodeId, bounds.first.parentId, flatList) : null;
        const orderedIds = getSelectedIdsInOrder(latestUi.selectedNodeIds, flatList);
        // Bottom-up: avoid index shift when deleting upper nodes first
        for (let i = orderedIds.length - 1; i >= 0; i--) {
          trashNode(orderedIds[i]);
        }
        clearSelection();
        if (prev) {
          setFocusedNode(prev.nodeId, prev.parentId);
        }
        return;
      }

      if (selAction === 'batch_indent') {
        e.preventDefault();
        const latestUi = useUIStore.getState();
        const flatList = getFlattenedVisibleNodes(rootChildIds, latestUi.expandedNodes, rootNodeId);
        const orderedIds = getSelectedIdsInOrder(latestUi.selectedNodeIds, flatList);
        // Top-down: upper nodes indent first so lower ones follow into the same parent
        for (const id of orderedIds) {
          const getNode = useNodeStore.getState().getNode;
          const currentNode = getNode(id);
          if (!currentNode) continue;
          const ownerId = loroDoc.getParentId(id);
          if (!ownerId) continue;
          const parent = getNode(ownerId);
          if (!parent?.children) continue;
          const index = parent.children.indexOf(id);
          if (index <= 0) continue;
          const newParentId = parent.children[index - 1];
          setExpanded(`${ownerId}:${newParentId}`, true, true);
          indentNode(id);
        }
        clearSelection();
        return;
      }

      if (selAction === 'batch_outdent') {
        e.preventDefault();
        const latestUi = useUIStore.getState();
        const flatList = getFlattenedVisibleNodes(rootChildIds, latestUi.expandedNodes, rootNodeId);
        const orderedIds = getSelectedIdsInOrder(latestUi.selectedNodeIds, flatList);
        // Bottom-up: lower nodes outdent first to avoid parent relationship issues
        for (let i = orderedIds.length - 1; i >= 0; i--) {
          outdentNode(orderedIds[i]);
        }
        clearSelection();
        return;
      }

      if (selAction === 'batch_duplicate') {
        e.preventDefault();
        const latestUi = useUIStore.getState();
        const flatList = getFlattenedVisibleNodes(rootChildIds, latestUi.expandedNodes, rootNodeId);
        const orderedIds = getSelectedIdsInOrder(latestUi.selectedNodeIds, flatList);
        // Bottom-up: insert positions stay correct when lower nodes duplicate first
        for (let i = orderedIds.length - 1; i >= 0; i--) {
          const name = useNodeStore.getState().getNode(orderedIds[i])?.name ?? '';
          createSibling(orderedIds[i], { name });
        }
        clearSelection();
        return;
      }

      if (selAction === 'batch_checkbox') {
        e.preventDefault();
        const latestUi = useUIStore.getState();
        const ids = [...latestUi.selectedNodeIds];
        // 3-state cycle per node: No → Undone → Done → No (manual)
        //             Undone → Done → Undone (tag-driven)
        for (const id of ids) {
          cycleNodeCheckbox(id);
        }
        // Keep selection (don't clear)
        return;
      }

      if (selAction === 'extend_up' || selAction === 'extend_down') {
        e.preventDefault();
        const latestUi = useUIStore.getState();
        const flatList = getFlattenedVisibleNodes(rootChildIds, latestUi.expandedNodes, rootNodeId);

        const anchor = latestUi.selectionAnchorId;
        if (!anchor) return;

        const anchorIdx = flatList.findIndex((n) => n.nodeId === anchor);
        if (anchorIdx < 0) return;

        // Use effective bounds that include implicitly selected descendants.
        // Without this, selecting a parent with expanded children would get
        // stuck: filterToRootLevel removes children, so bounds.last = parent,
        // and the extent can never move past the children.
        const effectiveBounds = getEffectiveSelectionBounds(latestUi.selectedNodeIds, flatList);
        if (!effectiveBounds) return;

        const { firstIdx, lastIdx } = effectiveBounds;

        // Determine current extent: the end of the range that is NOT the anchor
        let extentIdx: number;
        if (anchorIdx <= firstIdx) {
          extentIdx = lastIdx;
        } else if (anchorIdx >= lastIdx) {
          extentIdx = firstIdx;
        } else {
          extentIdx = selAction === 'extend_down' ? lastIdx : firstIdx;
        }

        // Move extent by one
        const newExtentIdx = selAction === 'extend_up'
          ? Math.max(0, extentIdx - 1)
          : Math.min(flatList.length - 1, extentIdx + 1);

        // Compute new range from anchor to new extent
        const start = Math.min(anchorIdx, newExtentIdx);
        const end = Math.max(anchorIdx, newExtentIdx);
        const rangeIds = new Set<string>();
        for (let i = start; i <= end; i++) {
          rangeIds.add(flatList[i].nodeId);
        }
        const filtered = filterToRootLevel(rangeIds, undefined, flatList);
        setSelectedNodes(filtered, anchor);
        return;
      }

      // For navigate/enter/type: use fresh state for multi-select bounds
      const latestUi = useUIStore.getState();
      const flatList = getFlattenedVisibleNodes(rootChildIds, latestUi.expandedNodes, rootNodeId);

      if (selAction === 'navigate_up') {
        e.preventDefault();
        const bounds = getSelectionBounds(latestUi.selectedNodeIds, flatList);
        if (!bounds) return;
        const prev = getPreviousVisibleNode(bounds.first.nodeId, bounds.first.parentId, flatList);
        if (prev) {
          clearSelection();
          // ↑ → cursor at text end
          useUIStore.getState().setFocusClickCoords({
            nodeId: prev.nodeId,
            parentId: prev.parentId,
            textOffset: getNodeTextLengthById(prev.nodeId),
          });
          setFocusedNode(prev.nodeId, prev.parentId);
        }
        return;
      }

      if (selAction === 'navigate_down') {
        e.preventDefault();
        const bounds = getSelectionBounds(latestUi.selectedNodeIds, flatList);
        if (!bounds) return;
        const next = getNextVisibleNode(bounds.last.nodeId, bounds.last.parentId, flatList);
        if (next) {
          clearSelection();
          // ↓ → cursor at text start (textOffset 0)
          useUIStore.getState().setFocusClickCoords({ nodeId: next.nodeId, parentId: next.parentId, textOffset: 0 });
          setFocusedNode(next.nodeId, next.parentId);
        }
        return;
      }

      if (selAction === 'enter_edit' || selAction === 'type_char') {
        const first = getFirstSelectedInOrder(latestUi.selectedNodeIds, flatList);
        if (!first) return;
        const editAtEnd = getNodeTextLengthById(first.nodeId);
        if (selAction === 'enter_edit') {
          e.preventDefault();
        }
        if (selAction === 'type_char') {
          const isAsciiLetter = /^[a-zA-Z]$/.test(e.key);
          if (!isAsciiLetter) {
            e.preventDefault();
            setPendingInputChar({ char: e.key, nodeId: first.nodeId, parentId: first.parentId });
          }
        }
        clearSelection();
        // typing in selected mode should append at end of the first selected node
        useUIStore.getState().setFocusClickCoords({
          nodeId: first.nodeId,
          parentId: first.parentId,
          textOffset: editAtEnd,
        });
        setFocusedNode(first.nodeId, first.parentId);
        return;
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isSelected, isFocused, isReference, isOptionsValueNode, isSelectionAnchor, optionsPickerOpen, allFieldOptions, optionsPickerIndex, parentId, nodeId, rootNodeId, rootChildIds, expandedNodes, removeReference, selectFieldOption, setSelectedNode, setSelectedNodes, clearSelection, setFocusedNode, startRefConversion, setPendingRefConversion, setPendingInputChar]);

  // When TrailingInput creates a node with #/@/, it sets triggerHint so we
  // can immediately open the dropdown (extensions don't fire on mount because
  // there's no doc change). Read and clear the hint on focus.
  useEffect(() => {
    if (!isFocused) return;
    const hint = useUIStore.getState().triggerHint;
    if (!hint || hint.nodeId !== nodeId) return;
    useUIStore.getState().setTriggerHint(null);

    // To prevent infinite re-trigger loops from focus churn in isolated test cases or DevTools,
    // ensure we don't spam-open dropdowns if the selection is already completely matching.
    if (hint.char === '#') {
      // The editor content is '#' — set range to cover it
      setHashTagQuery('');
      setHashTagSelectedIndex(0);
      setHashTagAnchor(undefined);
      hashRangeRef.current = { from: 1, to: 2 }; // position of '#' in ProseMirror doc
      setHashTagOpen(true);
    } else if (hint.char === '@') {
      setRefQuery('');
      setRefSelectedIndex(0);
      setRefAnchor(undefined);
      refRangeRef.current = { from: 1, to: 2 };
      setRefOpen(true);
    } else if (hint.char === '/') {
      setSlashQuery('');
      setSlashAnchor(undefined);
      slashRangeRef.current = { from: 1, to: 2 };
      setSlashOpen(true);
    }
  }, [isFocused]);

  useEffect(() => {
    if (!slashOpen) return;
    if (filteredSlashCommands.length === 0) {
      if (slashSelectedIndex !== -1) setSlashSelectedIndex(-1);
      return;
    }

    const current = filteredSlashCommands[slashSelectedIndex];
    if (slashSelectedIndex >= 0 && current?.enabled) return;

    setSlashSelectedIndex(getFirstEnabledSlashIndex(filteredSlashCommands));
  }, [slashOpen, filteredSlashCommands, slashSelectedIndex]);

  // ─── Basic handlers ───

  useEffect(() => {
    return () => {
      if (blurClearRafRef.current !== null) {
        cancelAnimationFrame(blurClearRafRef.current);
      }
    };
  }, []);

  const finalizePendingRefConversion = useCallback(() => {
    const pending = useUIStore.getState().pendingRefConversion;
    if (!pending || pending.tempNodeId !== nodeId) return;

    const tempNode = useNodeStore.getState().getNode(nodeId);
    const content = tempNode?.name ?? '';
    if (isOnlyInlineRef(content, tempNode?.inlineRefs)) {
      revertRefConversion(pending.tempNodeId, pending.refNodeId, pending.parentId);
    }
    setPendingRefConversion(null);
  }, [nodeId, revertRefConversion, setPendingRefConversion]);

  // Scroll newly focused node into view (e.g. after Enter creates a node off-screen)
  useEffect(() => {
    if (isFocused && rowRef.current) {
      rowRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [isFocused]);

  // Pending reference conversion must be finalized when focus transitions
  // from focused -> unfocused (including non-blur paths like Escape clearFocus).
  // Do NOT finalize on initial mount while still waiting for async focus handoff.
  useEffect(() => {
    if (isFocused) {
      wasFocusedRef.current = true;
      return;
    }
    if (!wasFocusedRef.current) return;
    wasFocusedRef.current = false;
    finalizePendingRefConversion();
  }, [isFocused, finalizePendingRefConversion]);

  const handleBlur = useCallback(() => {
    // Reset any open dropdown state so it doesn't persist across focus cycles.
    // Without this, clicking away while dropdown is open → re-focusing the same
    // node would show the dropdown again (hashTagOpen/refOpen were never reset).
    setHashTagOpen(false);
    setHashTagQuery('');
    setHashTagSelectedIndex(0);
    setHashTagAnchor(undefined);
    setRefOpen(false);
    setRefQuery('');
    setRefSelectedIndex(0);
    setRefAnchor(undefined);
    setSlashOpen(false);
    setSlashQuery('');
    setSlashSelectedIndex(-1);
    setSlashAnchor(undefined);

    // Check pending ref conversion: if this is a temp node, decide revert or keep.
    finalizePendingRefConversion();

    if (blurClearRafRef.current !== null) {
      cancelAnimationFrame(blurClearRafRef.current);
    }
    const structuralFocusSnapshot = peekStructuralToggleFocusSnapshot();
    if (
      structuralFocusSnapshot &&
      structuralFocusSnapshot.nodeId === nodeId &&
      (structuralFocusSnapshot.parentId === null || structuralFocusSnapshot.parentId === parentId)
    ) {
      return;
    }
    // Delay clearing focus by one frame so click handlers on the next node run
    // before the previous editor unmounts, preventing click-time layout shift.
    blurClearRafRef.current = requestAnimationFrame(() => {
      blurClearRafRef.current = null;
      // Only clear focus if this node is still the focused one.
      // Prevents race condition: Enter creates sibling → setFocusedNode(newId) →
      // old editor unmounts → onBlur fires → would wrongly reset to null.
      const state = useUIStore.getState();
      if (state.focusedNodeId === nodeId &&
        (state.focusedParentId === null || state.focusedParentId === parentId)) {
        setFocusedNode(null);
      }
    });
  }, [nodeId, parentId, setFocusedNode, finalizePendingRefConversion]);

  // mousedown: record text offset for cursor placement, but DON'T enter edit
  // mode. Edit mode is deferred to click so drag-select can take over if the
  // user drags (mounting RichTextEditor on mousedown captures subsequent mouse events).
  const handleContentMouseDown = useCallback((e: React.MouseEvent) => {
    if (isCheckboxFieldType(fieldDataType)) return;
    const target = e.target as HTMLElement;
    const refEl = target.closest('[data-inlineref-node]') as HTMLElement | null;
    if (refEl) return;

    const selectAction = resolveRowPointerSelectAction({
      justDragged: dragState.justDragged,
      metaKey: e.metaKey,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      allowSingle: false,
    });

    // Multi-select modifiers: Cmd+Click / Shift+Click (both reference and non-reference)
    if (selectAction === 'toggle') {
      e.preventDefault();
      handleCmdClick();
      return;
    }
    if (selectAction === 'range') {
      e.preventDefault();
      handleShiftClick();
      return;
    }

    const hasMultiSelection = useUIStore.getState().selectedNodeIds.size > 1;
    if (isReferenceLikeRow && !hasMultiSelection) return;

    // Record text offset now (mousedown position = click position for simple clicks).
    // Will be consumed by RichTextEditor when it mounts (after setFocusedNode in click).
    const container = e.currentTarget as HTMLElement;
    const textOffset = getTextOffsetFromPoint(container, e.clientX, e.clientY);
    const fallbackOffset = (() => {
      const textLength = getNodeTextLengthById(nodeId);
      if (textOffset !== null) return textOffset;
      const rect = container.getBoundingClientRect();
      return e.clientX <= rect.left + 2 ? 0 : textLength;
    })();
    // Use getRenderedTextRightEdge which walks actual text node Ranges for an
    // accurate right edge. The old getStaticNodeContentRightEdge queried the
    // .node-content <span>'s bounding rect which could report the container
    // width rather than the text width, causing first-click tail detection to
    // fail (cursor placed at offset 0 instead of end).
    const textRightEdge = getRenderedTextRightEdge(container);
    const textLength = getNodeTextLengthById(nodeId);
    const rect = container.getBoundingClientRect();
    const forceEndWhenRightBlank = textOffset === 0 && textLength > 0 && e.clientX > rect.left + 24;
    const forceEndWhenFarRight = textLength > 0 && e.clientX >= rect.left + rect.width * 0.66;
    const offsetFromRightEdge = textRightEdge !== null && e.clientX > textRightEdge + 1
      ? textLength
      : textRightEdge === null && forceEndWhenRightBlank
        ? textLength
        : fallbackOffset;
    const resolvedOffset = offsetFromRightEdge === 0 && forceEndWhenFarRight
      ? textLength
      : offsetFromRightEdge;
    useUIStore.getState().setFocusClickCoords(
      { nodeId, parentId, textOffset: resolvedOffset },
    );
    // Prevent native selection/focus churn on the static HTML layer.
    e.preventDefault();
  }, [isReferenceLikeRow, fieldDataType, nodeId, parentId, handleCmdClick, handleShiftClick]);

  // While editing, clicking the large blank area to the right of inline editor
  // should keep caret at end instead of blurring/re-entering at offset 0.
  const handleFocusedContentMouseDown = useCallback((e: React.MouseEvent) => {
    if (isCheckboxFieldType(fieldDataType)) return;
    if (e.button !== 0) return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;

    const target = e.target as HTMLElement;
    if (target.closest('.ProseMirror') || target.closest('[data-inlineref-node]')) {
      return;
    }

    const container = e.currentTarget as HTMLElement;
    const textRightEdge = getRenderedTextRightEdge(container);
    if (textRightEdge === null || e.clientX <= textRightEdge + 1) {
      return;
    }

    const ed = editorRef.current;
    if (!isEditorViewAlive(ed)) return;

    e.preventDefault();
    const endPos = Math.max(1, ed.state.doc.content.size - 1);
    setEditorSelection(ed, endPos, endPos);
    ed.focus();
  }, [fieldDataType]);

  // Fallback for large row blank area clicks: keep caret at end while focused.
  const handleFocusedRowMouseDownCapture = useCallback((e: React.MouseEvent) => {
    if (!isFocused) return;
    if (isCheckboxFieldType(fieldDataType)) return;
    if (e.button !== 0) return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;

    const target = e.target as HTMLElement;
    if (
      target.closest('.ProseMirror') ||
      target.closest('[data-inlineref-node]') ||
      target.closest('button') ||
      target.closest('input') ||
      target.closest('a') ||
      target.closest('.indent-line')
    ) {
      return;
    }

    const contentArea = contentAreaRef.current;
    if (!contentArea) return;

    const textRightEdge = getRenderedTextRightEdge(contentArea);
    if (textRightEdge === null || e.clientX <= textRightEdge + 1) {
      return;
    }

    const ed = editorRef.current;
    if (!isEditorViewAlive(ed)) return;

    e.preventDefault();
    const endPos = Math.max(1, ed.state.doc.content.size - 1);
    setEditorSelection(ed, endPos, endPos);
    ed.focus();
  }, [isFocused, fieldDataType]);

  const handleContentClick = useCallback((e: React.MouseEvent) => {
    // Drag-select just ended → suppress this click
    if (dragState.justDragged) return;

    // Intercept clicks on inline references (blue links in static display)
    const target = e.target as HTMLElement;
    const refEl = target.closest('[data-inlineref-node]') as HTMLElement;
    if (refEl && !isReferenceLikeRow) {
      e.stopPropagation();
      useUIStore.getState().setFocusClickCoords(null);
      const refId = refEl.getAttribute('data-inlineref-node');
      if (refId) {
        navigateTo(refId);
        return;
      }
    }
    const hasMultiSelection = useUIStore.getState().selectedNodeIds.size > 1;

    // Reference nodes:
    // - default: single click = select (frame), double click = edit
    // - while multi-select is active: single click exits selection mode and enters edit
    if (isReferenceLikeRow && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      if (hasMultiSelection) {
        setFocusedNode(nodeId, parentId);
        return;
      }
      setSelectedNode(nodeId, parentId, 'ref-click');
      return;
    }
    // Non-reference: enter edit mode (text offset already recorded in mousedown)
    if (!isReferenceLikeRow) {
      setFocusedNode(nodeId, parentId);
    }
  }, [nodeId, parentId, isReferenceLikeRow, isReference, setSelectedNode, setFocusedNode, navigateTo]);

  const handleContentDoubleClick = useCallback((e: React.MouseEvent) => {
    // Double click on reference node → enter edit mode
    if ((isReference || isPendingConversion) && !isOptionsValueNode) {
      const container = e.currentTarget as HTMLElement;
      const textOffset = getTextOffsetFromPoint(container, e.clientX, e.clientY);
      useUIStore.getState().setFocusClickCoords(
        textOffset !== null
          ? { nodeId, parentId, textOffset }
          : null,
      );
      setFocusedNode(nodeId, parentId);
    }
  }, [nodeId, parentId, isReference, isPendingConversion, isOptionsValueNode, setFocusedNode]);

  const handleToggle = useCallback(() => {
    const ek = `${parentId}:${nodeId}`;
    const currentHasChildren = (useNodeStore.getState().getNode(nodeId)?.children ?? []).length > 0;
    const currentlyExpanded = useUIStore.getState().expandedNodes.has(ek);

    if (!currentHasChildren && !currentlyExpanded) {
      // Leaf node: expand to show trailing input (auto-focuses)
      setExpanded(ek, true);
    } else {
      toggleExpanded(ek);
    }
    const structuralFocusSnapshot = peekStructuralToggleFocusSnapshot();
    if (structuralFocusSnapshot) {
      useUIStore.getState().setFocusedNode(structuralFocusSnapshot.nodeId, structuralFocusSnapshot.parentId);
    }
    // Prefer restoring the previously focused editor (even if it is a different row).
    if (!structuralFocusSnapshot || !focusEditorForNodeId(structuralFocusSnapshot.nodeId)) {
      focusRowUndoTarget(rowRef.current);
    }
    requestAnimationFrame(() => {
      const snap = peekStructuralToggleFocusSnapshot();
      if (!snap || !focusEditorForNodeId(snap.nodeId)) {
        focusRowUndoTarget(rowRef.current);
      }
      clearStructuralToggleFocusSnapshot();
    });
  }, [nodeId, parentId, toggleExpanded, setExpanded]);

  const handleDrillDown = useCallback(() => {
    navigateTo(panelNavigationNodeId);
  }, [panelNavigationNodeId, navigateTo]);

  const handleBulletClick = useCallback(() => {
    navigateTo(panelNavigationNodeId);
    ensureUndoFocusAfterNavigation();
  }, [panelNavigationNodeId, navigateTo]);

  const handleIndentLineClick = useCallback(() => {
    // Toggle expand/collapse all direct children (Tana indent guide line behavior)
    const currentChildIds = useNodeStore.getState().getNode(nodeId)?.children ?? [];
    if (currentChildIds.length === 0) return;
    const expanded = useUIStore.getState().expandedNodes;
    // Check if any child is expanded (compound key: nodeId is parent of children)
    const anyChildExpanded = currentChildIds.some((cid) => expanded.has(`${nodeId}:${cid}`));
    const next = new Set(expanded);
    for (const cid of currentChildIds) {
      const ck = `${nodeId}:${cid}`;
      if (anyChildExpanded) {
        next.delete(ck);
      } else {
        next.add(ck);
      }
    }
    loroDoc.commitUIMarker();
    useUIStore.setState({ expandedNodes: next });
    const structuralFocusSnapshot = peekStructuralToggleFocusSnapshot();
    if (structuralFocusSnapshot) {
      useUIStore.getState().setFocusedNode(structuralFocusSnapshot.nodeId, structuralFocusSnapshot.parentId);
    }
    if (!structuralFocusSnapshot || !focusEditorForNodeId(structuralFocusSnapshot.nodeId)) {
      focusRowUndoTarget(rowRef.current);
    }
    requestAnimationFrame(() => {
      const snap = peekStructuralToggleFocusSnapshot();
      if (!snap || !focusEditorForNodeId(snap.nodeId)) {
        focusRowUndoTarget(rowRef.current);
      }
      clearStructuralToggleFocusSnapshot();
    });
  }, [nodeId]);

  // ─── Keyboard shortcut handlers ───

  const handleEnter = useCallback(
    (afterContent?: EditorContentPayload) => {
      // Single-value field types: Enter navigates out instead of creating sibling
      if (isSingleValueFieldType(fieldDataType)) {
        if (onNavigateOut) onNavigateOut('down');
        return;
      }

      const currentlyExpanded = useUIStore.getState().expandedNodes.has(`${parentId}:${nodeId}`);
      const currentHasChildren = (useNodeStore.getState().getNode(nodeId)?.children ?? []).length > 0;

      if (currentlyExpanded && currentHasChildren) {
        // Expanded with children → new node becomes first child (position 0)
        const newNode = createChild(nodeId, 0, {
          name: afterContent?.text ?? '',
          marks: afterContent?.marks,
          inlineRefs: afterContent?.inlineRefs,
        });
        setFocusedNode(newNode.id, nodeId);
      } else {
        // Collapsed or leaf → create sibling after this node
        const newNode = createSibling(nodeId, {
          name: afterContent?.text,
          marks: afterContent?.marks,
          inlineRefs: afterContent?.inlineRefs,
        });
        setFocusedNode(newNode.id, parentId);
      }
    },
    [nodeId, parentId, fieldDataType, onNavigateOut, createSibling, createChild, setFocusedNode],
  );

  const handleIndent = useCallback(() => {
    // References cannot be indented (would cause ownership conflicts)
    if (loroDoc.getParentId(nodeId) !== parentId) return;

    // Pre-compute new parent (previous sibling) and expand it BEFORE moving.
    // This prevents the node from being unmounted between state updates,
    // which would cause blur → focus loss.
    const ownerId = loroDoc.getParentId(nodeId);
    if (!ownerId) return;

    const parent = useNodeStore.getState().getNode(ownerId);
    if (!parent?.children) return;

    const index = parent.children.indexOf(nodeId);
    if (index <= 0) return; // Can't indent first child

    const newParentId = parent.children[index - 1];
    setExpanded(`${ownerId}:${newParentId}`, true, true);
    indentNode(nodeId);
    // Update focusedParentId so the node keeps focus under its new parent
    setFocusedNode(nodeId, newParentId);
  }, [nodeId, parentId, indentNode, setExpanded, setFocusedNode]);

  const handleOutdent = useCallback(() => {
    // References cannot be outdented (would cause ownership conflicts)
    if (loroDoc.getParentId(nodeId) !== parentId) return;
    // Compute grandparent before moving so we can update focusedParentId
    const grandparentId = loroDoc.getParentId(parentId);
    outdentNode(nodeId);
    if (grandparentId) {
      setFocusedNode(nodeId, grandparentId);
    }
  }, [nodeId, parentId, outdentNode, setFocusedNode]);

  const handleDelete = useCallback((): boolean => {
    // Read current name from store — the closure's `node` may be stale
    // because saveContent() updates the store synchronously before this runs.
    const currentName = useNodeStore.getState().getNode(nodeId)?.name ?? '';
    const textOnly = currentName.replace(/\u200B/g, '').trim();
    if (textOnly.length > 0) return false;
    // Prevent deleting a whole subtree when Backspace is pressed on an empty parent.
    if (hasChildren) {
      triggerDeleteBlockedPulse();
      return true;
    }

    const latestUi = useUIStore.getState();
    const flatList = getFlattenedVisibleNodes(rootChildIds, latestUi.expandedNodes, rootNodeId);
    const prev = getPreviousVisibleNode(nodeId, parentId, flatList);

    // Reference: just remove from parent's children, don't trash the node.
    // Guard: also verify the node is actually in parentId's children. After indent,
    // the closure's parentId may be stale (old parent) while _ownerId is already
    // the new parent — this is NOT a reference, just a stale closure.
    const parentChildren = useNodeStore.getState().getNode(parentId)?.children ?? [];
    const isActualRef = loroDoc.getParentId(nodeId) !== parentId && parentChildren.includes(nodeId);
    if (isActualRef) {
      removeReference(nodeId);
    } else {
      trashNode(nodeId);
    }
    if (prev) {
      useUIStore.getState().setFocusClickCoords({
        nodeId: prev.nodeId,
        parentId: prev.parentId,
        textOffset: getNodeTextLengthById(prev.nodeId),
      });
      setFocusedNode(prev.nodeId, prev.parentId);
    } else {
      setFocusedNode(null);
    }
    return true;
  }, [
    nodeId,
    parentId,
    rootNodeId,
    rootChildIds,
    trashNode,
    removeReference,
    setFocusedNode,
    hasChildren,
    triggerDeleteBlockedPulse,
  ]);

  const handleBackspaceAtStart = useCallback((): boolean => {
    const latestUi = useUIStore.getState();
    const flatList = getFlattenedVisibleNodes(rootChildIds, latestUi.expandedNodes, rootNodeId);
    const prev = getPreviousVisibleNode(nodeId, parentId, flatList);
    if (!prev) return false;

    const prevNode = useNodeStore.getState().getNode(prev.nodeId);
    const currentNode = useNodeStore.getState().getNode(nodeId);
    if (!currentNode) return false;

    // Reference-like rows do not merge text into previous content;
    // they only navigate/focus previous row.
    if (isReferenceLikeRow) {
      if (prevNode && isOutlinerContentNodeType(prevNode.type)) {
        useUIStore.getState().setFocusClickCoords({
          nodeId: prev.nodeId,
          parentId: prev.parentId,
          textOffset: getNodeTextLengthById(prev.nodeId),
        });
        setFocusedNode(prev.nodeId, prev.parentId);
        return true;
      }
      if (prevNode?.type === 'fieldEntry') {
        clearFocus();
        setEditingFieldName(prev.nodeId);
        return true;
      }
      return false;
    }

    // Only merge into a regular content row. If previous is a field row,
    // fallback to moving focus there without destructive changes.
    if (!prevNode || !isOutlinerContentNodeType(prevNode.type)) {
      if (prevNode?.type === 'fieldEntry') {
        clearFocus();
        setEditingFieldName(prev.nodeId);
        return true;
      }
      return false;
    }

    const prevPayload = {
      text: prevNode.name ?? '',
      marks: prevNode.marks ?? [],
      inlineRefs: prevNode.inlineRefs ?? [],
    };
    const currentPayload = {
      text: currentNode.name ?? '',
      marks: currentNode.marks ?? [],
      inlineRefs: currentNode.inlineRefs ?? [],
    };
    const merged = mergeRichTextPayload(prevPayload, currentPayload);
    const joinOffset = prevPayload.text.length;

    updateNodeContent(prev.nodeId, {
      name: merged.text,
      marks: merged.marks,
      inlineRefs: merged.inlineRefs,
    });
    trashNode(nodeId);
    useUIStore.getState().setFocusClickCoords({
      nodeId: prev.nodeId,
      parentId: prev.parentId,
      textOffset: joinOffset,
    });
    setFocusedNode(prev.nodeId, prev.parentId);
    return true;
  }, [
    rootChildIds,
    rootNodeId,
    nodeId,
    parentId,
    isReferenceLikeRow,
    clearFocus,
    setEditingFieldName,
    updateNodeContent,
    trashNode,
    setFocusedNode,
  ]);

  const handleBackspaceAtEndSingleInlineRef = useCallback((): boolean => {
    if (!isPendingConversion || !pendingConversionRefTargetId) return false;

    const beforeChildren = useNodeStore.getState().getNode(parentId)?.children ?? loroDoc.getChildren(parentId);
    const beforeIndex = beforeChildren.indexOf(nodeId);

    revertRefConversion(nodeId, pendingConversionRefTargetId, parentId);
    setPendingRefConversion(null);

    const afterChildren = useNodeStore.getState().getNode(parentId)?.children ?? loroDoc.getChildren(parentId);
    let newRefId = beforeIndex >= 0 ? afterChildren[beforeIndex] : null;
    const directCandidate = newRefId ? useNodeStore.getState().getNode(newRefId) : null;
    if (!(directCandidate?.type === 'reference' && directCandidate.targetId === pendingConversionRefTargetId)) {
      newRefId = afterChildren.find((cid) => {
        const candidate = useNodeStore.getState().getNode(cid);
        return candidate?.type === 'reference' && candidate.targetId === pendingConversionRefTargetId;
      }) ?? null;
    }

    clearFocus();
    if (newRefId) {
      setSelectedNode(newRefId, parentId, 'ref-click');
      return true;
    }
    return false;
  }, [
    isPendingConversion,
    pendingConversionRefTargetId,
    parentId,
    nodeId,
    revertRefConversion,
    setPendingRefConversion,
    clearFocus,
    setSelectedNode,
  ]);

  const handleArrowUp = useCallback(() => {
    const siblingIndex = renderableSiblings.findIndex((item) => item.type === 'content' && item.id === nodeId);
    if (siblingIndex > 0) {
      const prevSibling = renderableSiblings[siblingIndex - 1];
      if (prevSibling?.type === 'field') {
        clearFocus();
        setEditingFieldName(prevSibling.id);
        return;
      }
    }

    const flatList = getFlattenedVisibleNodes(rootChildIds, expandedNodes, rootNodeId);
    const prev = getPreviousVisibleNode(nodeId, parentId, flatList);
    if (prev) {
      useUIStore.getState().setFocusClickCoords({
        nodeId: prev.nodeId,
        parentId: prev.parentId,
        textOffset: getNodeTextLengthById(prev.nodeId),
      });
      setFocusedNode(prev.nodeId, prev.parentId);
    } else if (onNavigateOut) {
      onNavigateOut('up');
    }
  }, [nodeId, parentId, rootNodeId, rootChildIds, expandedNodes, setFocusedNode, onNavigateOut, renderableSiblings, clearFocus, setEditingFieldName]);

  const handleArrowDown = useCallback(() => {
    // When expanded, ArrowDown first enters this node's child scope
    // (field rows/content rows/trailing row) before leaving to siblings.
    if (isExpanded) {
      if (firstRenderableChild) {
        if (firstRenderableChild.type === 'field') {
          clearFocus();
          setEditingFieldName(firstRenderableChild.id);
          return;
        }
        setFocusedNode(firstRenderableChild.id, nodeId);
        return;
      }
      if (shouldShowTrailingInput && focusTrailingInputForParent(nodeId)) {
        return;
      }
    }

    const siblingIndex = renderableSiblings.findIndex((item) => item.type === 'content' && item.id === nodeId);
    if (siblingIndex >= 0 && siblingIndex < renderableSiblings.length - 1) {
      const nextSibling = renderableSiblings[siblingIndex + 1];
      if (nextSibling?.type === 'field') {
        clearFocus();
        setEditingFieldName(nextSibling.id);
        return;
      }
    }

    // Virtual-row priority: when this is the last renderable sibling and a trailing
    // input exists under the same parent, focus it before jumping outside parent scope.
    if (siblingIndex === renderableSiblings.length - 1 && focusTrailingInputForParent(parentId)) {
      return;
    }

    const flatList = getFlattenedVisibleNodes(rootChildIds, expandedNodes, rootNodeId);
    const next = getNextVisibleNode(nodeId, parentId, flatList);
    if (next) {
      setFocusedNode(next.nodeId, next.parentId);
      return;
    }

    if (focusTrailingInputForParent(parentId)) {
      return;
    } else if (focusTrailingInputForParent(rootNodeId)) {
      return;
    } else if (onNavigateOut) {
      onNavigateOut('down');
    }
  }, [nodeId, parentId, rootNodeId, rootChildIds, expandedNodes, isExpanded, shouldShowTrailingInput, firstRenderableChild, setFocusedNode, onNavigateOut, renderableSiblings, clearFocus, setEditingFieldName]);

  const handleMoveUp = useCallback(() => {
    const ed = editorRef.current;
    const textOffset = isEditorViewAlive(ed)
      ? Math.max(0, ed.state.selection.from - 1)
      : getNodeTextLengthById(nodeId);

    useUIStore.getState().setFocusClickCoords({ nodeId, parentId, textOffset });
    moveNodeUp(nodeId);

    requestAnimationFrame(() => {
      const currentEditor = editorRef.current;
      if (!isEditorViewAlive(currentEditor)) return;
      const maxPos = Math.max(1, currentEditor.state.doc.content.size - 1);
      const pmPos = Math.max(1, Math.min(textOffset + 1, maxPos));
      setEditorSelection(currentEditor, pmPos, pmPos);
      currentEditor.focus();
      useUIStore.getState().setFocusClickCoords(null);
    });
  }, [nodeId, parentId, moveNodeUp]);

  const handleMoveDown = useCallback(() => {
    const ed = editorRef.current;
    const textOffset = isEditorViewAlive(ed)
      ? Math.max(0, ed.state.selection.from - 1)
      : getNodeTextLengthById(nodeId);

    useUIStore.getState().setFocusClickCoords({ nodeId, parentId, textOffset });
    moveNodeDown(nodeId);

    requestAnimationFrame(() => {
      const currentEditor = editorRef.current;
      if (!isEditorViewAlive(currentEditor)) return;
      const maxPos = Math.max(1, currentEditor.state.doc.content.size - 1);
      const pmPos = Math.max(1, Math.min(textOffset + 1, maxPos));
      setEditorSelection(currentEditor, pmPos, pmPos);
      currentEditor.focus();
      useUIStore.getState().setFocusClickCoords(null);
    });
  }, [nodeId, parentId, moveNodeDown]);

  // ─── # trigger handlers ───

  const handleHashTag = useCallback((query: string, from: number, to: number, anchor?: TriggerAnchorRect) => {
    hashRangeRef.current = { from, to };
    setHashTagQuery(query);
    setHashTagSelectedIndex(0);
    setHashTagAnchor(anchor);
    setHashTagOpen(true);
  }, [nodeId]);

  const handleHashTagDeactivate = useCallback(() => {
    setHashTagOpen(false);
    setHashTagQuery('');
    setHashTagSelectedIndex(0);
    setHashTagAnchor(undefined);
  }, [nodeId]);

  /** Delete #query text from editor, save corrected content, refocus */
  const cleanupHashTagText = useCallback(() => {
    const ed = editorRef.current;
    if (!isEditorViewAlive(ed)) return;

    const { from, to } = hashRangeRef.current;
    deleteEditorRange(ed, from, to);

    const parsed = docToMarks(ed.state.doc);
    updateNodeContent(nodeId, { name: parsed.text, marks: parsed.marks, inlineRefs: parsed.inlineRefs });
  }, [nodeId, updateNodeContent]);

  const handleHashTagSelect = useCallback(
    (tagDefId: string) => {
      cleanupHashTagText();
      applyTag(nodeId, tagDefId);
      setHashTagOpen(false);
      setHashTagQuery('');
      setHashTagSelectedIndex(0);
      setHashTagAnchor(undefined);
    },
    [nodeId, applyTag, cleanupHashTagText],
  );

  const handleHashTagCreateNew = useCallback(
    (name: string) => {
      cleanupHashTagText();
      const tagDef = createTagDef(name);
      applyTag(nodeId, tagDef.id);
      setHashTagOpen(false);
      setHashTagQuery('');
      setHashTagSelectedIndex(0);
      setHashTagAnchor(undefined);
    },
    [nodeId, createTagDef, applyTag, cleanupHashTagText],
  );

  // Keyboard forwarding: confirm selected item in dropdown
  const handleHashTagConfirm = useCallback(() => {
    const item = tagDropdownRef.current?.getSelectedItem();
    if (!item) return;
    if (item.type === 'existing') {
      handleHashTagSelect(item.id);
    } else {
      handleHashTagCreateNew(item.name);
    }
  }, [handleHashTagSelect, handleHashTagCreateNew]);

  // Keyboard forwarding: navigate down in dropdown
  const handleHashTagNavDown = useCallback(() => {
    setHashTagSelectedIndex((i) => {
      const count = tagDropdownRef.current?.getItemCount() ?? 0;
      return count > 0 ? Math.min(i + 1, count - 1) : 0;
    });
  }, []);

  // Keyboard forwarding: navigate up in dropdown
  const handleHashTagNavUp = useCallback(() => {
    setHashTagSelectedIndex((i) => Math.max(i - 1, 0));
  }, []);

  // Keyboard forwarding: Cmd+Enter → force create new tag
  const handleHashTagForceCreate = useCallback(() => {
    const query = hashTagQuery.trim();
    if (query) {
      handleHashTagCreateNew(query);
    }
  }, [hashTagQuery, handleHashTagCreateNew]);

  // Keyboard forwarding: Escape → close dropdown
  const handleHashTagClose = useCallback(() => {
    setHashTagOpen(false);
    setHashTagQuery('');
    setHashTagSelectedIndex(0);
    setHashTagAnchor(undefined);
  }, []);

  // ─── > field trigger (fire-once: instantly creates unnamed field) ───

  const handleFieldTriggerFire = useCallback(() => {
    const actualParentId = loroDoc.getParentId(nodeId);
    if (!actualParentId) return;
    const { fieldEntryId } = addUnnamedFieldToNode(actualParentId, nodeId);
    trashNode(nodeId);
    setEditingFieldName(fieldEntryId);
  }, [nodeId, addUnnamedFieldToNode, trashNode, setEditingFieldName]);

  // ─── @ reference trigger handlers ───

  const handleReference = useCallback((query: string, from: number, to: number, anchor?: TriggerAnchorRect) => {
    refRangeRef.current = { from, to };
    const ed = editorRef.current;
    if (isEditorViewAlive(ed)) {
      const fullText = ed.state.doc.textContent;
      const beforeAt = fullText.substring(0, from - 1);
      const afterQuery = fullText.substring(to - 1);
      const isEmptyAround = beforeAt.trim() === '' && afterQuery.trim() === '';
      setRefTreeContextParentId(isEmptyAround ? parentId : null);
    } else {
      setRefTreeContextParentId(null);
    }
    setRefQuery(query);
    setRefSelectedIndex(0);
    setRefAnchor(anchor);
    setRefOpen(true);
  }, [parentId]);

  const handleReferenceDeactivate = useCallback(() => {
    setRefOpen(false);
    setRefQuery('');
    setRefSelectedIndex(0);
    setRefAnchor(undefined);
    setRefTreeContextParentId(null);
  }, []);

  const handleReferenceSelect = useCallback(
    (refNodeId: string) => {
      const ed = editorRef.current;
      if (!isEditorViewAlive(ed)) return;

      // Check if the entire editor content is just the @query (empty-node reference)
      const fullText = ed.state.doc.textContent;
      const { from, to } = refRangeRef.current;
      // Text before the @ and after the query
      const beforeAt = fullText.substring(0, from - 1);
      const afterQuery = fullText.substring(to - 1);
      const isEmptyAround = beforeAt.trim() === '' && afterQuery.trim() === '';

      if (isEmptyAround) {
        const parent = useNodeStore.getState().getNode(parentId);
        const blockReason = getTreeReferenceBlockReason(parentId, refNodeId, {
          hasNode: loroDoc.hasNode,
          getNode: loroDoc.toNodexNode,
          getChildren: loroDoc.getChildren,
        });
        if (blockReason) {
          toast.warning(getTreeReferenceBlockMessage(blockReason));
          return;
        }
        const alreadyChild = (parent?.children?.some((cid) => {
          if (cid === refNodeId) return true;
          const child = loroDoc.toNodexNode(cid);
          return child?.type === 'reference' && child.targetId === refNodeId;
        })) ?? false;

        if (alreadyChild) {
          // Target is already a child (owned or reference) — can't create duplicate reference.
          // Tana behavior: insert inline ref instead, keeping this as a regular content node.
          const refNode = loroDoc.toNodexNode(refNodeId);
          const refName = (refNode?.name ?? '').trim() || 'Untitled';
          replaceEditorRangeWithInlineRef(ed, from, to, refNodeId, refName);
        } else {
          // Empty node @: trash this node, create temp node in conversion mode
          // Temp node has inline ref content — user sees reference bullet + cursor at end.
          // Typing adds text → keeps as normal node; blur without typing → reverts to reference.
          const pos = parent?.children?.indexOf(nodeId) ?? -1;
          const insertPos = pos >= 0 ? pos : 0;
          const newRefId = addReference(parentId, refNodeId, insertPos);
          if (!newRefId) {
            toast.warning(t('reference.blocked.createFallback'));
            return;
          }
          trashNode(nodeId);
          const tempNodeId = startRefConversion(newRefId, parentId, insertPos);
          setPendingRefConversion({ tempNodeId, refNodeId, parentId });
          const gpId = loroDoc.getParentId(parentId);
          if (gpId) setExpanded(`${gpId}:${parentId}`, true, true);
          useUIStore.getState().setPendingInputChar(null);
          useUIStore.getState().setFocusClickCoords({
            nodeId: tempNodeId,
            parentId,
            textOffset: 1,
          });
          setTimeout(() => setFocusedNode(tempNodeId, parentId), 0);
        }
      } else {
        // Mid-text @: insert inline reference
        const refNode = loroDoc.toNodexNode(refNodeId);
        const refName = (refNode?.name ?? '').trim() || 'Untitled';
        replaceEditorRangeWithInlineRef(ed, from, to, refNodeId, refName);
      }

      setRefOpen(false);
      setRefQuery('');
      setRefSelectedIndex(0);
      setRefAnchor(undefined);
      setRefTreeContextParentId(null);
    },
    [nodeId, parentId, addReference, trashNode, setExpanded, setFocusedNode, startRefConversion, setPendingRefConversion],
  );

  const handleReferenceCreateNew = useCallback(
    (name: string) => {
      const newNode = useNodeStore.getState().createChild(CONTAINER_IDS.LIBRARY, undefined, { name });
      handleReferenceSelect(newNode.id);
    },
    [handleReferenceSelect],
  );

  const handleReferenceConfirm = useCallback(() => {
    const item = refDropdownRef.current?.getSelectedItem();
    if (!item) return;
    if (item.type === 'existing') {
      handleReferenceSelect(item.id);
    } else {
      handleReferenceCreateNew(item.name);
    }
  }, [handleReferenceSelect, handleReferenceCreateNew]);

  const handleReferenceNavDown = useCallback(() => {
    setRefSelectedIndex((i) => {
      const count = refDropdownRef.current?.getItemCount() ?? 0;
      return count > 0 ? Math.min(i + 1, count - 1) : 0;
    });
  }, []);

  const handleReferenceNavUp = useCallback(() => {
    setRefSelectedIndex((i) => Math.max(i - 1, 0));
  }, []);

  const handleReferenceForceCreate = useCallback(() => {
    const query = refQuery.trim();
    if (query) {
      handleReferenceCreateNew(query);
    }
  }, [refQuery, handleReferenceCreateNew]);

  const handleReferenceClose = useCallback(() => {
    setRefOpen(false);
    setRefQuery('');
    setRefSelectedIndex(0);
    setRefAnchor(undefined);
  }, []);

  // ─── / slash command handlers ───

  const replaceSlashTriggerText = useCallback((replacement = '') => {
    const ed = editorRef.current;
    if (!isEditorViewAlive(ed)) return;
    const { from, to } = slashRangeRef.current;
    replaceEditorRangeWithText(ed, from, to, replacement);
  }, []);

  const closeSlashMenu = useCallback(() => {
    setSlashOpen(false);
    setSlashQuery('');
    setSlashSelectedIndex(-1);
    setSlashAnchor(undefined);
  }, []);

  const executeSlashCommand = useCallback(async (commandId: SlashCommandId) => {
    if (commandId === 'field') {
      replaceSlashTriggerText('>');
      closeSlashMenu();
      return;
    }

    if (commandId === 'reference') {
      replaceSlashTriggerText('@');
      closeSlashMenu();
      return;
    }

    if (commandId === 'heading') {
      replaceSlashTriggerText('');
      const ed = editorRef.current;
      if (isEditorViewAlive(ed)) {
        const { from, to } = ed.state.selection;
        const docEnd = ed.state.doc.content.size - 1;

        if (from !== to) {
          toggleHeadingMark(ed);
        } else if (docEnd > 1) {
          const cursorPos = Math.max(1, Math.min(from, docEnd));
          setEditorSelection(ed, 1, docEnd);
          toggleHeadingMark(ed);
          setEditorSelection(ed, cursorPos, cursorPos);
        } else {
          toggleHeadingMark(ed);
        }
      }
      closeSlashMenu();
      return;
    }

    if (commandId === 'more_commands') {
      replaceSlashTriggerText('');
      closeSlashMenu();
      openSearch();
      return;
    }

    if (commandId === 'checkbox') {
      replaceSlashTriggerText('');
      handleCycleCheckbox();
      closeSlashMenu();
      return;
    }

    if (commandId === 'clip_page') {
      replaceSlashTriggerText('');
      closeSlashMenu();

      const canUseRuntime =
        typeof chrome !== 'undefined' &&
        !!chrome.runtime &&
        !!chrome.runtime.sendMessage;

      if (!canUseRuntime) return;

      try {
        const response = await chrome.runtime.sendMessage({
          type: WEBCLIP_CAPTURE_ACTIVE_TAB,
        }) as WebClipCaptureResponse;

        if (!response?.ok) {
          toast.error('Clip failed', { description: response?.error ?? 'unknown error' });
          return;
        }

        const store = useNodeStore.getState();
        await applyWebClipToNode(nodeId, response.payload, store);

        // Sync editor content with the new title so it's visible immediately
        // (without this, the editor still shows empty until focus moves away)
        const ed = editorRef.current;
        if (isEditorViewAlive(ed) && response.payload.title) {
          setEditorPlainTextContent(ed, response.payload.title);
        }

        toast.success('Page clipped', { description: response.payload.title });
      } catch (err) {
        toast.error('Clip failed', { description: err instanceof Error ? err.message : String(err) });
      }
    }
  }, [replaceSlashTriggerText, closeSlashMenu, openSearch, handleCycleCheckbox, nodeId]);

  const handleSlashCommand = useCallback((query: string, from: number, to: number, anchor?: TriggerAnchorRect) => {
    slashRangeRef.current = { from, to };
    setSlashQuery(query);
    setSlashAnchor(anchor);
    setSlashOpen(true);

    // Slash command has its own menu; close other trigger dropdowns.
    setHashTagOpen(false);
    setHashTagQuery('');
    setHashTagSelectedIndex(0);
    setHashTagAnchor(undefined);
    setRefOpen(false);
    setRefQuery('');
    setRefSelectedIndex(0);
    setRefAnchor(undefined);
  }, []);

  const handleSlashDeactivate = useCallback(() => {
    closeSlashMenu();
  }, [closeSlashMenu]);

  const handleSlashConfirm = useCallback(() => {
    if (slashSelectedIndex < 0) return;
    const selected = filteredSlashCommands[slashSelectedIndex];
    if (!selected || !selected.enabled) return;
    executeSlashCommand(selected.id);
  }, [slashSelectedIndex, filteredSlashCommands, executeSlashCommand]);

  const handleSlashNavDown = useCallback(() => {
    setSlashSelectedIndex((i) => getNextEnabledSlashIndex(filteredSlashCommands, i, 'down'));
  }, [filteredSlashCommands]);

  const handleSlashNavUp = useCallback(() => {
    setSlashSelectedIndex((i) => getNextEnabledSlashIndex(filteredSlashCommands, i, 'up'));
  }, [filteredSlashCommands]);

  // ─── Drag and drop handlers ───

  const handleDragStart = useCallback(
    (e: DragEvent) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', nodeId);
      setDrag(nodeId);
    },
    [nodeId, setDrag],
  );

  const handleDragOver = useCallback(
    (e: DragEvent) => {
      if (!dragNodeId || dragNodeId === nodeId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const rect = rowRef.current?.getBoundingClientRect();
      if (!rect) return;

      const position = resolveDropHoverPosition({
        offsetY: e.clientY - rect.top,
        rowHeight: rect.height,
      });
      setDropTarget(nodeId, position);
    },
    [nodeId, dragNodeId, setDropTarget],
  );

  const handleDragLeave = useCallback(() => {
    if (dropTargetId === nodeId) {
      setDropTarget(null, null);
    }
  }, [nodeId, dropTargetId, setDropTarget]);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      if (!dragNodeId || dragNodeId === nodeId) {
        setDrag(null);
        return;
      }

      const dropParentId = loroDoc.getParentId(nodeId);
      if (!dropParentId) {
        setDrag(null);
        return;
      }

      const dropParent = useNodeStore.getState().getNode(dropParentId);
      const siblingIndex = dropParent?.children?.indexOf(nodeId) ?? 0;

      const decision = resolveDropMove({
        dragNodeId,
        targetNodeId: nodeId,
        targetParentId: dropParentId,
        targetParentKey: `${parentId}:${nodeId}`,
        siblingIndex,
        dropPosition,
        targetHasChildren: hasChildren,
        targetIsExpanded: isExpanded,
      });

      if (decision) {
        moveNodeTo(dragNodeId, decision.newParentId, decision.position);
        if (decision.expandKey) {
          setExpanded(decision.expandKey, true, true);
        }
      }

      setDrag(null);
    },
    [dragNodeId, nodeId, parentId, dropPosition, hasChildren, isExpanded, moveNodeTo, setExpanded, setDrag],
  );

  const handleDragEnd = useCallback(() => {
    setDrag(null);
  }, [setDrag]);

  // ─── Render ───

  if (!node) {
    return (
      <div
        className="text-xs text-muted-foreground"
        style={{ paddingLeft: depth * 28 }}
      >
        Loading...
      </div>
    );
  }

  const isDropTarget = dropTargetId === nodeId;
  const isDragging = dragNodeId === nodeId;
  const nodeText = effectiveNode?.name ?? '';
  const nodeDisplayText = isOptionsValueNode ? (selectedOptionName || nodeText) : nodeText;
  const nodeMarks = effectiveNode?.marks ?? [];
  const nodeInlineRefs = effectiveNode?.inlineRefs ?? [];
  const nodeContentHtml = marksToHtml(
    nodeDisplayText,
    isOptionsValueNode ? [] : nodeMarks,
    isOptionsValueNode ? [] : nodeInlineRefs,
  );
  // optionsPicker can open on selected (not focused) reference-like rows.
  // Keep row on top whenever any overlay is open, otherwise sibling rows may paint above it.
  const hasOverlayOpen = (isFocused && (hashTagOpen || refOpen || slashOpen)) || optionsPickerOpen;

  return (
    <div role="treeitem" aria-expanded={isExpanded} className="relative">
      {/* Drop indicator: before */}
      {isDropTarget && dropPosition === 'before' && (
        <div
          className="h-0.5 bg-primary rounded-full"
          style={{ marginLeft: depth * 28 + 6 + 15 }}
        />
      )}
      <div
        ref={rowRef}
        tabIndex={-1}
        className={`group/row flex gap-1 min-h-6 items-start py-1 relative ${isDropTarget && dropPosition === 'inside'
          ? 'bg-primary/10 ring-1 ring-primary/30 rounded-sm'
          : ''
          } ${isDragging ? 'opacity-40' : ''} ${hasOverlayOpen ? 'z-[80]' : ''}`}
        style={{ paddingLeft: depth * 28 + 6 }}
        data-node-id={nodeId}
        data-parent-id={parentId}
        draggable={!isFocused}
        onMouseDownCapture={isFocused ? handleFocusedRowMouseDownCapture : undefined}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
      >
        {/* Per-row selection highlight: global selection mode only (Esc/drag/multi-select). */}
        {showRowHighlight && (
          <div
            className="absolute right-0 bg-selection-row rounded-sm border border-primary/[0.15] pointer-events-none"
            style={{ left: depth * 28 + 6 + 15, top: 1, bottom: 1 }}
          />
        )}
        {/* Chevron: 15px zone, visible on row hover only */}
        <ChevronButton
          isExpanded={isExpanded}
          onToggle={handleToggle}
          onDrillDown={handleDrillDown}
          onTogglePointerDown={captureStructuralToggleFocusSnapshot}
        />
        <div className={`flex items-start gap-2 min-w-0 relative ${isSelectedRefClick ? 'node-selected-ref w-fit flex-none' : 'flex-1'}`}>
          <div className={deleteBlockedPulse ? 'node-delete-blocked-pulse' : ''}>
            <BulletChevron
              hasChildren={hasChildren}
              isExpanded={isExpanded}
              onBulletClick={handleBulletClick}
              isReference={isReferenceLikeRow}
              tagDefColor={isTagDef ? resolveTagColor(nodeId).text : undefined}
              bulletColors={effectiveBulletColors}
              icon={structuralIcon}
            />
          </div>
          {showCheckbox && (
            <span className="flex shrink-0 h-6 w-[15px] items-center justify-center">
              <input
                type="checkbox"
                checked={isDone}
                onChange={handleCheckboxToggle}
                className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
              />
            </span>
          )}
          <div
            className={`relative flex-1 min-w-0 ${isPendingConversion ? 'ref-converting' : ''} ${isDone ? 'text-foreground/40' : ''}`}
            style={pendingConversionStyle}
          >
            <div
              ref={contentAreaRef}
              className={`text-[15px] leading-6 ${!isCheckboxFieldType(fieldDataType) && !isFocused ? (isReferenceLikeRow ? 'cursor-default' : 'cursor-text') : ''}`}
              onMouseDown={!isCheckboxFieldType(fieldDataType) ? (isFocused ? handleFocusedContentMouseDown : handleContentMouseDown) : undefined}
              onClick={!isCheckboxFieldType(fieldDataType) && !isFocused ? handleContentClick : undefined}
              onDoubleClick={!isCheckboxFieldType(fieldDataType) && !isFocused && isReference && !isOptionsValueNode ? handleContentDoubleClick : undefined}
            >
              {isCheckboxFieldType(fieldDataType) ? (
                <input
                  type="checkbox"
                  checked={node.name === SYS_V.YES}
                  onChange={(e) => {
                    setNodeName(nodeId, e.target.checked ? SYS_V.YES : SYS_V.NO);
                  }}
                  className="mt-[3px] h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
                />
              ) : isFocused ? (
                <RichTextEditor
                  nodeId={nodeId}
                  parentId={parentId}
                  initialText={nodeText}
                  initialMarks={nodeMarks}
                  initialInlineRefs={nodeInlineRefs}
                  onBlur={handleBlur}
                  onEnter={handleEnter}
                  onIndent={handleIndent}
                  onOutdent={handleOutdent}
                  onDelete={handleDelete}
                  onBackspaceAtStart={handleBackspaceAtStart}
                  onBackspaceAtEndSingleInlineRef={handleBackspaceAtEndSingleInlineRef}
                  onArrowUp={handleArrowUp}
                  onArrowDown={handleArrowDown}
                  onMoveUp={handleMoveUp}
                  onMoveDown={handleMoveDown}
                  onHashTag={handleHashTag}
                  onHashTagDeactivate={handleHashTagDeactivate}
                  hashTagActive={hashTagOpen}
                  onHashTagConfirm={handleHashTagConfirm}
                  onHashTagNavDown={handleHashTagNavDown}
                  onHashTagNavUp={handleHashTagNavUp}
                  onHashTagCreate={handleHashTagForceCreate}
                  onHashTagClose={handleHashTagClose}
                  onFieldTriggerFire={handleFieldTriggerFire}
                  editorRef={editorRef}
                  onReference={handleReference}
                  onReferenceDeactivate={handleReferenceDeactivate}
                  referenceActive={refOpen}
                  onReferenceConfirm={handleReferenceConfirm}
                  onReferenceNavDown={handleReferenceNavDown}
                  onReferenceNavUp={handleReferenceNavUp}
                  onReferenceCreate={handleReferenceForceCreate}
                  onReferenceClose={handleReferenceClose}
                  onSlashCommand={handleSlashCommand}
                  onSlashCommandDeactivate={handleSlashDeactivate}
                  slashActive={slashOpen}
                  onSlashConfirm={handleSlashConfirm}
                  onSlashNavDown={handleSlashNavDown}
                  onSlashNavUp={handleSlashNavUp}
                  onSlashClose={closeSlashMenu}
                  onDescriptionEdit={handleDescriptionEdit}
                  onToggleDone={handleCycleCheckbox}
                  onEscapeSelect={handleEscapeSelect}
                  onShiftArrow={handleShiftArrow}
                  onSelectAll={handleSelectAll}
                />
              ) : (
                <span
                  className="node-content"
                  dangerouslySetInnerHTML={{ __html: nodeContentHtml || '&#8203;' }}
                />
              )}
              {hasTags && (
                <span className="inline-flex align-baseline ml-1.5" onClick={(e) => e.stopPropagation()}>
                  <TagBar nodeId={effectiveNodeId} />
                </span>
              )}
            </div>
            {/* Description: gray text below name */}
            {(description || editingDescription) && (
              <div
                ref={editingDescription ? descriptionRef : undefined}
                contentEditable={editingDescription}
                suppressContentEditableWarning
                className={`text-xs leading-[15px] min-h-[15px] text-foreground-tertiary cursor-text ${editingDescription ? 'outline-none' : ''}`}
                onMouseDown={!editingDescription ? handleDescriptionMouseDown : undefined}
                onBlur={editingDescription ? handleDescriptionBlur : undefined}
                onKeyDown={editingDescription ? handleDescriptionKeyDown : undefined}
              >
                {!editingDescription && description}
              </div>
            )}
            {hashTagOpen && isFocused && (
              <TagSelector
                ref={tagDropdownRef}
                open={hashTagOpen}
                onSelect={handleHashTagSelect}
                onCreateNew={handleHashTagCreateNew}
                existingTagIds={tagIds}
                query={hashTagQuery}
                selectedIndex={hashTagSelectedIndex}
                anchor={hashTagAnchor}
              />
            )}
            {refOpen && isFocused && (
              <ReferenceSelector
                ref={refDropdownRef}
                open={refOpen}
                onSelect={handleReferenceSelect}
                onCreateNew={handleReferenceCreateNew}
                query={refQuery}
                selectedIndex={refSelectedIndex}
                currentNodeId={nodeId}
                treeReferenceParentId={refTreeContextParentId}
                anchor={refAnchor}
              />
            )}
            {slashOpen && isFocused && (
              <SlashCommandMenu
                open={slashOpen}
                commands={filteredSlashCommands}
                selectedIndex={slashSelectedIndex}
                onSelect={executeSlashCommand}
                anchor={slashAnchor}
              />
            )}
          </div>
          {/* Options picker dropdown: shown when selecting an Options value row/reference */}
          {optionsPickerOpen && allFieldOptions.length > 0 && (
            <div
              className="absolute left-0 top-full mt-0.5 max-h-48 w-56 overflow-y-auto rounded-lg border border-border bg-surface p-1 "
              style={{ zIndex: FIELD_OVERLAY_Z_INDEX }}
            >
              {allFieldOptions.map((opt, i) => (
                <div
                  key={opt.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm ${opt.id === selectedOptionId
                    ? 'bg-primary text-primary-foreground'
                    : i === optionsPickerIndex
                      ? 'bg-accent text-accent-foreground'
                      : 'text-popover-foreground hover:bg-accent/50'
                    }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (opt.id !== selectedOptionId) {
                      selectFieldOption(parentId, opt.id, nodeId);
                    }
                    setSelectedNode(null);
                  }}
                >
                  <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-foreground/40" />
                  <span className="truncate">{opt.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>{/* close selection/contents wrapper */}
      </div>
      {/* Drop indicator: after */}
      {isDropTarget && dropPosition === 'after' && (
        <div
          className="h-0.5 bg-primary rounded-full"
          style={{ marginLeft: depth * 28 + 6 + 15 + 4 }}
        />
      )}
      {/* Indent guide line — moved to root relative container so it spans multi-line parent texts */}
      {isExpanded && !isCyclicReferenceExpansion && (
        <button
          className="indent-line absolute bottom-0 z-10 cursor-pointer"
          style={{ top: 24, left: depth * 28 + 17, width: 16 }}
          tabIndex={-1}
          onPointerDown={(e) => {
            captureStructuralToggleFocusSnapshot();
            e.preventDefault();
          }}
          onMouseDown={(e) => {
            // Keep focus on the editor/page instead of this button so Cmd+Z still reaches
            // unified undo handlers immediately after expand/collapse clicks.
            e.preventDefault();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleIndentLineClick();
          }}
          title={t('outliner.toggleChildren')}
        >
          <div
            className="indent-line-inner absolute top-0 bottom-0 w-[1px] rounded-full bg-border-subtle group-hover/outliner-item:bg-border hover:!bg-border-emphasis transition-all duration-150"
            style={{ left: 15.5, transform: 'translateX(-50%)' }}
          />
        </button>
      )}
      {isExpanded && !isCyclicReferenceExpansion && (
        <div className="relative" data-row-scope-parent-id={nodeId} ref={childrenScopeRef}>
          {/* Selection subtree mask: children area, connects to parent row above (global selection only). */}
          {isSelectedGlobal && (
            <div
              className="absolute right-0 bg-selection rounded-b-sm rounded-t-none pointer-events-none z-0"
              style={{ left: depth * 28 + 6 + 15, top: -1, bottom: 1 }}
            />
          )}
          {/* Hidden field pills: compact clickable chips to temporarily reveal hidden fields */}
          {hiddenRevealableFields.length > 0 && hiddenRevealableFields.some(f => !revealedFieldIds.has(f.id)) && (
            <div className="flex flex-wrap gap-x-3 min-h-6 items-center" style={{ paddingLeft: (depth + 1) * 28 + 6 + 15 + 4 }}>
              {hiddenRevealableFields.filter(f => !revealedFieldIds.has(f.id)).map(f => (
                <button
                  key={f.id}
                  className="flex items-center gap-0.5 h-6 text-xs text-foreground-tertiary hover:text-foreground-secondary transition-colors cursor-pointer"
                  onClick={() => setRevealedFieldIds(prev => new Set(prev).add(f.id))}
                  title={t('outliner.showField', { name: f.name })}
                >
                  <span className="w-[15px] flex items-center justify-center text-[11px] leading-none shrink-0">+</span>
                  <span>{f.name}</span>
                </button>
              ))}
            </div>
          )}
          {/* Render children in natural order: fields as FieldRow, content as OutlinerItem */}
          {visibleChildren.map(({ id, type, hidden }, i) => {
            // Hidden fields: skip unless manually revealed via pill click
            if (hidden && !revealedFieldIds.has(id)) return null;
            return type === 'field' ? (
              <div key={id} className="@container" style={{ paddingLeft: (depth + 1) * 28 + 6 + 15 + 4 }}>
                <FieldRow
                  nodeId={effectiveNodeId}
                  {...toFieldRowEntryProps(fieldMap.get(id)!)}
                  rootChildIds={rootChildIds}
                  rootNodeId={rootNodeId}
                  isLastInGroup={i === visibleChildren.length - 1 || visibleChildren[i + 1].type !== 'field'}
                  ownerTagColor={fieldOwnerColors.get(id)}
                  onNavigateOut={(direction) => {
                    if (direction === 'up') {
                      // Escape up from first field/value block → focus parent content node.
                      useUIStore.getState().setFocusClickCoords({
                        nodeId,
                        parentId,
                        textOffset: getNodeTextLengthById(nodeId),
                      });
                      setFocusedNode(nodeId, parentId);
                    } else {
                      // Escape down → focus next sibling item in this parent.
                      let found = false;
                      for (let j = i + 1; j < visibleChildren.length; j++) {
                        const nextItem = visibleChildren[j];
                        if (nextItem.hidden) continue;
                        if (nextItem.type === 'field') {
                          clearFocus();
                          setEditingFieldName(nextItem.id);
                          found = true;
                          break;
                        }
                        if (nextItem.type === 'content') {
                          useUIStore.getState().setFocusClickCoords({
                            nodeId: nextItem.id,
                            parentId: effectiveNodeId,
                            textOffset: 0,
                          });
                          setFocusedNode(nextItem.id, effectiveNodeId);
                          found = true;
                          break;
                        }
                      }
                      if (!found) {
                        if (focusTrailingInputForParent(effectiveNodeId)) {
                          return;
                        }
                        const fl = getFlattenedVisibleNodes(rootChildIds, useUIStore.getState().expandedNodes, rootNodeId);
                        const nx = getNextVisibleNode(nodeId, parentId, fl);
                        if (nx) {
                          useUIStore.getState().setFocusClickCoords({
                            nodeId: nx.nodeId,
                            parentId: nx.parentId,
                            textOffset: 0,
                          });
                          setFocusedNode(nx.nodeId, nx.parentId);
                          return;
                        }
                        if (focusTrailingInputForParent(rootNodeId)) {
                          return;
                        }
                      }
                    }
                  }}
                />
              </div>
            ) : (
              <OutlinerItem
                key={id}
                nodeId={id}
                depth={depth + 1}
                rootChildIds={rootChildIds}
                parentId={effectiveNodeId}
                rootNodeId={rootNodeId}
                referencePath={nextReferencePath}
                bulletColors={templateContentColors.get(id)}
              />
            );
          })}
          {shouldShowTrailingInput && (
            <TrailingInput
              parentId={effectiveNodeId}
              depth={depth + 1}
              autoFocus={!lastRenderableChild}
              parentExpandKey={expandKey}
              onNavigateOut={(direction) => {
                if (direction === 'up') {
                  const fl = getFlattenedVisibleNodes(
                    rootChildIds,
                    useUIStore.getState().expandedNodes,
                    rootNodeId,
                  );
                  // Find the true previous visible node prior to our parent
                  // By finding our parent's index and taking the node *right after* its descendants ends?
                  // Actually, TrailingInput resides exactly AT THE END of its 'effectiveNodeId''s scope.
                  // So we just need to find the node whose 'expanded content' ends exactly here,
                  // or more simply, we find the node that appears exactly BEFORE the next sibling of 'effectiveNodeId'.
                  // Which is equivalent to taking the last node in the flattened list if we just build a flattened list for 'effectiveNodeId'.
                  const parentChildren = useNodeStore.getState().getNode(effectiveNodeId)?.children ?? [];
                  const parentFl = getFlattenedVisibleNodes(
                    parentChildren,
                    useUIStore.getState().expandedNodes,
                    effectiveNodeId,
                  );
                  if (parentFl.length > 0) {
                    const lastNode = parentFl[parentFl.length - 1];
                    useUIStore.getState().setFocusClickCoords({
                      nodeId: lastNode.nodeId,
                      parentId: lastNode.parentId,
                      textOffset: getNodeTextLengthById(lastNode.nodeId),
                    });
                    setFocusedNode(lastNode.nodeId, lastNode.parentId);
                    return;
                  }

                  // If `effectiveNodeId` has no visible children, focus the parent itself.
                  useUIStore.getState().setFocusClickCoords({
                    nodeId,
                    parentId,
                    textOffset: getNodeTextLengthById(nodeId),
                  });
                  setFocusedNode(nodeId, parentId);
                  return;
                }
                const fl = getFlattenedVisibleNodes(
                  rootChildIds,
                  useUIStore.getState().expandedNodes,
                  rootNodeId,
                );
                const nx = getNextVisibleNode(nodeId, parentId, fl);
                if (!nx) return;
                useUIStore.getState().setFocusClickCoords({
                  nodeId: nx.nodeId,
                  parentId: nx.parentId,
                  textOffset: 0,
                });
                setFocusedNode(nx.nodeId, nx.parentId);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function getTextOffsetFromPoint(container: HTMLElement, clientX: number, clientY: number): number | null {
  const doc = container.ownerDocument;
  const docWithCaret = doc as Document & {
    caretPositionFromPoint?: (x: number, y: number) => CaretPosition | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };

  let startContainer: Node | null = null;
  let startOffset = 0;

  try {
    const pos = docWithCaret.caretPositionFromPoint?.(clientX, clientY);
    if (pos) {
      startContainer = pos.offsetNode;
      startOffset = pos.offset;
    } else {
      const range = docWithCaret.caretRangeFromPoint?.(clientX, clientY);
      if (range) {
        startContainer = range.startContainer;
        startOffset = range.startOffset;
      }
    }
  } catch {
    return null;
  }

  if (!startContainer || !container.contains(startContainer)) {
    return null;
  }

  try {
    const preRange = doc.createRange();
    preRange.setStart(container, 0);
    preRange.setEnd(startContainer, startOffset);
    return preRange.toString().length;
  } catch {
    return null;
  }
}

function getRenderedTextRightEdge(container: HTMLElement): number | null {
  const doc = container.ownerDocument;
  try {
    let maxRight = -Infinity;
    const walker = doc.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            return (node.textContent ?? '').length > 0
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT;
          }
          const el = node as HTMLElement;
          if (el === container) return NodeFilter.FILTER_SKIP;
          // Inline reference chips should count as visible text width.
          if (el.matches('[data-inlineref-node], .inline-ref, .inline-reference')) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_SKIP;
        },
      },
    );

    let node: Node | null = walker.nextNode();
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const range = doc.createRange();
        range.selectNodeContents(node);
        const rects = Array.from(range.getClientRects());
        for (const rect of rects) {
          if (rect.width > 0 || rect.height > 0) {
            maxRight = Math.max(maxRight, rect.right);
          }
        }
      } else if (node instanceof HTMLElement) {
        const rect = node.getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0) {
          maxRight = Math.max(maxRight, rect.right);
        }
      }
      node = walker.nextNode();
    }

    return Number.isFinite(maxRight) ? maxRight : null;
  } catch {
    return null;
  }
}

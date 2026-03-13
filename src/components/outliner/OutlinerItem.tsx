import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { EditorView } from 'prosemirror-view';
import { useNode } from '../../hooks/use-node';
import { useChildren } from '../../hooks/use-children';
import { useNodeTags } from '../../hooks/use-node-tags';
import { useNodeFields, type FieldEntry } from '../../hooks/use-node-fields';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import * as loroDoc from '../../lib/loro-doc.js';
import { shouldRenderNodeDescription } from '../../lib/node-description-visibility.js';
import { BulletChevron, ChevronButton } from './BulletChevron';
import { RichTextEditor, type EditorContentPayload } from '../editor/RichTextEditor';
import { CodeBlockEditor } from '../editor/CodeBlockEditor';
import { TriggerDropdowns } from '../editor/TriggerDropdowns';
import { TrailingInput } from '../editor/TrailingInput';
import { TagBar } from '../tags/TagBar';
import { useEditorTriggers, buildTriggerEditorProps } from '../../hooks/use-editor-triggers.js';
import { FieldRow } from '../fields/FieldRow';
import { FIELD_OVERLAY_Z_INDEX } from '../fields/field-layout.js';
import { toFieldRowEntryProps } from '../fields/field-row-props.js';
import { NDX_T, SYS_V } from '../../types/index.js';
import { useFieldOptions } from '../../hooks/use-field-options.js';
import { resolveInlineReferenceTextColor, resolveTagColor } from '../../lib/tag-colors.js';
import {
  isCheckboxFieldType,
  isOptionsFieldType,
  isSingleValueFieldType,
  resolveNodeStructuralIcon,
} from '../../lib/field-utils.js';
import { isOutlinerContentNodeType } from '../../lib/node-type-utils.js';
import { ImageNodeRenderer } from './ImageNodeRenderer';
import { EmbedNodeRenderer } from './EmbedNodeRenderer';
import { marksToHtml } from '../../lib/editor-marks.js';
import { useNodeCheckbox } from '../../hooks/use-node-checkbox.js';
import {
  getFlattenedVisibleNodes,
  getPreviousVisibleNode,
  getNextVisibleNode,
  isOnlyInlineRef,
  getNodeTextLengthById,
} from '../../lib/tree-utils';
import { resolveSelectedReferenceShortcut } from '../../lib/selected-reference-shortcuts';
import { resolveRowPointerSelectAction } from '../../lib/row-pointer-selection';
import { getShortcutKeys, matchesShortcutEvent } from '../../lib/shortcut-registry.js';
import {
  isEditorViewAlive,
  setEditorSelection,
} from '../../lib/pm-editor-view.js';
import { dragState } from '../../hooks/use-drag-select';
import { mergeRichTextPayload } from '../../lib/rich-text-merge.js';
import { isReferenceDisplayCycle } from '../../lib/reference-rules.js';
import { focusUndoShortcutSink, ensureUndoFocusAfterNavigation } from '../../lib/focus-utils.js';
import { getTextOffsetFromPoint, getRenderedTextRightEdge } from '../../lib/dom-caret-utils.js';
import type { ParsedPasteNode } from '../../lib/paste-parser.js';
import { t } from '../../i18n/strings.js';
import { getNodeCapabilities } from '../../lib/node-capabilities.js';
import { triggerSparkExtraction } from '../../lib/ai-spark.js';
import { hasApiKey } from '../../lib/ai-service.js';
import { RowHost } from './RowHost.js';
import { ViewToolbar } from './ViewToolbar.js';
import { readViewConfig, applyViewPipeline } from '../../lib/view-pipeline.js';
import { OutlinerRow, useRowSelectionState, useRowPointerHandlers } from './OutlinerRow.js';
import { NodeContextMenuPortal } from './NodeContextMenu.js';
import { useDragDropRow } from '../../hooks/use-drag-drop-row.js';
import {
  buildFieldOwnerColors,
  buildVisibleChildrenRows,
  isHiddenFieldRow,
  shouldShowTrailingInput,
  type OutlinerRowItem,
} from './row-model.js';

const DESCRIPTION_SHORTCUT_KEYS = getShortcutKeys('editor.edit_description', ['Ctrl-i']);
const EMPTY_REFERENCE_PATH: readonly string[] = [];

/**
 * Convert a click position (clientX/Y) on a code block `<pre>` to a plain-text
 * character offset. Uses caretRangeFromPoint to find position within the
 * highlighted <code> DOM, then walks text nodes to compute the offset into the
 * raw source string.
 */
function getCodeBlockTextOffset(preEl: HTMLElement, rawText: string, clientX: number, clientY: number): number {
  // Try caretRangeFromPoint (Chrome)
  const range = document.caretRangeFromPoint(clientX, clientY);
  if (!range) return rawText.length;

  const codeEl = preEl.querySelector('code');
  const container = codeEl ?? preEl;
  if (!container.contains(range.startContainer)) return rawText.length;

  // Walk text nodes in DOM order to sum up offset
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let charCount = 0;
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    if (node === range.startContainer) {
      return charCount + range.startOffset;
    }
    charCount += node.textContent?.length ?? 0;
  }
  return rawText.length;
}

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

export type OutlinerVisibleChild = OutlinerRowItem;
export { buildFieldOwnerColors, buildVisibleChildrenRows, isHiddenFieldRow };

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
  const selectionSource = useUIStore((s) => s.selectionSource);
  const setSelectedNode = useUIStore((s) => s.setSelectedNode);
  const setSelectedNodes = useUIStore((s) => s.setSelectedNodes);
  const clearSelection = useUIStore((s) => s.clearSelection);
  // Unified selection state from OutlinerRow
  const { isSelected: isRowSelected, isMultiSelected, isSelectionAnchor } =
    useRowSelectionState(nodeId, parentId);
  const clearFocus = useUIStore((s) => s.clearFocus);
  const toggleExpanded = useUIStore((s) => s.toggleExpanded);
  const setExpanded = useUIStore((s) => s.setExpanded);
  const navigateTo = useUIStore((s) => s.navigateTo);
  const openSearch = useUIStore((s) => s.openSearch);
  const expandedNodes = useUIStore((s) => s.expandedNodes);
  // Unified pointer handlers from OutlinerRow
  const { handleCmdClick, handleShiftClick } = useRowPointerHandlers(nodeId, parentId, rootChildIds, rootNodeId);

  const isLoadingNode = useUIStore((s) => s.loadingNodeIds.has(nodeId));

  const createSibling = useNodeStore((s) => s.createSibling);
  const createSiblingNodesFromPaste = useNodeStore((s) => s.createSiblingNodesFromPaste);
  const createChild = useNodeStore((s) => s.createChild);
  const indentNode = useNodeStore((s) => s.indentNode);
  const outdentNode = useNodeStore((s) => s.outdentNode);
  const moveNodeUp = useNodeStore((s) => s.moveNodeUp);
  const moveNodeDown = useNodeStore((s) => s.moveNodeDown);
  const trashNode = useNodeStore((s) => s.trashNode);
  const toggleNodeDone = useNodeStore((s) => s.toggleNodeDone);
  const cycleNodeCheckbox = useNodeStore((s) => s.cycleNodeCheckbox);
  const _version = useNodeStore((s) => s._version);

  const canEditNode = useMemo(() => getNodeCapabilities(nodeId).canEditNode, [nodeId]);

  const rowRef = useRef<HTMLDivElement>(null);
  const contentAreaRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const codeBlockPendingOffset = useRef<number | null>(null);
  const blurClearRafRef = useRef<number | null>(null);
  const deleteBlockedPulseTimeoutRef = useRef<number | null>(null);
  const wasFocusedRef = useRef(false);
  const [deleteBlockedPulse, setDeleteBlockedPulse] = useState(false);

  const setNodeName = useNodeStore((s) => s.setNodeName);
  const updateNodeContent = useNodeStore((s) => s.updateNodeContent);
  const updateNodeDescription = useNodeStore((s) => s.updateNodeDescription);
  const removeReference = useNodeStore((s) => s.removeReference);
  const selectFieldOption = useNodeStore((s) => s.selectFieldOption);
  const registerCollectedOption = useNodeStore((s) => s.registerCollectedOption);
  const startRefConversion = useNodeStore((s) => s.startRefConversion);
  const revertRefConversion = useNodeStore((s) => s.revertRefConversion);
  const setPendingRefConversion = useUIStore((s) => s.setPendingRefConversion);
  const setEditingFieldName = useUIStore((s) => s.setEditingFieldName);

  // Lazy-load children when expanded
  useChildren(isExpanded && !isCyclicReferenceExpansion ? effectiveNodeId : null);

  const tagIds = useNodeTags(effectiveNodeId);
  const syncTemplateFields = useNodeStore((s) => s.syncTemplateFields);
  const isSparkNode = tagIds.includes(NDX_T.SPARK);

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

  // Build field lookup by fieldEntry ID
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

  // Read view config from viewDef child (sort, filter, group)
  const viewConfig = useMemo(() => {
    const store = useNodeStore.getState();
    return readViewConfig(effectiveNodeId, store.getViewDefId, store.getNode, store.getFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveNodeId, _version]);

  // Classify children → apply filter → group → sort pipeline
  const visibleChildren = useMemo(() => {
    const rows = buildVisibleChildrenRows({
      allChildIds,
      fieldMap,
      tagIds,
      getFieldDefOwnerId: (fieldDefId) => loroDoc.getParentId(fieldDefId),
      getNodeType: (id) => useNodeStore.getState().getNode(id)?.type,
      getChildNodeType: (id) => useNodeStore.getState().getNode(id)?.type,
      isOutlinerContentType: isOutlinerContentNodeType,
    });
    return applyViewPipeline(rows, viewConfig, useNodeStore.getState().getNode, _version);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allChildIds, fieldMap, tagIds, viewConfig, _version]);

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

  // Spark pending/loading (requires hasChildren)
  const isSparkPending = isSparkNode && !hasChildren && !isLoadingNode;
  const isSparkLoading = isSparkNode && isLoadingNode;

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
  const showTrailingInputRow = useMemo(
    () => shouldShowTrailingInput(visibleChildren.filter((c) => !c.hidden || revealedFieldIds.has(c.id))),
    [visibleChildren, revealedFieldIds],
  );
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
  // Structural icon: fieldDef/search/codeBlock show type-specific icon instead of a dot
  const structuralIcon = effectiveNode ? resolveNodeStructuralIcon(effectiveNode) : null;
  const isPendingConversion = useUIStore((s) => s.pendingRefConversion?.tempNodeId === nodeId);
  const pendingConversionRefTargetId = useUIStore((s) =>
    s.pendingRefConversion?.tempNodeId === nodeId ? s.pendingRefConversion.refNodeId : null,
  );
  // Selection derived from unified useRowSelectionState
  const isSelected = isRowSelected;
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
  const contentWrapperRef = useRef<HTMLDivElement>(null);
  const optionsDropdownRef = useRef<HTMLDivElement>(null);
  const [optionsDropdownPos, setOptionsDropdownPos] = useState<{ top: number; left: number } | null>(null);
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

  const isCodeBlock = effectiveNode?.type === 'codeBlock';
  const isImageNode = effectiveNode?.type === 'image';
  const isEmbedNode = effectiveNode?.type === 'embed';
  const isMediaNode = isImageNode || isEmbedNode;

  // ── Trigger system (shared hook) ──
  const triggers = useEditorTriggers({
    nodeId,
    parentId,
    editorRef,
    tagIds,
    isActive: isFocused,
    disabled: isCodeBlock || isMediaNode,
    trashNode: trashNode,
    onCycleCheckbox: handleCycleCheckbox,
    onOpenSearch: openSearch,
  });

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

  // ── Context menu ──
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Select the node (without entering edit mode) when right-clicking
    const ui = useUIStore.getState();
    if (!ui.selectedNodeIds.has(nodeId)) {
      ui.clearFocus();
      ui.setSelectedNodes(new Set([nodeId]), nodeId);
    }
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, [nodeId]);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

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
    if (!canEditNode) return;
    e.preventDefault(); // Prevent native focus churn
    captureNameEditorOffset();
    descClickCoordsRef.current = { x: e.clientX, y: e.clientY };
    setEditingDescription(true);
  }, [canEditNode, captureNameEditorOffset]);

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
    if (!canEditNode) return;
    setEditingDescription((prev) => {
      if (!prev) {
        captureNameEditorOffset();
        descClickCoordsRef.current = null; // No click coords → cursor at end
      }
      return !prev;
    });
  }, [canEditNode, captureNameEditorOffset]);

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
  // Check both row and portal dropdown refs.
  useEffect(() => {
    if (!optionsPickerOpen) return;
    const handler = (e: PointerEvent) => {
      const target = e.target as Node;
      if (rowRef.current?.contains(target)) return;
      if (optionsDropdownRef.current?.contains(target)) return;
      setOptionsPickerOpen(false);
    };
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, [optionsPickerOpen]);

  // Compute dropdown position for the portal when options picker opens
  useLayoutEffect(() => {
    if (!optionsPickerOpen || !contentWrapperRef.current) {
      setOptionsDropdownPos(null);
      return;
    }
    const updatePos = () => {
      const rect = contentWrapperRef.current?.getBoundingClientRect();
      if (rect) {
        setOptionsDropdownPos({ top: rect.bottom + 2, left: rect.left });
      }
    };
    updatePos();
    const scrollContainer = contentWrapperRef.current.closest('.overflow-y-auto, [style*="overflow"]');
    scrollContainer?.addEventListener('scroll', updatePos, { passive: true });
    window.addEventListener('resize', updatePos, { passive: true });
    return () => {
      scrollContainer?.removeEventListener('scroll', updatePos);
      window.removeEventListener('resize', updatePos);
    };
  }, [optionsPickerOpen]);

  // Reference-specific keyboard handler — passed to OutlinerRow as onSelectionKeydown.
  // Handles reference deletion, conversion, and options picker navigation.
  // Returns true if the event was consumed.
  const setPendingInputChar = useUIStore((s) => s.setPendingInputChar);
  const handleReferenceSelectionKeydown = useCallback((e: KeyboardEvent): boolean => {
    const uiState = useUIStore.getState();
    if (!(isReference || isOptionsValueNode) || uiState.selectedNodeIds.size > 1) {
      return false;
    }
    const refAction = resolveSelectedReferenceShortcut(e, optionsPickerOpen);
    if (!refAction) return false;

    if (refAction === 'delete') {
      if (!isReferenceNode) return true;
      e.preventDefault();
      removeReference(nodeId);
      clearSelection();
      return true;
    }
    if (refAction === 'convert_printable') {
      if (!isReferenceNode) return true;
      e.preventDefault();
      const getNode = useNodeStore.getState().getNode;
      const parent = getNode(parentId);
      const pos = parent?.children?.indexOf(nodeId) ?? -1;
      if (pos < 0) return true;
      const revertTargetId = getNode(nodeId)?.targetId;
      if (!revertTargetId) return true;
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
      return true;
    }
    if (refAction === 'convert_arrow_right') {
      if (!isReferenceNode) return true;
      e.preventDefault();
      const getNode = useNodeStore.getState().getNode;
      const parent = getNode(parentId);
      const pos = parent?.children?.indexOf(nodeId) ?? -1;
      if (pos < 0) return true;
      const revertTargetId = getNode(nodeId)?.targetId;
      if (!revertTargetId) return true;
      const tempNodeId = startRefConversion(nodeId, parentId, pos);
      setPendingRefConversion({ tempNodeId, refNodeId: revertTargetId, parentId });
      clearSelection();
      useUIStore.getState().setFocusClickCoords({
        nodeId: tempNodeId,
        parentId,
        textOffset: 1,
      });
      setTimeout(() => setFocusedNode(tempNodeId, parentId), 0);
      return true;
    }
    if (refAction === 'options_down' && allFieldOptions.length > 0) {
      e.preventDefault();
      setOptionsPickerIndex((i) => Math.min(i + 1, allFieldOptions.length - 1));
      return true;
    }
    if (refAction === 'options_up' && allFieldOptions.length > 0) {
      e.preventDefault();
      setOptionsPickerIndex((i) => Math.max(i - 1, 0));
      return true;
    }
    if (refAction === 'options_confirm' && allFieldOptions.length > 0) {
      e.preventDefault();
      const opt = allFieldOptions[optionsPickerIndex];
      if (opt) {
        selectFieldOption(parentId, opt.id, nodeId);
      }
      clearSelection();
      return true;
    }
    if (refAction === 'escape') {
      e.preventDefault();
      clearSelection();
      return true;
    }
    return true; // Reference handler consumed the event
  }, [isReference, isOptionsValueNode, isReferenceNode, optionsPickerOpen, allFieldOptions, optionsPickerIndex, parentId, nodeId, removeReference, selectFieldOption, clearSelection, setFocusedNode, startRefConversion, setPendingRefConversion, setPendingInputChar]);

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

  // Scroll newly focused node into view (e.g. after Enter creates a node off-screen).
  // We manually check visibility instead of using scrollIntoView, because
  // CSS scroll-padding (scroll-pb-[40vh]) causes scrollIntoView to treat
  // nodes in the bottom padding zone as "not visible" and scroll them up,
  // even when the user just clicked on a clearly visible node.
  useEffect(() => {
    if (isFocused && rowRef.current) {
      const row = rowRef.current;
      const scrollParent = row.closest('.overflow-y-auto') as HTMLElement | null;
      if (!scrollParent) return;
      const rowRect = row.getBoundingClientRect();
      const containerRect = scrollParent.getBoundingClientRect();
      if (rowRect.top < containerRect.top) {
        scrollParent.scrollTop += rowRect.top - containerRect.top;
      } else if (rowRect.bottom > containerRect.bottom) {
        scrollParent.scrollTop += rowRect.bottom - containerRect.bottom;
      }
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
    // Reset all trigger dropdowns
    triggers.resetAll();

    // Check pending ref conversion: if this is a temp node, decide revert or keep.
    finalizePendingRefConversion();

    // Options field: register value as auto-collected option on blur
    if (isOptionsField && attrDefId) {
      const nodeName = useNodeStore.getState().getNode(nodeId)?.name;
      if (nodeName?.trim()) {
        registerCollectedOption(attrDefId, nodeName.trim());
      }
    }

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
  }, [nodeId, parentId, setFocusedNode, finalizePendingRefConversion, isOptionsField, attrDefId, registerCollectedOption]);

  // mousedown: record text offset for cursor placement, but DON'T enter edit
  // mode. Edit mode is deferred to click so drag-select can take over if the
  // user drags (mounting RichTextEditor on mousedown captures subsequent mouse events).
  const handleContentMouseDown = useCallback((e: React.MouseEvent) => {
    if (isLoadingNode || isSparkPending) { e.preventDefault(); return; }
    if (isCheckboxFieldType(fieldDataType)) return;
    const target = e.target as HTMLElement;
    // Skip for hyperlinks — handleContentClick will open in new tab
    const anchorEl = target.closest('a[href]') as HTMLAnchorElement | null;
    if (anchorEl && !anchorEl.hasAttribute('data-inlineref-node')) return;
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
  }, [isLoadingNode, isReferenceLikeRow, fieldDataType, nodeId, parentId, handleCmdClick, handleShiftClick]);

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
    if (isLoadingNode) return;
    // Drag-select just ended → suppress this click
    if (dragState.justDragged) return;

    // Intercept clicks on hyperlinks in static display → open in new tab
    const target = e.target as HTMLElement;
    const anchorEl = target.closest('a[href]') as HTMLAnchorElement | null;
    if (anchorEl && !anchorEl.hasAttribute('data-inlineref-node')) {
      const href = anchorEl.getAttribute('href');
      if (href) {
        e.preventDefault();
        e.stopPropagation();
        chrome.tabs.create({ url: href });
        return;
      }
    }
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
  }, [isLoadingNode, nodeId, parentId, isReferenceLikeRow, isReference, setSelectedNode, setFocusedNode, navigateTo]);

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

      // Options field: register current node's name as auto-collected option
      if (isOptionsField && attrDefId) {
        const currentName = useNodeStore.getState().getNode(nodeId)?.name;
        if (currentName?.trim()) {
          registerCollectedOption(attrDefId, currentName.trim());
        }
      }

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
    [nodeId, parentId, fieldDataType, onNavigateOut, createSibling, createChild, setFocusedNode, isOptionsField, attrDefId, registerCollectedOption],
  );

  const handlePasteMultiLine = useCallback(
    (nodes: ParsedPasteNode[]) => {
      const lastId = createSiblingNodesFromPaste(nodeId, nodes);
      if (lastId) setFocusedNode(lastId, parentId);
    },
    [nodeId, parentId, createSiblingNodesFromPaste, setFocusedNode],
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
      if (showTrailingInputRow && focusTrailingInputForParent(nodeId)) {
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
  }, [nodeId, parentId, rootNodeId, rootChildIds, expandedNodes, isExpanded, showTrailingInputRow, firstRenderableChild, setFocusedNode, onNavigateOut, renderableSiblings, clearFocus, setEditingFieldName]);

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

  const { isDragging, isDropTarget, dropPosition, dragHandlers } = useDragDropRow({
    nodeId,
    parentId,
    rowRef,
    targetHasChildren: hasChildren,
    targetIsExpanded: isExpanded,
    onInsideDropExpand: (expandKey) => setExpanded(expandKey, true, true),
    onDragStart: (event, rowElement) => {
      const rect = rowElement.getBoundingClientRect();
      event.dataTransfer.setDragImage(rowElement, event.clientX - rect.left, event.clientY - rect.top);
    },
  });

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
  const hasOverlayOpen = triggers.hasOverlayOpen || optionsPickerOpen;

  return (
    <>
    <OutlinerRow
      config={{
        rowId: nodeId,
        parentId,
        rootChildIds,
        rootNodeId,
        isEditing: isFocused,
        enterEdit: () => { if (!isLoadingNode) setFocusedNode(nodeId, parentId); },
        exitEdit: () => clearFocus(),
        rowKind: 'content',
        onSelectionKeydown: handleReferenceSelectionKeydown,
      }}
    >
    <div role="treeitem" aria-expanded={isExpanded} className={`relative flex flex-col gap-1.5 ${hasOverlayOpen ? 'field-overlay-open z-[80]' : 'has-[.field-overlay-open]:z-[80]'}`}>
      <div
        ref={rowRef}
        tabIndex={-1}
        className={`group/row flex gap-1 min-h-6 items-start relative ${isDropTarget && dropPosition === 'inside'
          ? 'bg-primary/10 ring-1 ring-primary/30 rounded-sm'
          : ''
          } ${isDragging ? 'opacity-40' : ''} ${hasOverlayOpen ? 'z-[80]' : 'has-[.field-overlay-open]:z-[80]'}`}
        style={{ paddingLeft: depth * 28 + 6 }}
        data-node-id={nodeId}
        data-parent-id={parentId}
        onMouseDownCapture={isFocused ? handleFocusedRowMouseDownCapture : undefined}
        onDragOver={dragHandlers.onDragOver}
        onDragLeave={dragHandlers.onDragLeave}
        onDrop={dragHandlers.onDrop}
        onDragEnd={dragHandlers.onDragEnd}
        onContextMenu={handleContextMenu}
      >
        {/* Drop indicator: before — absolutely positioned to avoid layout shift */}
        {isDropTarget && dropPosition === 'before' && (
          <div
            className="absolute -top-[1px] right-0 h-0.5 bg-primary rounded-full pointer-events-none z-10"
            style={{ left: depth * 28 + 6 + 15 }}
          />
        )}
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
        <div ref={contentWrapperRef} className={`flex items-start gap-2 min-w-0 relative ${isSelectedRefClick ? 'node-selected-ref w-fit flex-none' : 'flex-1'}`}>
          {/* Bullet is the drag handle for reorder */}
          <div
            className={`${isLoadingNode || isSparkPending ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'} ${deleteBlockedPulse ? 'node-delete-blocked-pulse' : ''}`}
            draggable={!isLoadingNode && !isSparkPending}
            onDragStart={isLoadingNode || isSparkPending ? undefined : dragHandlers.onDragStart}
          >
            <BulletChevron
              hasChildren={hasChildren}
              isExpanded={isExpanded}
              onBulletClick={handleBulletClick}
              isReference={isReferenceLikeRow}
              tagDefColor={isTagDef ? resolveTagColor(nodeId).text : undefined}
              bulletColors={effectiveBulletColors}
              icon={structuralIcon}
              isLoading={isLoadingNode}
              isSparkNode={isSparkNode}
            />
          </div>
          {showCheckbox && (
            <span className="flex shrink-0 h-6 w-[15px] items-center justify-center">
              <input
                type="checkbox"
                checked={isDone}
                onChange={handleCheckboxToggle}
                className="h-3.5 w-3.5 appearance-none rounded border border-border bg-transparent checked:border-primary checked:bg-primary checked:bg-[url('data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M12.207%204.793a1%201%200%20010%201.414l-5%205a1%201%200%2001-1.414%200l-2-2a1%201%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%200%20011.414%200z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px_12px] bg-center bg-no-repeat cursor-pointer"
              />
            </span>
          )}
          <div
            className={`relative flex-1 min-w-0 ${isPendingConversion ? 'ref-converting' : ''} ${isDone ? 'text-foreground/40' : ''}`}
            style={pendingConversionStyle}
          >
            {isCodeBlock ? (
              <div
                ref={contentAreaRef}
                className="text-[15px] leading-6 cursor-text"
                onMouseDown={(e) => {
                  if (isFocused) return; // CodeBlockEditor manages its own clicks when focused
                  // Multi-select modifiers
                  const selectAction = resolveRowPointerSelectAction({
                    justDragged: dragState.justDragged,
                    metaKey: e.metaKey,
                    ctrlKey: e.ctrlKey,
                    shiftKey: e.shiftKey,
                    allowSingle: false,
                  });
                  if (selectAction === 'toggle') { e.preventDefault(); handleCmdClick(); return; }
                  if (selectAction === 'range') { e.preventDefault(); handleShiftClick(); return; }

                  // Compute text offset from click position on <pre>
                  const preEl = e.currentTarget.querySelector('pre');
                  if (preEl) {
                    const offset = getCodeBlockTextOffset(preEl, nodeText, e.clientX, e.clientY);
                    codeBlockPendingOffset.current = offset;
                  }
                  e.preventDefault();
                  useUIStore.getState().setFocusClickCoords({ nodeId, parentId, textOffset: 0 });
                }}
                onClick={!isFocused ? (e: React.MouseEvent) => {
                  if (dragState.justDragged) return;
                  setFocusedNode(nodeId, parentId);
                } : undefined}
              >
                <CodeBlockEditor
                  nodeId={nodeId}
                  parentId={parentId}
                  initialText={nodeText}
                  codeLanguage={effectiveNode?.codeLanguage}
                  isFocused={isFocused}
                  readOnly={!canEditNode}
                  pendingCursorOffset={codeBlockPendingOffset.current}
                  onBlur={handleBlur}
                  onEscapeSelect={handleEscapeSelect}
                  onArrowUp={handleArrowUp}
                  onArrowDown={handleArrowDown}
                  onBackspaceAtStart={handleBackspaceAtStart}
                  onDelete={handleDelete}
                  onIndent={handleIndent}
                  onOutdent={handleOutdent}
                  onMoveUp={handleMoveUp}
                  onMoveDown={handleMoveDown}
                />
              </div>
            ) : (
            <div
              ref={contentAreaRef}
              className={`text-[15px] leading-6 ${isLoadingNode ? 'cursor-default' : !isCheckboxFieldType(fieldDataType) && !isFocused ? (isReferenceLikeRow ? 'cursor-default' : 'cursor-text') : ''} ${hasTags && !nodeText ? 'has-placeholder' : ''} ${fieldDataType && !nodeText && !hasTags ? 'field-value-placeholder' : ''}`}
              onMouseDown={!isCheckboxFieldType(fieldDataType) ? (isFocused ? handleFocusedContentMouseDown : handleContentMouseDown) : undefined}
              onClick={!isCheckboxFieldType(fieldDataType) && !isFocused ? handleContentClick : undefined}
              onDoubleClick={!isCheckboxFieldType(fieldDataType) && !isFocused && isReference && !isOptionsValueNode ? handleContentDoubleClick : undefined}
            >
              {isImageNode && effectiveNode?.mediaUrl ? (
                <ImageNodeRenderer
                  mediaUrl={effectiveNode.mediaUrl}
                  mediaAlt={effectiveNode.mediaAlt}
                  imageWidth={effectiveNode.imageWidth}
                  imageHeight={effectiveNode.imageHeight}
                />
              ) : isEmbedNode ? (
                <EmbedNodeRenderer
                  embedType={effectiveNode?.embedType}
                  mediaUrl={effectiveNode?.mediaUrl}
                  mediaAlt={effectiveNode?.mediaAlt}
                />
              ) : isCheckboxFieldType(fieldDataType) ? (
                <input
                  type="checkbox"
                  checked={node.name === SYS_V.YES}
                  onChange={(e) => {
                    setNodeName(nodeId, e.target.checked ? SYS_V.YES : SYS_V.NO);
                  }}
                  className="mt-[3px] h-3.5 w-3.5 appearance-none rounded border border-border bg-transparent checked:border-primary checked:bg-primary checked:bg-[url('data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M12.207%204.793a1%201%200%20010%201.414l-5%205a1%201%200%2001-1.414%200l-2-2a1%201%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%200%20011.414%200z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px_12px] bg-center bg-no-repeat cursor-pointer"
                />
              ) : isFocused ? (
                <RichTextEditor
                  nodeId={nodeId}
                  parentId={parentId}
                  contentNodeId={referenceTargetId ?? undefined}
                  initialText={nodeText}
                  initialMarks={nodeMarks}
                  initialInlineRefs={nodeInlineRefs}
                  readOnly={!canEditNode}
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
                  {...buildTriggerEditorProps(triggers)}
                  editorRef={editorRef}
                  onDescriptionEdit={handleDescriptionEdit}
                  onToggleDone={handleCycleCheckbox}
                  onEscapeSelect={handleEscapeSelect}
                  onShiftArrow={handleShiftArrow}
                  onSelectAll={handleSelectAll}
                  onPasteMultiLine={handlePasteMultiLine}
                  showIdleHint={!fieldDataType}
                />
              ) : nodeContentHtml ? (
                <span
                  className="node-content"
                  dangerouslySetInnerHTML={{ __html: nodeContentHtml }}
                />
              ) : isSparkPending ? (
                <span
                  className="node-content text-primary/70 hover:text-primary cursor-pointer transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    void (async () => {
                      const hasKey = await hasApiKey();
                      if (!hasKey) {
                        // TODO: toast / navigate to Settings
                        console.warn('[spark] No API key configured');
                        return;
                      }
                      void triggerSparkExtraction(nodeId, parentId);
                    })();
                  }}
                >
                  ✦ Generate Spark
                </span>
              ) : isSparkLoading ? (
                <span className="node-content text-foreground-tertiary">Generating…</span>
              ) : isLoadingNode ? (
                <span className="node-content text-foreground-tertiary animate-pulse">Clipping…</span>
              ) : hasTags ? (
                <span className="node-content text-foreground-tertiary">Untitled</span>
              ) : fieldDataType ? (
                <span className="node-content text-foreground/20">{t('field.emptyText')}</span>
              ) : (
                <span className="node-content">&#8203;</span>
              )}
              {hasTags && (
                <span className="inline-flex align-baseline ml-1.5" onClick={(e) => e.stopPropagation()}>
                  <TagBar nodeId={effectiveNodeId} />
                </span>
              )}
            </div>
            )}
            {/* Description: gray text below name */}
            {shouldRenderNodeDescription({ description, editing: editingDescription, tags: tagIds }) && (
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
            <TriggerDropdowns
              triggers={triggers}
              nodeId={nodeId}
              tagIds={tagIds}
              visible={isFocused}
            />
          </div>
          {/* Options picker dropdown: rendered via portal to escape @container stacking contexts */}
          {optionsPickerOpen && allFieldOptions.length > 0 && optionsDropdownPos && createPortal(
            <div
              ref={optionsDropdownRef}
              className="max-h-48 w-56 overflow-y-auto rounded-lg bg-background shadow-paper p-1"
              style={{ position: 'fixed', top: optionsDropdownPos.top, left: optionsDropdownPos.left, zIndex: FIELD_OVERLAY_Z_INDEX }}
              onMouseDown={(e) => e.preventDefault()}
            >
              {allFieldOptions.map((opt, i) => (
                <div
                  key={opt.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm ${opt.id === selectedOptionId
                    ? 'bg-primary text-primary-foreground'
                    : i === optionsPickerIndex
                      ? 'bg-primary-muted text-foreground'
                      : 'text-foreground hover:bg-foreground/4'
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
            </div>,
            document.body,
          )}
        </div>{/* close selection/contents wrapper */}
        {/* Drop indicator: after — absolutely positioned to avoid layout shift */}
        {isDropTarget && dropPosition === 'after' && (
          <div
            className="absolute -bottom-[1px] right-0 h-0.5 bg-primary rounded-full pointer-events-none z-10"
            style={{ left: depth * 28 + 6 + 15 + 4 }}
          />
        )}
      </div>
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
            className={`indent-line-inner absolute top-0 bottom-0 transition-all duration-150 ${
              isReference
                ? 'w-0 border-l border-dashed border-border-subtle group-hover/outliner-item:border-border hover:!border-border-emphasis'
                : 'w-[1px] rounded-full bg-border-subtle group-hover/outliner-item:bg-border hover:!bg-border-emphasis'
            }`}
            style={{ left: 15.5, transform: 'translateX(-50%)' }}
          />
        </button>
      )}
      {isExpanded && !isCyclicReferenceExpansion && (
        <div className="relative flex flex-col gap-1.5" data-row-scope-parent-id={nodeId} ref={childrenScopeRef}>
          {/* Selection subtree mask: children area, connects to parent row above (global selection only). */}
          {isSelectedGlobal && (
            <div
              className="absolute right-0 bg-selection rounded-b-sm rounded-t-none pointer-events-none z-0"
              style={{ left: depth * 28 + 6 + 15, top: -1, bottom: 1 }}
            />
          )}
          <ViewToolbar nodeId={effectiveNodeId} depth={depth + 1} />
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
          <RowHost
            rows={visibleChildren}
            isRowVisible={(row) => !row.hidden || revealedFieldIds.has(row.id)}
            renderField={(row, i, rows) => (
              <div className="@container" style={{ paddingLeft: (depth + 1) * 28 + 6 + 15 + 4 }}>
                <FieldRow
                  nodeId={effectiveNodeId}
                  {...toFieldRowEntryProps(fieldMap.get(row.id)!)}
                  rootChildIds={rootChildIds}
                  rootNodeId={rootNodeId}
                  isLastInGroup={i === rows.length - 1 || rows[i + 1].type !== 'field'}
                  ownerTagColor={fieldOwnerColors.get(row.id)}
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
                      for (let j = i + 1; j < rows.length; j++) {
                        const nextItem = rows[j];
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
            )}
            renderContent={(row) => (
              <OutlinerItem
                nodeId={row.id}
                depth={depth + 1}
                rootChildIds={rootChildIds}
                parentId={effectiveNodeId}
                rootNodeId={rootNodeId}
                referencePath={nextReferencePath}
                bulletColors={templateContentColors.get(row.id)}
              />
            )}
            renderGroupHeader={(row) => (
              <div
                className="flex items-center h-7 text-sm font-semibold text-foreground mt-2 first:mt-0"
                style={{ paddingLeft: (depth + 1) * 28 + 6 + 15 + 4 }}
              >
                {row.label}
              </div>
            )}
          />
          {showTrailingInputRow && (
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
    </OutlinerRow>
    {contextMenu && (
      <NodeContextMenuPortal
        menu={{ x: contextMenu.x, y: contextMenu.y, nodeId, viewNodeId: parentId }}
        onClose={closeContextMenu}
      />
    )}
    </>
  );
}

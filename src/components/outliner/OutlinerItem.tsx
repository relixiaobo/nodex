import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import type { Editor } from '@tiptap/react';
import { useNode } from '../../hooks/use-node';
import { useChildren } from '../../hooks/use-children';
import { useNodeTags } from '../../hooks/use-node-tags';
import { useNodeFields, type FieldEntry } from '../../hooks/use-node-fields';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { BulletChevron, ChevronButton } from './BulletChevron';
import { NodeEditor } from '../editor/NodeEditor';
import { TrailingInput } from '../editor/TrailingInput';
import { TagBar } from '../tags/TagBar';
import { TagSelector, type TagDropdownHandle } from '../tags/TagSelector';
import { ReferenceSelector, type ReferenceDropdownHandle } from '../references/ReferenceSelector';
import { FieldRow } from '../fields/FieldRow';
import { SYS_D, SYS_V } from '../../types/index.js';
import { useFieldOptions } from '../../hooks/use-field-options.js';
import {
  getFlattenedVisibleNodes,
  getPreviousVisibleNode,
  getNextVisibleNode,
  isOnlyInlineRef,
} from '../../lib/tree-utils';

/** Field types that accept only a single value node. Enter navigates out instead of creating siblings. */
const SINGLE_VALUE_FIELD_TYPES: Set<string> = new Set([
  SYS_D.NUMBER, SYS_D.INTEGER, SYS_D.URL, SYS_D.EMAIL,
]);

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
   *  Allows field-value OutlinerItems to escape to the parent outliner context. */
  onNavigateOut?: (direction: 'up' | 'down') => void;
}

export function OutlinerItem({ nodeId, depth, rootChildIds, parentId, rootNodeId, fieldDataType, attrDefId, onNavigateOut }: OutlinerItemProps) {
  const node = useNode(nodeId);
  const expandKey = `${parentId}:${nodeId}`;
  const isExpanded = useUIStore((s) => s.expandedNodes.has(`${parentId}:${nodeId}`));
  const focusedNodeId = useUIStore((s) => s.focusedNodeId);
  const focusedParentId = useUIStore((s) => s.focusedParentId);
  const setFocusedNode = useUIStore((s) => s.setFocusedNode);
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const selectedParentId = useUIStore((s) => s.selectedParentId);
  const setSelectedNode = useUIStore((s) => s.setSelectedNode);
  const toggleExpanded = useUIStore((s) => s.toggleExpanded);
  const setExpanded = useUIStore((s) => s.setExpanded);
  const navigateTo = useUIStore((s) => s.navigateTo);
  const expandedNodes = useUIStore((s) => s.expandedNodes);

  const dragNodeId = useUIStore((s) => s.dragNodeId);
  const dropTargetId = useUIStore((s) => s.dropTargetId);
  const dropPosition = useUIStore((s) => s.dropPosition);
  const setDrag = useUIStore((s) => s.setDrag);
  const setDropTarget = useUIStore((s) => s.setDropTarget);

  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const userId = useWorkspaceStore((s) => s.userId);

  const createSibling = useNodeStore((s) => s.createSibling);
  const createChild = useNodeStore((s) => s.createChild);
  const indentNode = useNodeStore((s) => s.indentNode);
  const outdentNode = useNodeStore((s) => s.outdentNode);
  const moveNodeUp = useNodeStore((s) => s.moveNodeUp);
  const moveNodeDown = useNodeStore((s) => s.moveNodeDown);
  const moveNodeTo = useNodeStore((s) => s.moveNodeTo);
  const trashNode = useNodeStore((s) => s.trashNode);
  const entities = useNodeStore((s) => s.entities);

  const rowRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const blurClearRafRef = useRef<number | null>(null);

  // # trigger state
  const [hashTagOpen, setHashTagOpen] = useState(false);
  const [hashTagQuery, setHashTagQuery] = useState('');
  const [hashTagSelectedIndex, setHashTagSelectedIndex] = useState(0);
  const hashRangeRef = useRef<{ from: number; to: number }>({ from: 0, to: 0 });
  const tagDropdownRef = useRef<TagDropdownHandle>(null);
  const applyTag = useNodeStore((s) => s.applyTag);
  const createTagDef = useNodeStore((s) => s.createTagDef);
  const updateNodeName = useNodeStore((s) => s.updateNodeName);
  const addReference = useNodeStore((s) => s.addReference);
  const removeReference = useNodeStore((s) => s.removeReference);
  const startRefConversion = useNodeStore((s) => s.startRefConversion);
  const revertRefConversion = useNodeStore((s) => s.revertRefConversion);
  const setPendingRefConversion = useUIStore((s) => s.setPendingRefConversion);

  // @ trigger state (reference)
  const [refOpen, setRefOpen] = useState(false);
  const [refQuery, setRefQuery] = useState('');
  const [refSelectedIndex, setRefSelectedIndex] = useState(0);
  const refRangeRef = useRef<{ from: number; to: number }>({ from: 0, to: 0 });
  const refDropdownRef = useRef<ReferenceDropdownHandle>(null);

  // > trigger (fire-once: instantly creates field)
  const addUnnamedFieldToNode = useNodeStore((s) => s.addUnnamedFieldToNode);
  const setEditingFieldName = useUIStore((s) => s.setEditingFieldName);

  // Lazy-load children when expanded
  useChildren(isExpanded ? nodeId : null);

  const tagIds = useNodeTags(nodeId);
  const fields = useNodeFields(nodeId);

  const allChildIds = node?.children ?? [];

  // Build field lookup by tuple ID
  const fieldMap = useMemo(() => {
    const m = new Map<string, FieldEntry>();
    for (const f of fields) m.set(f.tupleId, f);
    return m;
  }, [fields]);

  // Classify each child: field tuple → 'field', regular node → 'content', else skip
  // Also evaluate hide-field rules for field entries
  const visibleChildren = useMemo(() => {
    const result: { id: string; type: 'field' | 'content'; hidden?: boolean }[] = [];
    for (const cid of allChildIds) {
      if (fieldMap.has(cid)) {
        const f = fieldMap.get(cid)!;
        // Evaluate hide-field condition
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
          // WHEN_VALUE_IS_DEFAULT: needs "default" concept — skip for now
          // NEVER: default, not hidden
        }
        result.push({ id: cid, type: 'field', hidden });
      } else {
        const dt = entities[cid]?.props._docType;
        if (!dt) result.push({ id: cid, type: 'content' });
        // else skip: metanode, associatedData, SYS tuple, tag tuple
      }
    }
    return result;
  }, [allChildIds, fieldMap, entities]);

  const childIds = useMemo(
    () => visibleChildren.filter((c) => c.type === 'content').map((c) => c.id),
    [visibleChildren],
  );
  // For hasChildren: count non-hidden items (hidden-always fields don't count toward expand chevron)
  const hasChildren = visibleChildren.some((c) => !c.hidden);
  // Track whether any fields are conditionally hidden (for hover-to-reveal)
  const hasHiddenFields = useMemo(
    () => visibleChildren.some((c) => c.hidden && fieldMap.get(c.id)?.hideMode !== SYS_V.ALWAYS),
    [visibleChildren, fieldMap],
  );
  const [childrenHovered, setChildrenHovered] = useState(false);
  const isFocused = focusedNodeId === nodeId &&
    (focusedParentId === null || focusedParentId === parentId);
  const hasTags = tagIds.length > 0;
  const hasFields = fields.length > 0;
  const isReference = !!node && node.props._ownerId !== parentId;
  const isPendingConversion = useUIStore((s) => s.pendingRefConversion?.tempNodeId === nodeId);
  const isSelected = selectedNodeId === nodeId &&
    (selectedParentId === null || selectedParentId === parentId);

  // Options field dropdown (for changing selected option value)
  const isOptionsField = fieldDataType === SYS_D.OPTIONS || fieldDataType === SYS_D.OPTIONS_FROM_SUPERTAG;
  const [optionsPickerOpen, setOptionsPickerOpen] = useState(false);
  const [optionsPickerIndex, setOptionsPickerIndex] = useState(0);
  const allFieldOptions = useFieldOptions(isOptionsField && attrDefId ? attrDefId : '');

  // Open options picker when Options-field reference is selected
  useEffect(() => {
    if (isSelected && isReference && isOptionsField) {
      setOptionsPickerOpen(true);
      // Highlight the currently selected option
      const idx = allFieldOptions.findIndex((o) => o.id === nodeId);
      setOptionsPickerIndex(idx >= 0 ? idx : 0);
    } else {
      setOptionsPickerOpen(false);
    }
  }, [isSelected, isReference, isOptionsField, allFieldOptions, nodeId]);

  // Keyboard handler for selected reference nodes
  useEffect(() => {
    if (!isSelected || !isReference) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        if (userId) removeReference(parentId, nodeId, userId);
        setSelectedNode(null);
        return;
      }
      if (e.key === 'ArrowRight' && !optionsPickerOpen) {
        e.preventDefault();
        if (!wsId || !userId) return;
        const parent = entities[parentId];
        const pos = parent?.children?.indexOf(nodeId) ?? -1;
        if (pos < 0) return;
        removeReference(parentId, nodeId, userId);
        const tempNodeId = startRefConversion(nodeId, parentId, pos, wsId, userId);
        setPendingRefConversion({ tempNodeId, refNodeId: nodeId, parentId });
        setSelectedNode(null);
        setTimeout(() => setFocusedNode(tempNodeId, parentId), 0);
        return;
      }
      // Printable character on selected reference → enter conversion mode with char appended
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !optionsPickerOpen) {
        e.preventDefault();
        if (!wsId || !userId) return;
        const parent = entities[parentId];
        const pos = parent?.children?.indexOf(nodeId) ?? -1;
        if (pos < 0) return;
        removeReference(parentId, nodeId, userId);
        const tempNodeId = startRefConversion(nodeId, parentId, pos, wsId, userId);
        // Append typed character after inline ref
        const tempName = useNodeStore.getState().entities[tempNodeId]?.props.name ?? '';
        useNodeStore.getState().setNodeNameLocal(tempNodeId, tempName + e.key);
        setPendingRefConversion({ tempNodeId, refNodeId: nodeId, parentId });
        setSelectedNode(null);
        setTimeout(() => setFocusedNode(tempNodeId, parentId), 0);
        return;
      }
      if (optionsPickerOpen && allFieldOptions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setOptionsPickerIndex((i) => Math.min(i + 1, allFieldOptions.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setOptionsPickerIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const opt = allFieldOptions[optionsPickerIndex];
          if (opt && userId) {
            removeReference(parentId, nodeId, userId);
            addReference(parentId, opt.id, userId);
          }
          setSelectedNode(null);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setSelectedNode(null);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedNode(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isSelected, isReference, optionsPickerOpen, allFieldOptions, optionsPickerIndex, parentId, nodeId, userId, wsId, entities, removeReference, addReference, setSelectedNode, startRefConversion, setPendingRefConversion, setFocusedNode]);

  // When TrailingInput creates a node with # or @, it sets triggerHint so we
  // can immediately open the dropdown (extensions don't fire on mount because
  // there's no doc change). Read and clear the hint on focus.
  useEffect(() => {
    if (!isFocused) return;
    const hint = useUIStore.getState().triggerHint;
    if (!hint) return;
    useUIStore.getState().setTriggerHint(null);

    if (hint === '#') {
      // The editor content is '#' — set range to cover it
      setHashTagQuery('');
      setHashTagSelectedIndex(0);
      hashRangeRef.current = { from: 1, to: 2 }; // position of '#' in ProseMirror doc
      setHashTagOpen(true);
    } else if (hint === '@') {
      setRefQuery('');
      setRefSelectedIndex(0);
      refRangeRef.current = { from: 1, to: 2 };
      setRefOpen(true);
    }
  }, [isFocused]);

  // ─── Basic handlers ───

  useEffect(() => {
    return () => {
      if (blurClearRafRef.current !== null) {
        cancelAnimationFrame(blurClearRafRef.current);
      }
    };
  }, []);

  const handleBlur = useCallback(() => {
    // Reset any open dropdown state so it doesn't persist across focus cycles.
    // Without this, clicking away while dropdown is open → re-focusing the same
    // node would show the dropdown again (hashTagOpen/refOpen were never reset).
    setHashTagOpen(false);
    setHashTagQuery('');
    setHashTagSelectedIndex(0);
    setRefOpen(false);
    setRefQuery('');
    setRefSelectedIndex(0);

    // Check pending ref conversion: if this is a temp node, decide revert or keep
    const pending = useUIStore.getState().pendingRefConversion;
    if (pending && pending.tempNodeId === nodeId) {
      const tempNode = useNodeStore.getState().entities[nodeId];
      const content = tempNode?.props.name ?? '';
      if (isOnlyInlineRef(content)) {
        revertRefConversion(pending.tempNodeId, pending.refNodeId, pending.parentId);
      }
      useUIStore.getState().setPendingRefConversion(null);
    }

    if (blurClearRafRef.current !== null) {
      cancelAnimationFrame(blurClearRafRef.current);
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
  }, [nodeId, parentId, setFocusedNode, revertRefConversion]);

  // Enter edit mode on mousedown to avoid relying on click after blur.
  // Event order when switching nodes is mousedown → blur/focusout → click; if
  // we wait for click, the first click can be consumed by focus transitions.
  // Capturing textOffset here keeps one-click cursor placement stable.
  const handleContentMouseDown = useCallback((e: React.MouseEvent) => {
    if (fieldDataType === SYS_D.CHECKBOX) return;
    const target = e.target as HTMLElement;
    const refEl = target.closest('[data-inlineref-node]') as HTMLElement | null;
    if (refEl || isReference) return;

    const container = e.currentTarget as HTMLElement;
    const textOffset = getTextOffsetFromPoint(container, e.clientX, e.clientY);
    useUIStore.getState().setFocusClickCoords(
      textOffset !== null
        ? { nodeId, parentId, textOffset }
        : null,
    );
    // Prevent native selection/focus churn on the static HTML layer.
    e.preventDefault();
    setFocusedNode(nodeId, parentId);
  }, [isReference, fieldDataType, nodeId, parentId, setFocusedNode]);

  const handleContentClick = useCallback((e: React.MouseEvent) => {
    // Intercept clicks on inline references (blue links in static display)
    const target = e.target as HTMLElement;
    const refEl = target.closest('[data-inlineref-node]') as HTMLElement;
    if (refEl) {
      e.stopPropagation();
      useUIStore.getState().setFocusClickCoords(null);
      const refId = refEl.getAttribute('data-inlineref-node');
      if (refId) {
        navigateTo(refId);
        return;
      }
    }
    // Reference nodes: single click = select (frame), double click = edit
    if (isReference) {
      setSelectedNode(nodeId, parentId);
    }
  }, [nodeId, parentId, isReference, setSelectedNode, navigateTo]);

  const handleContentDoubleClick = useCallback(() => {
    // Double click on reference node → enter edit mode
    if (isReference) {
      setFocusedNode(nodeId, parentId);
    }
  }, [nodeId, parentId, isReference, setFocusedNode]);

  const handleToggle = useCallback(() => {
    const ek = `${parentId}:${nodeId}`;
    const currentNode = useNodeStore.getState().entities[nodeId];
    const currentHasChildren = (currentNode?.children ?? []).length > 0;
    const currentlyExpanded = useUIStore.getState().expandedNodes.has(ek);

    if (!currentHasChildren && !currentlyExpanded) {
      // Leaf node: expand to show trailing input (auto-focuses)
      setExpanded(ek, true);
    } else {
      toggleExpanded(ek);
    }
  }, [nodeId, parentId, toggleExpanded, setExpanded]);

  const handleDrillDown = useCallback(() => {
    navigateTo(nodeId);
  }, [nodeId, navigateTo]);

  const handleBulletClick = useCallback(() => {
    navigateTo(nodeId);
  }, [nodeId, navigateTo]);

  const handleIndentLineClick = useCallback(() => {
    // Toggle expand/collapse all direct children (Tana indent guide line behavior)
    const currentChildIds = useNodeStore.getState().entities[nodeId]?.children ?? [];
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
    useUIStore.setState({ expandedNodes: next });
  }, [nodeId]);

  // ─── Keyboard shortcut handlers ───

  const handleEnter = useCallback(
    (afterContent?: string) => {
      if (!wsId || !userId) return;

      // Single-value field types: Enter navigates out instead of creating sibling
      if (fieldDataType && SINGLE_VALUE_FIELD_TYPES.has(fieldDataType)) {
        if (onNavigateOut) onNavigateOut('down');
        return;
      }

      const currentlyExpanded = useUIStore.getState().expandedNodes.has(`${parentId}:${nodeId}`);
      const currentHasChildren =
        (useNodeStore.getState().entities[nodeId]?.children ?? []).length > 0;

      if (currentlyExpanded && currentHasChildren) {
        // Expanded with children → new node becomes first child (position 0)
        createChild(nodeId, wsId, userId, afterContent ?? '', 0).then((newNode) => {
          setFocusedNode(newNode.id, nodeId);
        });
      } else {
        // Collapsed or leaf → create sibling after this node
        createSibling(nodeId, wsId, userId, afterContent).then((newNode) => {
          setFocusedNode(newNode.id, parentId);
        });
      }
    },
    [nodeId, parentId, wsId, userId, fieldDataType, onNavigateOut, createSibling, createChild, setFocusedNode],
  );

  const handleIndent = useCallback(() => {
    if (!userId) return;
    // References cannot be indented (would cause ownership conflicts)
    const currentNode = useNodeStore.getState().entities[nodeId];
    if (currentNode && currentNode.props._ownerId !== parentId) return;

    // Pre-compute new parent (previous sibling) and expand it BEFORE moving.
    // This prevents the node from being unmounted between state updates,
    // which would cause blur → focus loss.
    const ownerId = currentNode?.props._ownerId;
    if (!ownerId) return;

    const parent = useNodeStore.getState().entities[ownerId];
    if (!parent?.children) return;

    const index = parent.children.indexOf(nodeId);
    if (index <= 0) return; // Can't indent first child

    const newParentId = parent.children[index - 1];
    setExpanded(`${ownerId}:${newParentId}`, true);
    indentNode(nodeId, userId);
    // Update focusedParentId so the node keeps focus under its new parent
    setFocusedNode(nodeId, newParentId);
  }, [nodeId, userId, parentId, indentNode, setExpanded, setFocusedNode]);

  const handleOutdent = useCallback(() => {
    if (!userId) return;
    // References cannot be outdented (would cause ownership conflicts)
    const currentNode = useNodeStore.getState().entities[nodeId];
    if (currentNode && currentNode.props._ownerId !== parentId) return;
    // Compute grandparent before moving so we can update focusedParentId
    const grandparentId = useNodeStore.getState().entities[parentId]?.props._ownerId;
    outdentNode(nodeId, userId);
    if (grandparentId) {
      setFocusedNode(nodeId, grandparentId);
    }
  }, [nodeId, userId, parentId, outdentNode, setFocusedNode]);

  const handleDelete = useCallback((): boolean => {
    if (!wsId || !userId) return false;
    // Read current name from store — the closure's `node` may be stale
    // because saveContent() updates the store synchronously before this runs.
    // Strip HTML tags before checking: TipTap may save empty paragraphs as
    // '<br>' or '<br class="ProseMirror-trailingBreak">' which are non-empty
    // strings but represent visually empty content.
    const currentName = useNodeStore.getState().entities[nodeId]?.props.name ?? '';
    const textOnly = currentName.replace(/<[^>]*>/g, '').trim();
    if (textOnly.length > 0) return false;

    const flatList = getFlattenedVisibleNodes(rootChildIds, entities, expandedNodes, rootNodeId);
    const prev = getPreviousVisibleNode(nodeId, parentId, flatList);

    // Reference: just remove from parent's children, don't trash the node.
    // Guard: also verify the node is actually in parentId's children. After indent,
    // the closure's parentId may be stale (old parent) while _ownerId is already
    // the new parent — this is NOT a reference, just a stale closure.
    const currentNode = useNodeStore.getState().entities[nodeId];
    const parentChildren = useNodeStore.getState().entities[parentId]?.children ?? [];
    const isReference = currentNode
      && currentNode.props._ownerId !== parentId
      && parentChildren.includes(nodeId);
    if (isReference) {
      removeReference(parentId, nodeId, userId);
    } else {
      trashNode(nodeId, wsId, userId);
    }
    if (prev) {
      setFocusedNode(prev.nodeId, prev.parentId);
    } else {
      setFocusedNode(null);
    }
    return true;
  }, [nodeId, wsId, userId, parentId, rootNodeId, rootChildIds, entities, expandedNodes, trashNode, removeReference, setFocusedNode]);

  const handleArrowUp = useCallback(() => {
    const flatList = getFlattenedVisibleNodes(rootChildIds, entities, expandedNodes, rootNodeId);
    const prev = getPreviousVisibleNode(nodeId, parentId, flatList);
    if (prev) {
      setFocusedNode(prev.nodeId, prev.parentId);
    } else if (onNavigateOut) {
      onNavigateOut('up');
    }
  }, [nodeId, parentId, rootNodeId, rootChildIds, entities, expandedNodes, setFocusedNode, onNavigateOut]);

  const handleArrowDown = useCallback(() => {
    const flatList = getFlattenedVisibleNodes(rootChildIds, entities, expandedNodes, rootNodeId);
    const next = getNextVisibleNode(nodeId, parentId, flatList);
    if (next) {
      setFocusedNode(next.nodeId, next.parentId);
    } else if (onNavigateOut) {
      onNavigateOut('down');
    }
  }, [nodeId, parentId, rootNodeId, rootChildIds, entities, expandedNodes, setFocusedNode, onNavigateOut]);

  const handleMoveUp = useCallback(() => {
    if (!userId) return;
    moveNodeUp(nodeId, userId);
  }, [nodeId, userId, moveNodeUp]);

  const handleMoveDown = useCallback(() => {
    if (!userId) return;
    moveNodeDown(nodeId, userId);
  }, [nodeId, userId, moveNodeDown]);

  // ─── # trigger handlers ───

  const handleHashTag = useCallback((query: string, from: number, to: number) => {
    hashRangeRef.current = { from, to };
    setHashTagQuery(query);
    setHashTagSelectedIndex(0);
    if (!hashTagOpen) setHashTagOpen(true);
  }, [hashTagOpen, nodeId]);

  const handleHashTagDeactivate = useCallback(() => {
    setHashTagOpen(false);
    setHashTagQuery('');
    setHashTagSelectedIndex(0);
  }, [nodeId]);

  /** Delete #query text from editor, save corrected content, refocus */
  const cleanupHashTagText = useCallback(() => {
    const ed = editorRef.current;
    if (ed && !ed.isDestroyed) {
      const { from, to } = hashRangeRef.current;
      ed.chain().deleteRange({ from, to }).run();
      // Save corrected content (without #query)
      const html = ed.getHTML();
      const trimmed = html.trim();
      const match = trimmed.match(/^<p>(.*)<\/p>$/s);
      const cleanedName = (match && !match[1].includes('<p>')) ? match[1] : trimmed;
      if (userId) updateNodeName(nodeId, cleanedName, userId);
    }
  }, [nodeId, userId, updateNodeName]);

  const handleHashTagSelect = useCallback(
    (tagDefId: string) => {
      if (!wsId || !userId) return;
      cleanupHashTagText();
      applyTag(nodeId, tagDefId, wsId, userId);
      setHashTagOpen(false);
      setHashTagQuery('');
      setHashTagSelectedIndex(0);
    },
    [nodeId, wsId, userId, applyTag, cleanupHashTagText],
  );

  const handleHashTagCreateNew = useCallback(
    async (name: string) => {
      if (!wsId || !userId) return;
      cleanupHashTagText();
      const tagDef = await createTagDef(name, wsId, userId);
      applyTag(nodeId, tagDef.id, wsId, userId);
      setHashTagOpen(false);
      setHashTagQuery('');
      setHashTagSelectedIndex(0);
    },
    [nodeId, wsId, userId, createTagDef, applyTag, cleanupHashTagText],
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
  }, []);

  // ─── > field trigger (fire-once: instantly creates unnamed field) ───

  const handleFieldTriggerFire = useCallback(async () => {
    const parentId = node?.props._ownerId;
    if (!parentId || !wsId || !userId) return;
    const { tupleId } = await addUnnamedFieldToNode(parentId, wsId, userId, nodeId);
    trashNode(nodeId, wsId, userId);
    setEditingFieldName(tupleId);
  }, [nodeId, node?.props._ownerId, wsId, userId, addUnnamedFieldToNode, trashNode, setEditingFieldName]);

  // ─── @ reference trigger handlers ───

  const handleReference = useCallback((query: string, from: number, to: number) => {
    refRangeRef.current = { from, to };
    setRefQuery(query);
    setRefSelectedIndex(0);
    if (!refOpen) setRefOpen(true);
  }, [refOpen]);

  const handleReferenceDeactivate = useCallback(() => {
    setRefOpen(false);
    setRefQuery('');
    setRefSelectedIndex(0);
  }, []);

  const handleReferenceSelect = useCallback(
    (refNodeId: string) => {
      if (!wsId || !userId) return;
      const ed = editorRef.current;
      if (!ed || ed.isDestroyed) return;

      // Check if the entire editor content is just the @query (empty-node reference)
      const fullText = ed.state.doc.textContent;
      const { from, to } = refRangeRef.current;
      // Text before the @ and after the query
      const beforeAt = fullText.substring(0, from - 1);
      const afterQuery = fullText.substring(to - 1);
      const isEmptyAround = beforeAt.trim() === '' && afterQuery.trim() === '';

      if (isEmptyAround) {
        const parent = entities[parentId];
        const alreadyChild = parent?.children?.includes(refNodeId) ?? false;

        if (alreadyChild) {
          // Target is already a child (owned or reference) — can't create duplicate reference.
          // Tana behavior: insert inline ref instead, keeping this as a regular content node.
          const refNode = entities[refNodeId];
          const refName = (refNode?.props.name ?? '').replace(/<[^>]+>/g, '').trim() || 'Untitled';
          ed.chain()
            .deleteRange({ from, to })
            .insertContentAt(from, {
              type: 'inlineRef',
              attrs: { nodeId: refNodeId, label: refName },
            })
            .run();
        } else {
          // Empty node @: trash this node, create temp node in conversion mode
          // Temp node has inline ref content — user sees reference bullet + cursor at end.
          // Typing adds text → keeps as normal node; blur without typing → reverts to reference.
          const pos = parent?.children?.indexOf(nodeId) ?? -1;
          trashNode(nodeId, wsId, userId);
          const tempNodeId = startRefConversion(refNodeId, parentId, pos >= 0 ? pos : 0, wsId, userId);
          setPendingRefConversion({ tempNodeId, refNodeId, parentId });
          const gpId = entities[parentId]?.props._ownerId;
          if (gpId) setExpanded(`${gpId}:${parentId}`, true);
          setTimeout(() => setFocusedNode(tempNodeId, parentId), 0);
        }
      } else {
        // Mid-text @: insert inline reference
        const refNode = entities[refNodeId];
        const refName = (refNode?.props.name ?? '').replace(/<[^>]+>/g, '').trim() || 'Untitled';
        ed.chain()
          .deleteRange({ from, to })
          .insertContentAt(from, {
            type: 'inlineRef',
            attrs: { nodeId: refNodeId, label: refName },
          })
          .run();
      }

      setRefOpen(false);
      setRefQuery('');
      setRefSelectedIndex(0);
    },
    [nodeId, parentId, wsId, userId, entities, trashNode, addReference, setExpanded, setFocusedNode, startRefConversion, setPendingRefConversion],
  );

  const handleReferenceCreateNew = useCallback(
    async (name: string) => {
      if (!wsId || !userId) return;
      const libraryId = `${wsId}_LIBRARY`;
      const newNode = await useNodeStore.getState().createChild(libraryId, wsId, userId, name);
      handleReferenceSelect(newNode.id);
    },
    [wsId, userId, handleReferenceSelect],
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
  }, []);

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

      const y = e.clientY - rect.top;
      const third = rect.height / 3;

      if (y < third) {
        setDropTarget(nodeId, 'before');
      } else if (y > third * 2) {
        setDropTarget(nodeId, 'after');
      } else {
        setDropTarget(nodeId, 'inside');
      }
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
      if (!dragNodeId || !userId || dragNodeId === nodeId) {
        setDrag(null);
        return;
      }

      const dropParentId = node?.props._ownerId;
      if (!dropParentId) {
        setDrag(null);
        return;
      }

      const dropParent = entities[dropParentId];
      const siblingIndex = dropParent?.children?.indexOf(nodeId) ?? 0;

      if (dropPosition === 'before') {
        moveNodeTo(dragNodeId, dropParentId, siblingIndex, userId);
      } else if (dropPosition === 'after') {
        if (hasChildren && isExpanded) {
          // Drop as first child
          moveNodeTo(dragNodeId, nodeId, 0, userId);
        } else {
          moveNodeTo(dragNodeId, dropParentId, siblingIndex + 1, userId);
        }
      } else if (dropPosition === 'inside') {
        moveNodeTo(dragNodeId, nodeId, 0, userId);
        setExpanded(`${parentId}:${nodeId}`, true);
      }

      setDrag(null);
    },
    [dragNodeId, nodeId, parentId, userId, node, entities, dropPosition, hasChildren, isExpanded, moveNodeTo, setExpanded, setDrag],
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

  return (
    <div role="treeitem" aria-expanded={isExpanded}>
      {/* Drop indicator: before */}
      {isDropTarget && dropPosition === 'before' && (
        <div
          className="h-0.5 bg-primary rounded-full"
          style={{ marginLeft: depth * 28 + 6 + 15 + 4 }}
        />
      )}
      <div
        ref={rowRef}
        className={`group/row flex gap-1 min-h-7 items-start py-1 ${
          isDropTarget && dropPosition === 'inside'
            ? 'bg-primary/10 ring-1 ring-primary/30 rounded-sm'
            : ''
        } ${isDragging ? 'opacity-40' : ''}`}
        style={{ paddingLeft: depth * 28 + 6 }}
        draggable={!isFocused}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
      >
        {/* Chevron: 15px zone, visible on row hover only */}
        <ChevronButton
          isExpanded={isExpanded}
          onToggle={handleToggle}
          onDrillDown={handleDrillDown}
        />
        {/* Selection ring wraps bullet + text (not chevron) */}
        <div className={`flex items-start gap-2 flex-1 min-w-0 relative ${isSelected ? 'ring-1 ring-primary/40 rounded-sm bg-primary/5 !w-fit !flex-none' : ''}`}>
          <BulletChevron
            hasChildren={hasChildren}
            isExpanded={isExpanded}
            onBulletClick={handleBulletClick}
            isReference={isReference || isPendingConversion}
          />
          <div className={`relative flex-1 min-w-0 ${isPendingConversion ? 'ref-converting' : ''}`}>
          <div
            className={`text-sm leading-[21px] ${fieldDataType !== SYS_D.CHECKBOX && !isFocused ? (isReference ? 'cursor-default' : 'cursor-text') : ''}`}
            onMouseDown={fieldDataType !== SYS_D.CHECKBOX && !isFocused ? handleContentMouseDown : undefined}
            onClick={fieldDataType !== SYS_D.CHECKBOX && !isFocused ? handleContentClick : undefined}
            onDoubleClick={fieldDataType !== SYS_D.CHECKBOX && !isFocused && isReference ? handleContentDoubleClick : undefined}
          >
            {fieldDataType === SYS_D.CHECKBOX ? (
              <input
                type="checkbox"
                checked={node.props.name === SYS_V.YES}
                onChange={(e) => {
                  if (userId) updateNodeName(nodeId, e.target.checked ? SYS_V.YES : SYS_V.NO, userId);
                }}
                className="mt-[3px] h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
              />
            ) : isFocused ? (
              <NodeEditor
                nodeId={nodeId}
                parentId={parentId}
                initialContent={node.props.name ?? ''}
                onBlur={handleBlur}
                onEnter={handleEnter}
                onIndent={handleIndent}
                onOutdent={handleOutdent}
                onDelete={handleDelete}
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
              />
            ) : (
              <span
                className="node-content"
                dangerouslySetInnerHTML={{ __html: node.props.name || '&nbsp;' }}
              />
            )}
            {hasTags && (
              <span className="inline-flex align-[0.125em] ml-1.5" onClick={(e) => e.stopPropagation()}>
                <TagBar nodeId={nodeId} />
              </span>
            )}
          </div>
          {hashTagOpen && isFocused && (
            <TagSelector
              ref={tagDropdownRef}
              open={hashTagOpen}
              onSelect={handleHashTagSelect}
              onCreateNew={handleHashTagCreateNew}
              existingTagIds={tagIds}
              query={hashTagQuery}
              selectedIndex={hashTagSelectedIndex}
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
            />
          )}
        </div>
        {/* Options picker dropdown: shown when clicking selected Options-field reference */}
        {optionsPickerOpen && allFieldOptions.length > 0 && (
          <div className="absolute left-0 top-full z-50 mt-0.5 max-h-48 w-56 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
            {allFieldOptions.map((opt, i) => (
              <div
                key={opt.id}
                className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm ${
                  opt.id === nodeId
                    ? 'bg-primary text-primary-foreground'
                    : i === optionsPickerIndex
                      ? 'bg-accent text-accent-foreground'
                      : 'text-popover-foreground hover:bg-accent/50'
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (userId && opt.id !== nodeId) {
                    removeReference(parentId, nodeId, userId);
                    addReference(parentId, opt.id, userId);
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
      {isExpanded && (
        <div
          className="relative"
          onMouseEnter={hasHiddenFields ? () => setChildrenHovered(true) : undefined}
          onMouseLeave={hasHiddenFields ? () => setChildrenHovered(false) : undefined}
        >
          {/* Indent guide line — 16px click area LEFT of bullet center.
               Parent bullet center = depth*28 + 32.5.
               Button right edge at depth*28+33 (1px gap to child ChevronButton at depth*28+34).
               Visual line at right edge via justify-end, centered at ~32.5.
               No overlap with child chevron/bullet hover zones. */}
          <button
            className="indent-line absolute top-0 bottom-0 z-10 flex justify-end cursor-pointer"
            style={{ left: depth * 28 + 17, width: 16 }}
            onClick={handleIndentLineClick}
            title="Toggle children"
          >
            <div className="indent-line-inner w-px h-full bg-border rounded-full" />
          </button>
          {/* Render children in natural order: fields as FieldRow, content as OutlinerItem */}
          {visibleChildren.map(({ id, type, hidden }, i) => {
            // ALWAYS-hidden fields: never render
            if (hidden && fieldMap.get(id)?.hideMode === SYS_V.ALWAYS) return null;
            // Conditionally hidden fields: render only on hover, dimmed
            if (hidden && !childrenHovered) return null;
            return type === 'field' ? (
              <div key={id} className={`@container${hidden ? ' opacity-50 transition-opacity' : ''}`} style={{ paddingLeft: (depth + 1) * 28 + 6 + 15 + 4 }}>
                <FieldRow
                  nodeId={nodeId}
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
                  onNavigateOut={(direction) => {
                    if (direction === 'up') {
                      // Escape up → focus this parent node
                      setFocusedNode(nodeId, parentId);
                    } else {
                      // Escape down → focus next content child after this field, or parent's next
                      let found = false;
                      for (let j = i + 1; j < visibleChildren.length; j++) {
                        if (visibleChildren[j].type === 'content' && !visibleChildren[j].hidden) {
                          setFocusedNode(visibleChildren[j].id, nodeId);
                          found = true;
                          break;
                        }
                      }
                      if (!found) {
                        const fl = getFlattenedVisibleNodes(rootChildIds, useNodeStore.getState().entities, useUIStore.getState().expandedNodes, rootNodeId);
                        const nx = getNextVisibleNode(nodeId, parentId, fl);
                        if (nx) setFocusedNode(nx.nodeId, nx.parentId);
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
                parentId={nodeId}
                rootNodeId={rootNodeId}
              />
            );
          })}
          {visibleChildren.length === 0 && (
            <TrailingInput
              parentId={nodeId}
              depth={depth + 1}
              autoFocus
              parentExpandKey={expandKey}
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


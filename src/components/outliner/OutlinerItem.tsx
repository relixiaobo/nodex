import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import type { Editor } from '@tiptap/react';
import { useNode } from '../../hooks/use-node';
import { useChildren } from '../../hooks/use-children';
import { useNodeTags } from '../../hooks/use-node-tags';
import { useNodeFields, type FieldEntry } from '../../hooks/use-node-fields';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { BulletChevron } from './BulletChevron';
import { NodeEditor } from '../editor/NodeEditor';
import { TrailingInput } from '../editor/TrailingInput';
import { TagBar } from '../tags/TagBar';
import { TagSelector, type TagDropdownHandle } from '../tags/TagSelector';
import { ReferenceSelector, type ReferenceDropdownHandle } from '../references/ReferenceSelector';
import { FieldRow } from '../fields/FieldRow';
import {
  getFlattenedVisibleNodes,
  getPreviousVisibleNode,
  getNextVisibleNode,
} from '../../lib/tree-utils';

interface OutlinerItemProps {
  nodeId: string;
  depth: number;
  rootChildIds: string[];
  parentId: string;
  rootNodeId: string;
}

export function OutlinerItem({ nodeId, depth, rootChildIds, parentId, rootNodeId }: OutlinerItemProps) {
  const node = useNode(nodeId);
  const expandKey = `${parentId}:${nodeId}`;
  const isExpanded = useUIStore((s) => s.expandedNodes.has(`${parentId}:${nodeId}`));
  const focusedNodeId = useUIStore((s) => s.focusedNodeId);
  const focusedParentId = useUIStore((s) => s.focusedParentId);
  const setFocusedNode = useUIStore((s) => s.setFocusedNode);
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
  const visibleChildren = useMemo(() => {
    const result: { id: string; type: 'field' | 'content' }[] = [];
    for (const cid of allChildIds) {
      if (fieldMap.has(cid)) {
        result.push({ id: cid, type: 'field' });
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
  const hasChildren = visibleChildren.length > 0;
  const isFocused = focusedNodeId === nodeId &&
    (focusedParentId === null || focusedParentId === parentId);
  const hasTags = tagIds.length > 0;
  const hasFields = fields.length > 0;
  const isReference = !!node && node.props._ownerId !== parentId;

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

  const handleBlur = useCallback(() => {
    // Only clear focus if this node is still the focused one.
    // Prevents race condition: Enter creates sibling → setFocusedNode(newId) →
    // old editor unmounts → onBlur fires → would wrongly reset to null.
    const state = useUIStore.getState();
    if (state.focusedNodeId === nodeId &&
        (state.focusedParentId === null || state.focusedParentId === parentId)) {
      setFocusedNode(null);
    }
  }, [nodeId, parentId, setFocusedNode]);

  const handleContentClick = useCallback((e: React.MouseEvent) => {
    // Intercept clicks on inline references (blue links in static display)
    const target = e.target as HTMLElement;
    const refEl = target.closest('[data-inlineref-node]') as HTMLElement;
    if (refEl) {
      e.stopPropagation();
      const refId = refEl.getAttribute('data-inlineref-node');
      if (refId) {
        navigateTo(refId);
        return;
      }
    }
    setFocusedNode(nodeId, parentId);
  }, [nodeId, parentId, setFocusedNode, navigateTo]);

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
    [nodeId, parentId, wsId, userId, createSibling, createChild, setFocusedNode],
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
    if (prev) setFocusedNode(prev.nodeId, prev.parentId);
  }, [nodeId, parentId, rootNodeId, rootChildIds, entities, expandedNodes, setFocusedNode]);

  const handleArrowDown = useCallback(() => {
    const flatList = getFlattenedVisibleNodes(rootChildIds, entities, expandedNodes, rootNodeId);
    const next = getNextVisibleNode(nodeId, parentId, flatList);
    if (next) setFocusedNode(next.nodeId, next.parentId);
  }, [nodeId, parentId, rootNodeId, rootChildIds, entities, expandedNodes, setFocusedNode]);

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
        // Empty node @: trash this node, add reference at same position
        const parent = entities[parentId];
        const pos = parent?.children?.indexOf(nodeId) ?? -1;
        trashNode(nodeId, wsId, userId);
        addReference(parentId, refNodeId, userId, pos >= 0 ? pos : undefined);
        // Parent is already expanded (otherwise this item wouldn't render).
        // Use best-effort grandparent lookup for the compound expand key.
        const gpId = entities[parentId]?.props._ownerId;
        if (gpId) setExpanded(`${gpId}:${parentId}`, true);
        setFocusedNode(refNodeId, parentId);
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
    [nodeId, parentId, wsId, userId, entities, trashNode, addReference, setExpanded, setFocusedNode],
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
        style={{ paddingLeft: depth * 24 }}
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
          style={{ marginLeft: depth * 24 + 6 + 30 }}
        />
      )}
      <div
        ref={rowRef}
        className={`group/row flex min-h-7 items-start gap-[7.5px] py-1 ${
          isDropTarget && dropPosition === 'inside'
            ? 'bg-primary/10 ring-1 ring-primary/30 rounded-sm'
            : ''
        } ${isDragging ? 'opacity-40' : ''}`}
        style={{ paddingLeft: depth * 24 + 6 }}
        draggable={!isFocused}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
      >
        <BulletChevron
          hasChildren={hasChildren}
          isExpanded={isExpanded}
          onToggle={handleToggle}
          onDrillDown={handleDrillDown}
          onBulletClick={handleBulletClick}
          isReference={isReference}
        />
        <div className="flex-1 min-w-0 relative">
          <div
            className={`text-sm leading-[21px] ${!isFocused ? 'cursor-text' : ''}`}
            onClick={!isFocused ? handleContentClick : undefined}
          >
            {isFocused ? (
              <NodeEditor
                nodeId={nodeId}
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
                dangerouslySetInnerHTML={{
                  __html: node.props.name || '&nbsp;',
                }}
              />
            )}
            {hasTags && (
              <span className="inline-flex align-baseline ml-1.5" onClick={(e) => e.stopPropagation()}>
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
      </div>
      {/* Drop indicator: after */}
      {isDropTarget && dropPosition === 'after' && (
        <div
          className="h-0.5 bg-primary rounded-full"
          style={{ marginLeft: depth * 24 + 6 + 30 }}
        />
      )}
      {isExpanded && (
        <div className="relative">
          {/* Indent guide line — clickable 8px button (Tana: left 13.5px from parent).
               Center aligns with parent bullet center. Hover fills bg = looks thicker. */}
          <button
            className="indent-line absolute top-0 bottom-0 w-2 flex justify-center cursor-pointer rounded-sm transition-colors"
            style={{ left: depth * 24 + 6 + 18.5 }}
            onClick={handleIndentLineClick}
            title="Toggle children"
          >
            <div className="w-px h-full bg-border/80" />
          </button>
          {/* Render children in natural order: fields as FieldRow, content as OutlinerItem */}
          {visibleChildren.map(({ id, type }, i) =>
            type === 'field' ? (
              <div key={id} className="@container" style={{ paddingLeft: (depth + 1) * 24 + 6 + 15 }}>
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
            ),
          )}
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

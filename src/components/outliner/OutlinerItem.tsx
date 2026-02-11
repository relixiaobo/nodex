import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react';
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
import { FieldRow } from '../fields/FieldRow';
import {
  getFlattenedVisibleNodes,
  getPreviousVisibleNodeId,
  getNextVisibleNodeId,
} from '../../lib/tree-utils';

interface OutlinerItemProps {
  nodeId: string;
  depth: number;
  rootChildIds: string[];
}

export function OutlinerItem({ nodeId, depth, rootChildIds }: OutlinerItemProps) {
  const node = useNode(nodeId);
  const isExpanded = useUIStore((s) => s.expandedNodes.has(nodeId));
  const focusedNodeId = useUIStore((s) => s.focusedNodeId);
  const setFocusedNode = useUIStore((s) => s.setFocusedNode);
  const toggleExpanded = useUIStore((s) => s.toggleExpanded);
  const setExpanded = useUIStore((s) => s.setExpanded);
  const pushPanel = useUIStore((s) => s.pushPanel);
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
  const isFocused = focusedNodeId === nodeId;
  const hasTags = tagIds.length > 0;
  const hasFields = fields.length > 0;

  // ─── Basic handlers ───

  const handleBlur = useCallback(() => {
    // Only clear focus if this node is still the focused one.
    // Prevents race condition: Enter creates sibling → setFocusedNode(newId) →
    // old editor unmounts → onBlur fires → would wrongly reset to null.
    if (useUIStore.getState().focusedNodeId === nodeId) {
      setFocusedNode(null);
    }
  }, [nodeId, setFocusedNode]);

  const handleClick = useCallback(() => {
    setFocusedNode(nodeId);
  }, [nodeId, setFocusedNode]);

  const handleToggle = useCallback(() => {
    const currentNode = useNodeStore.getState().entities[nodeId];
    const currentHasChildren = (currentNode?.children ?? []).length > 0;
    const currentlyExpanded = useUIStore.getState().expandedNodes.has(nodeId);

    if (!currentHasChildren && !currentlyExpanded) {
      // Leaf node: expand to show trailing input (auto-focuses)
      setExpanded(nodeId, true);
    } else {
      toggleExpanded(nodeId);
    }
  }, [nodeId, toggleExpanded, setExpanded]);

  const handleDrillDown = useCallback(() => {
    pushPanel(nodeId);
  }, [nodeId, pushPanel]);

  const handleBulletClick = useCallback(() => {
    pushPanel(nodeId);
  }, [nodeId, pushPanel]);

  const handleIndentLineClick = useCallback(() => {
    // Toggle expand/collapse all direct children (Tana indent guide line behavior)
    const currentChildIds = useNodeStore.getState().entities[nodeId]?.children ?? [];
    const expanded = useUIStore.getState().expandedNodes;
    // Check if any child is expanded
    const anyChildExpanded = currentChildIds.some((cid) => expanded.has(cid));
    const next = new Set(expanded);
    for (const cid of currentChildIds) {
      if (anyChildExpanded) {
        next.delete(cid);
      } else {
        next.add(cid);
      }
    }
    useUIStore.setState({ expandedNodes: next });
  }, [nodeId]);

  // ─── Keyboard shortcut handlers ───

  const handleEnter = useCallback(
    (afterContent?: string) => {
      if (!wsId || !userId) return;

      const currentlyExpanded = useUIStore.getState().expandedNodes.has(nodeId);
      const currentHasChildren =
        (useNodeStore.getState().entities[nodeId]?.children ?? []).length > 0;

      if (afterContent !== undefined && currentlyExpanded && currentHasChildren) {
        // Split with expanded children → afterContent becomes first child
        createChild(nodeId, wsId, userId, afterContent, 0).then((newNode) => {
          setFocusedNode(newNode.id);
        });
      } else {
        // Create sibling (with split text or empty)
        createSibling(nodeId, wsId, userId, afterContent).then((newNode) => {
          setFocusedNode(newNode.id);
        });
      }
    },
    [nodeId, wsId, userId, createSibling, createChild, setFocusedNode],
  );

  const handleIndent = useCallback(() => {
    if (!userId) return;

    // Pre-compute new parent (previous sibling) and expand it BEFORE moving.
    // This prevents the node from being unmounted between state updates,
    // which would cause blur → focus loss.
    const currentNode = useNodeStore.getState().entities[nodeId];
    const parentId = currentNode?.props._ownerId;
    if (!parentId) return;

    const parent = useNodeStore.getState().entities[parentId];
    if (!parent?.children) return;

    const index = parent.children.indexOf(nodeId);
    if (index <= 0) return; // Can't indent first child

    const newParentId = parent.children[index - 1];
    setExpanded(newParentId, true);
    indentNode(nodeId, userId);
  }, [nodeId, userId, indentNode, setExpanded]);

  const handleOutdent = useCallback(() => {
    if (!userId) return;
    outdentNode(nodeId, userId);
  }, [nodeId, userId, outdentNode]);

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

    const flatList = getFlattenedVisibleNodes(rootChildIds, entities, expandedNodes);
    const prevId = getPreviousVisibleNodeId(nodeId, flatList);

    trashNode(nodeId, wsId, userId);
    setFocusedNode(prevId);
    return true;
  }, [nodeId, wsId, userId, rootChildIds, entities, expandedNodes, trashNode, setFocusedNode]);

  const handleArrowUp = useCallback(() => {
    const flatList = getFlattenedVisibleNodes(rootChildIds, entities, expandedNodes);
    const prevId = getPreviousVisibleNodeId(nodeId, flatList);
    if (prevId) setFocusedNode(prevId);
  }, [nodeId, rootChildIds, entities, expandedNodes, setFocusedNode]);

  const handleArrowDown = useCallback(() => {
    const flatList = getFlattenedVisibleNodes(rootChildIds, entities, expandedNodes);
    const nextId = getNextVisibleNodeId(nodeId, flatList);
    if (nextId) setFocusedNode(nextId);
  }, [nodeId, rootChildIds, entities, expandedNodes, setFocusedNode]);

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
  }, [hashTagOpen]);

  const handleHashTagDeactivate = useCallback(() => {
    // Only close if it was truly deactivated (user deleted the #)
    setHashTagOpen(false);
    setHashTagQuery('');
    setHashTagSelectedIndex(0);
  }, []);

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

      const parentId = node?.props._ownerId;
      if (!parentId) {
        setDrag(null);
        return;
      }

      const parent = entities[parentId];
      const siblingIndex = parent?.children?.indexOf(nodeId) ?? 0;

      if (dropPosition === 'before') {
        moveNodeTo(dragNodeId, parentId, siblingIndex, userId);
      } else if (dropPosition === 'after') {
        if (hasChildren && isExpanded) {
          // Drop as first child
          moveNodeTo(dragNodeId, nodeId, 0, userId);
        } else {
          moveNodeTo(dragNodeId, parentId, siblingIndex + 1, userId);
        }
      } else if (dropPosition === 'inside') {
        moveNodeTo(dragNodeId, nodeId, 0, userId);
        setExpanded(nodeId, true);
      }

      setDrag(null);
    },
    [dragNodeId, nodeId, userId, node, entities, dropPosition, hasChildren, isExpanded, moveNodeTo, setExpanded, setDrag],
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
        />
        <div className="flex-1 min-w-0 relative">
          <div
            className={`text-sm leading-[21px] ${!isFocused ? 'cursor-text' : ''}`}
            onClick={!isFocused ? handleClick : undefined}
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
              />
            ) : (
              <span
                className="node-content"
                dangerouslySetInnerHTML={{
                  __html:
                    node.props.name ||
                    '<span class="text-muted-foreground">Untitled</span>',
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
          {hasChildren && (
            <button
              className="indent-line absolute top-0 bottom-0 w-2 flex justify-center cursor-pointer rounded-sm transition-colors"
              style={{ left: depth * 24 + 6 + 18.5 }}
              onClick={handleIndentLineClick}
              title="Toggle children"
            >
              <div className="w-px h-full bg-border/80" />
            </button>
          )}
          {/* Render children in natural order: fields as FieldRow, content as OutlinerItem */}
          {visibleChildren.map(({ id, type }, i) =>
            type === 'field' ? (
              <div key={id} style={{ paddingLeft: (depth + 1) * 24 + 6 + 15 }}>
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
                />
              </div>
            ) : (
              <OutlinerItem
                key={id}
                nodeId={id}
                depth={depth + 1}
                rootChildIds={rootChildIds}
              />
            ),
          )}
          {visibleChildren.length === 0 && (
            <TrailingInput
              parentId={nodeId}
              depth={depth + 1}
              autoFocus
            />
          )}
        </div>
      )}
    </div>
  );
}

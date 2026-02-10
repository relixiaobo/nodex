import { useCallback, useRef, type DragEvent } from 'react';
import { useNode } from '../../hooks/use-node';
import { useChildren } from '../../hooks/use-children';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { BulletChevron } from './BulletChevron';
import { NodeEditor } from '../editor/NodeEditor';
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
  const indentNode = useNodeStore((s) => s.indentNode);
  const outdentNode = useNodeStore((s) => s.outdentNode);
  const moveNodeUp = useNodeStore((s) => s.moveNodeUp);
  const moveNodeDown = useNodeStore((s) => s.moveNodeDown);
  const moveNodeTo = useNodeStore((s) => s.moveNodeTo);
  const trashNode = useNodeStore((s) => s.trashNode);
  const entities = useNodeStore((s) => s.entities);

  const rowRef = useRef<HTMLDivElement>(null);

  // Lazy-load children when expanded
  useChildren(isExpanded ? nodeId : null);

  const childIds = node?.children ?? [];
  const hasChildren = childIds.length > 0;
  const isFocused = focusedNodeId === nodeId;

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
    toggleExpanded(nodeId);
  }, [nodeId, toggleExpanded]);

  const handleDrillDown = useCallback(() => {
    pushPanel(nodeId);
  }, [nodeId, pushPanel]);

  // ─── Keyboard shortcut handlers ───

  const handleEnter = useCallback(() => {
    if (!wsId || !userId) return;
    createSibling(nodeId, wsId, userId).then((newNode) => {
      setFocusedNode(newNode.id);
    });
  }, [nodeId, wsId, userId, createSibling, setFocusedNode]);

  const handleIndent = useCallback(() => {
    if (!userId) return;
    indentNode(nodeId, userId).then(() => {
      const updatedNode = useNodeStore.getState().entities[nodeId];
      if (updatedNode?.props._ownerId) {
        setExpanded(updatedNode.props._ownerId, true);
      }
    });
  }, [nodeId, userId, indentNode, setExpanded]);

  const handleOutdent = useCallback(() => {
    if (!userId) return;
    outdentNode(nodeId, userId);
  }, [nodeId, userId, outdentNode]);

  const handleDelete = useCallback((): boolean => {
    if (!wsId || !userId) return false;
    if (node?.props.name && node.props.name.length > 0) return false;

    const flatList = getFlattenedVisibleNodes(rootChildIds, entities, expandedNodes);
    const prevId = getPreviousVisibleNodeId(nodeId, flatList);

    trashNode(nodeId, wsId, userId);
    setFocusedNode(prevId);
    return true;
  }, [nodeId, node, wsId, userId, rootChildIds, entities, expandedNodes, trashNode, setFocusedNode]);

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
          style={{ marginLeft: depth * 24 + 20 }}
        />
      )}
      <div
        ref={rowRef}
        className={`group flex min-h-7 items-start gap-0.5 rounded-sm py-0.5 ${
          isFocused
            ? 'bg-primary/5'
            : isDropTarget && dropPosition === 'inside'
              ? 'bg-primary/10 ring-1 ring-primary/30'
              : 'hover:bg-muted/50'
        } ${isDragging ? 'opacity-40' : ''}`}
        style={{ paddingLeft: depth * 24 }}
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
        />
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
          />
        ) : (
          <div
            className="flex-1 cursor-text text-sm leading-7 min-w-0"
            onClick={handleClick}
            dangerouslySetInnerHTML={{
              __html:
                node.props.name ||
                '<span class="text-muted-foreground">Untitled</span>',
            }}
          />
        )}
      </div>
      {/* Drop indicator: after */}
      {isDropTarget && dropPosition === 'after' && (
        <div
          className="h-0.5 bg-primary rounded-full"
          style={{ marginLeft: depth * 24 + 20 }}
        />
      )}
      {isExpanded &&
        childIds.map((childId) => (
          <OutlinerItem
            key={childId}
            nodeId={childId}
            depth={depth + 1}
            rootChildIds={rootChildIds}
          />
        ))}
    </div>
  );
}

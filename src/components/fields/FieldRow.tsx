/**
 * Single field row: two-column layout with separator line.
 *
 * ──────────────────────────────────────
 * [icon] [editable name   ] • value node
 *                            • value node 2
 * ──────────────────────────────────────
 *
 * - Type icon: clickable → pushPanel to attrDef
 * - Field name: static label, click to edit (activates FieldNameInput)
 * - Value area: FieldValueOutliner (plain) or OptionsFieldValue (options dropdown)
 */
import { useCallback, useRef } from 'react';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { getFieldTypeIcon } from '../../lib/field-utils.js';
import { FieldValueOutliner } from './FieldValueOutliner';
import { FieldNameInput } from './FieldNameInput';

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
}

export function FieldRow({
  nodeId,
  attrDefId,
  attrDefName,
  tupleId,
  dataType,
  assocDataId,
  isLastInGroup,
}: FieldRowProps) {
  const pushPanel = useUIStore((s) => s.pushPanel);
  const editingFieldNameId = useUIStore((s) => s.editingFieldNameId);
  const setEditingFieldName = useUIStore((s) => s.setEditingFieldName);
  const setFocusedNode = useUIStore((s) => s.setFocusedNode);
  const createSibling = useNodeStore((s) => s.createSibling);
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const userId = useWorkspaceStore((s) => s.userId);
  const clickOffsetXRef = useRef<number | undefined>(undefined);

  const isEditing = editingFieldNameId === tupleId;
  const Icon = getFieldTypeIcon(dataType);

  const handleEnterConfirm = useCallback(() => {
    if (!wsId || !userId) return;
    // Create a normal content node after the current field tuple
    createSibling(tupleId, wsId, userId).then((newNode) => {
      setFocusedNode(newNode.id, nodeId);
    });
  }, [tupleId, nodeId, wsId, userId, createSibling, setFocusedNode]);

  const handleNameClick = useCallback((e: React.MouseEvent<HTMLSpanElement>) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    clickOffsetXRef.current = e.clientX - rect.left;
    setEditingFieldName(tupleId);
  }, [tupleId, setEditingFieldName]);

  return (
    <div className={`border-t ${isLastInGroup ? 'border-b' : ''} border-border/40 flex items-center min-h-[28px] py-1`} data-field-row>
      {/* Name column — fixed height container to prevent jump */}
      <div className="flex items-center gap-1 shrink-0 w-[130px] min-w-0 h-[22px]">
        <button
          className="shrink-0 w-[15px] flex items-center justify-center text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          onClick={() => pushPanel(attrDefId)}
          title="Configure field"
        >
          <Icon size={12} />
        </button>
        <div className="flex-1 min-w-0">
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
              className="block text-sm leading-[22px] h-[22px] text-foreground truncate cursor-text"
              onClick={handleNameClick}
              title={attrDefName}
            >
              {attrDefName}
            </span>
          )}
        </div>
      </div>
      {/* Value column — node-based outliner for all field types */}
      <div className="flex-1 min-w-0" data-field-value>
        {assocDataId ? (
          <FieldValueOutliner assocDataId={assocDataId} />
        ) : (
          <span className="text-[11px] text-muted-foreground/50 leading-[22px]">Empty</span>
        )}
      </div>
    </div>
  );
}

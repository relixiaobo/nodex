/**
 * Single field row: two-column layout with separator line.
 *
 * Regular fields:
 * ──────────────────────────────────────
 * [icon] [editable name   ] • value node
 *                            • value node 2
 * ──────────────────────────────────────
 *
 * Config fields (attrDef):
 * ──────────────────────────────────────
 * [icon] Field name           [control]
 *        Description text
 * ──────────────────────────────────────
 *
 * - Type icon: clickable → navigateTo to attrDef (regular), static (config)
 * - Field name: static label, click to edit (activates FieldNameInput)
 * - Config description: shown below name in name column
 * - Value area: FieldValueOutliner (plain) or OptionsFieldValue (options dropdown)
 */
import { useCallback, useRef } from 'react';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { getFieldTypeIcon, ATTRDEF_CONFIG_MAP, TAGDEF_CONFIG_MAP } from '../../lib/field-utils.js';
import { FieldValueOutliner } from './FieldValueOutliner';
import { FieldNameInput } from './FieldNameInput';
import { FieldTypePicker } from './FieldTypePicker';
import { ConfigToggle } from './ConfigToggle';
import { ConfigSelect } from './ConfigSelect';
import { ConfigOutliner } from './ConfigOutliner';
import { ATTRDEF_OUTLINER_FIELDS } from '../../lib/field-utils.js';

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
  valueName,
  dataType,
  assocDataId,
  isLastInGroup,
}: FieldRowProps) {
  const navigateTo = useUIStore((s) => s.navigateTo);
  const editingFieldNameId = useUIStore((s) => s.editingFieldNameId);
  const setEditingFieldName = useUIStore((s) => s.setEditingFieldName);
  const setFocusedNode = useUIStore((s) => s.setFocusedNode);
  const createSibling = useNodeStore((s) => s.createSibling);
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const userId = useWorkspaceStore((s) => s.userId);
  const clickOffsetXRef = useRef<number | undefined>(undefined);

  const isTypeChoice = dataType === '__type_choice__';
  const isToggle = dataType === '__toggle__';
  const isSelect = dataType === '__select__';
  const isOutliner = dataType === '__outliner__';
  const isTagPicker = dataType === '__tag_picker__';
  const isColorPicker = dataType === '__color_picker__';
  const isConfigField = isTypeChoice || isToggle || isSelect || isOutliner || isTagPicker || isColorPicker;
  const isEditing = editingFieldNameId === tupleId;
  const configDef = isConfigField
    ? ATTRDEF_CONFIG_MAP.get(attrDefId) ?? TAGDEF_CONFIG_MAP.get(attrDefId) ?? ATTRDEF_OUTLINER_FIELDS.find(f => f.key === attrDefId)
    : undefined;
  const Icon = configDef?.icon ?? (isConfigField ? undefined : getFieldTypeIcon(dataType));

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

  // Config fields: name+description on left, control on right (items-start for multi-line)
  if (isConfigField) {
    return (
      <div className={`border-t ${isLastInGroup ? 'border-b' : ''} border-border/40 flex items-start min-h-[28px] py-1.5`} data-field-row>
        {/* Name column — icon + name + description */}
        <div className="flex gap-1 shrink-0 w-[180px] min-w-0">
          {Icon ? (
            <span className="shrink-0 w-[15px] flex items-center justify-center text-muted-foreground/40 mt-[3px]">
              <Icon size={12} />
            </span>
          ) : (
            <span className="shrink-0 w-[15px]" />
          )}
          <div className="flex-1 min-w-0">
            <span className="block text-sm font-medium leading-[22px] text-foreground">
              {attrDefName}
            </span>
            {configDef?.description && (
              <span className="block text-xs leading-tight text-muted-foreground/50 mt-0.5">
                {configDef.description}
              </span>
            )}
          </div>
        </div>
        {/* Value column — just the control */}
        <div className="flex-1 min-w-0 flex items-center min-h-[22px]" data-field-value>
          {isTypeChoice ? (
            <FieldTypePicker attrDefId={nodeId} currentValue={valueName ?? ''} />
          ) : isToggle ? (
            <ConfigToggle tupleId={tupleId} fieldKey={attrDefId} currentValue={valueName} />
          ) : isOutliner ? (
            <ConfigOutliner nodeId={nodeId} />
          ) : isTagPicker ? (
            <span className="text-xs text-muted-foreground/50 italic">Not set</span>
          ) : isColorPicker ? (
            <span className="text-xs text-muted-foreground/50 italic">Default</span>
          ) : (
            <ConfigSelect tupleId={tupleId} fieldKey={attrDefId} currentValue={valueName} />
          )}
        </div>
      </div>
    );
  }

  // Regular fields: icon + editable name on left, value outliner on right
  return (
    <div className={`border-t ${isLastInGroup ? 'border-b' : ''} border-border/40 flex items-center min-h-[28px] py-1`} data-field-row>
      {/* Name column — fixed height container to prevent jump */}
      <div className="flex items-center gap-1 shrink-0 w-[130px] min-w-0 h-[22px]">
        <button
          className="shrink-0 w-[15px] flex items-center justify-center text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          onClick={() => navigateTo(attrDefId)}
          title="Configure field"
        >
          {Icon && <Icon size={12} />}
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
      {/* Value column */}
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

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
 * - Value area: FieldValueOutliner (plain), OptionsPicker (options), FieldValueEditor (typed)
 */
import { useCallback, useRef, useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { SYS_D } from '../../types/index.js';
import { getFieldTypeIcon, isPlainFieldType, ATTRDEF_CONFIG_MAP, TAGDEF_CONFIG_MAP } from '../../lib/field-utils.js';
import { FieldValueOutliner } from './FieldValueOutliner';
import { FieldValueEditor } from './FieldValueEditor';
import { OptionsPicker } from './OptionsPicker';
import { FieldNameInput } from './FieldNameInput';
import { FieldTypePicker } from './FieldTypePicker';
import { ConfigToggle } from './ConfigToggle';
import { ConfigSelect } from './ConfigSelect';
import { ConfigOutliner } from './ConfigOutliner';
import { AutoCollectSection } from './AutoCollectSection';
import { BulletChevron } from '../outliner/BulletChevron';
import { ATTRDEF_OUTLINER_FIELDS } from '../../lib/field-utils.js';

const noop = () => {};

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
  trashed?: boolean;
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
  trashed,
}: FieldRowProps) {
  const navigateTo = useUIStore((s) => s.navigateTo);
  const editingFieldNameId = useUIStore((s) => s.editingFieldNameId);
  const setEditingFieldName = useUIStore((s) => s.setEditingFieldName);
  const setFocusedNode = useUIStore((s) => s.setFocusedNode);
  const createSibling = useNodeStore((s) => s.createSibling);
  const setFieldValue = useNodeStore((s) => s.setFieldValue);
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const userId = useWorkspaceStore((s) => s.userId);
  const clickOffsetXRef = useRef<number | undefined>(undefined);

  const handleValueChange = useCallback((value: string) => {
    if (!wsId || !userId) return;
    setFieldValue(nodeId, attrDefId, value, wsId, userId);
  }, [nodeId, attrDefId, wsId, userId, setFieldValue]);

  const isTypeChoice = dataType === '__type_choice__';
  const isToggle = dataType === '__toggle__';
  const isSelect = dataType === '__select__';
  const isOutliner = dataType === '__outliner__';
  const isAutoCollect = dataType === '__autocollect__';
  const isTagPicker = dataType === '__tag_picker__';
  const isColorPicker = dataType === '__color_picker__';
  const isConfigField = isTypeChoice || isToggle || isSelect || isOutliner || isAutoCollect || isTagPicker || isColorPicker;
  const isEditing = editingFieldNameId === tupleId;
  const configDef = isConfigField
    ? ATTRDEF_CONFIG_MAP.get(attrDefId) ?? TAGDEF_CONFIG_MAP.get(attrDefId) ?? ATTRDEF_OUTLINER_FIELDS.find(f => f.key === attrDefId)
    : undefined;
  const Icon = configDef?.icon ?? (isConfigField ? undefined : getFieldTypeIcon(dataType));

  // Count auto-collected values for the name column "(N)"
  const autoCollectCount = useNodeStore((s) => {
    if (!isAutoCollect) return 0;
    const tuple = s.entities[tupleId];
    return Math.max(0, (tuple?.children?.length ?? 0) - 2);
  });
  const configNameDisplay = useMemo(() => {
    if (isAutoCollect && autoCollectCount > 0) return `${attrDefName} (${autoCollectCount})`;
    return attrDefName;
  }, [isAutoCollect, autoCollectCount, attrDefName]);

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
              {configNameDisplay}
            </span>
            {configDef?.description && (
              <span className="block text-xs leading-tight text-muted-foreground/50 mt-0.5">
                {configDef.description}
              </span>
            )}
          </div>
        </div>
        {/* Value column — all controls wrapped with bullet for alignment */}
        <div className="flex-1 min-w-0 min-h-[22px]" data-field-value>
          {isAutoCollect ? (
            <AutoCollectSection tupleId={tupleId} />
          ) : isOutliner ? (
            <ConfigOutliner nodeId={nodeId} />
          ) : (
            <div className="flex min-h-7 items-center gap-[7.5px] py-1" style={{ paddingLeft: 6 }}>
              <BulletChevron hasChildren={false} isExpanded={false} onToggle={noop} onDrillDown={noop} onBulletClick={noop} />
              {isTypeChoice ? (
                <FieldTypePicker attrDefId={nodeId} currentValue={valueName ?? ''} />
              ) : isToggle ? (
                <ConfigToggle tupleId={tupleId} fieldKey={attrDefId} currentValue={valueName} />
              ) : isTagPicker ? (
                <span className="text-xs text-muted-foreground/50 italic">Not set</span>
              ) : isColorPicker ? (
                <span className="text-xs text-muted-foreground/50 italic">Default</span>
              ) : (
                <ConfigSelect tupleId={tupleId} fieldKey={attrDefId} currentValue={valueName} />
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Regular fields: icon + editable name on left, value outliner on right
  return (
    <div className={`border-t ${isLastInGroup ? 'border-b' : ''} border-border/40 flex items-start min-h-[28px]`} data-field-row>
      {/* Name column — aligned to first line of value */}
      <div className="flex items-center gap-1 shrink-0 w-[130px] min-w-0 h-7 py-1">
        <button
          className="shrink-0 w-[15px] flex items-center justify-center text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          onClick={trashed ? undefined : () => navigateTo(attrDefId)}
          title={trashed ? undefined : 'Configure field'}
          style={trashed ? { cursor: 'default' } : undefined}
        >
          {Icon && <Icon size={12} />}
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-0.5">
          {trashed && (
            <span title={`Field "${attrDefName}" has been deleted`}>
              <Trash2 size={12} className="shrink-0 text-destructive/50" />
            </span>
          )}
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
        {dataType === SYS_D.OPTIONS || dataType === SYS_D.OPTIONS_FROM_SUPERTAG ? (
          <OptionsPicker nodeId={nodeId} attrDefId={attrDefId} assocDataId={assocDataId} />
        ) : isPlainFieldType(dataType) ? (
          assocDataId ? (
            <FieldValueOutliner assocDataId={assocDataId} />
          ) : (
            <div className="flex min-h-7 items-start gap-[7.5px] py-1" style={{ paddingLeft: 6 }}>
              <BulletChevron hasChildren={false} isExpanded={false} onToggle={noop} onDrillDown={noop} onBulletClick={noop} dimmed />
              <span className="text-sm leading-[21px] text-muted-foreground/40 select-none">Empty</span>
            </div>
          )
        ) : (
          <FieldValueEditor
            dataType={dataType}
            currentValue={valueName}
            onChange={handleValueChange}
          />
        )}
      </div>
    </div>
  );
}

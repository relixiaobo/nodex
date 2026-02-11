import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, Trash2, Plus, X } from 'lucide-react';
import { useNode } from '../../hooks/use-node.js';
import { useNodeStore } from '../../stores/node-store.js';
import { useUIStore } from '../../stores/ui-store.js';
import { useWorkspaceStore } from '../../stores/workspace-store.js';
import { SYS_D } from '../../types/index.js';
import {
  resolveDataType,
  resolveFieldOptions,
  getFieldTypeIcon,
  FIELD_TYPE_LIST,
} from '../../lib/field-utils.js';

interface FieldConfigPanelProps {
  nodeId: string; // attrDefId
}

export function FieldConfigPanel({ nodeId }: FieldConfigPanelProps) {
  const node = useNode(nodeId);
  const popPanel = useUIStore((s) => s.popPanel);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId) ?? '';
  const userId = useWorkspaceStore((s) => s.userId) ?? 'local';

  const dataType = useNodeStore(
    useCallback(
      (s) => resolveDataType(s.entities, nodeId),
      [nodeId],
    ),
  );
  // JSON-serialize to stabilize array reference for Zustand selector
  const optionIdsJson = useNodeStore(
    useCallback(
      (s) => JSON.stringify(resolveFieldOptions(s.entities, nodeId)),
      [nodeId],
    ),
  );
  const optionIds: string[] = useMemo(() => JSON.parse(optionIdsJson), [optionIdsJson]);

  const isOptions = dataType === SYS_D.OPTIONS || dataType === SYS_D.OPTIONS_ALT;

  // --- Name editing ---
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  const startEditName = useCallback(() => {
    setNameValue(node?.props.name ?? '');
    setEditingName(true);
  }, [node?.props.name]);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  const commitName = useCallback(() => {
    setEditingName(false);
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== node?.props.name) {
      useNodeStore.getState().renameAttrDef(nodeId, trimmed, userId);
    }
  }, [nameValue, node?.props.name, nodeId, userId]);

  // --- Type change ---
  const handleTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      useNodeStore.getState().changeFieldType(nodeId, e.target.value, userId);
    },
    [nodeId, userId],
  );

  // --- Delete ---
  const handleDelete = useCallback(() => {
    useNodeStore.getState().trashNode(nodeId, workspaceId, userId);
    popPanel();
  }, [nodeId, workspaceId, userId, popPanel]);

  // --- Add option ---
  const handleAddOption = useCallback(() => {
    const id = useNodeStore.getState().addFieldOption(nodeId, '', workspaceId, userId);
    // Focus the new option after render
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLInputElement>(`[data-option-id="${id}"]`);
      el?.focus();
    });
  }, [nodeId, workspaceId, userId]);

  const Icon = getFieldTypeIcon(dataType);
  const displayName = node?.props.name || 'Unnamed field';

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border">
        <div className="flex h-10 items-center gap-1 px-2">
          <button
            onClick={popPanel}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Go back"
          >
            <ChevronLeft size={16} strokeWidth={1.75} />
          </button>
          <span className="text-sm text-muted-foreground">Field configuration</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
        {/* Field name + icon */}
        <div className="flex items-center gap-2">
          <Icon size={18} className="shrink-0 text-muted-foreground" />
          {editingName ? (
            <input
              ref={nameInputRef}
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName();
                if (e.key === 'Escape') setEditingName(false);
              }}
              className="flex-1 text-lg font-medium bg-transparent border-b border-border outline-none"
            />
          ) : (
            <button
              onClick={startEditName}
              className="flex-1 text-left text-lg font-medium hover:text-foreground/80 cursor-text"
            >
              {displayName}
            </button>
          )}
        </div>

        {/* Field type */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Field type
          </label>
          <select
            value={dataType}
            onChange={handleTypeChange}
            className="w-full h-8 px-2 text-sm bg-muted/50 border border-border rounded-md outline-none focus:ring-1 focus:ring-ring"
          >
            {FIELD_TYPE_LIST.map((ft) => (
              <option key={ft.value} value={ft.value}>
                {ft.label}
              </option>
            ))}
          </select>
        </div>

        {/* Options (only for OPTIONS type) */}
        {isOptions && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Pre-determined options
            </label>
            <div className="space-y-1">
              {optionIds.map((optId) => (
                <OptionItem key={optId} optionId={optId} attrDefId={nodeId} userId={userId} />
              ))}
            </div>
            <button
              onClick={handleAddOption}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground py-1"
            >
              <Plus size={14} />
              <span>Add option</span>
            </button>
          </div>
        )}

        {/* Separator */}
        <div className="border-t border-border" />

        {/* Delete */}
        <button
          onClick={handleDelete}
          className="flex items-center gap-2 text-sm text-destructive hover:text-destructive/80"
        >
          <Trash2 size={14} />
          <span>Delete field</span>
        </button>
      </div>
    </div>
  );
}

// --- Option item sub-component ---

function OptionItem({
  optionId,
  attrDefId,
  userId,
}: {
  optionId: string;
  attrDefId: string;
  userId: string;
}) {
  const name = useNodeStore((s) => s.entities[optionId]?.props.name ?? '');
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback(() => {
    setValue(name);
    setEditing(true);
  }, [name]);

  // Auto-focus new options (empty name)
  useEffect(() => {
    if (name === '' && !editing) {
      setValue('');
      setEditing(true);
    }
  }, [name, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = useCallback(() => {
    setEditing(false);
    const trimmed = value.trim();
    if (trimmed !== name) {
      useNodeStore.getState().updateNodeName(optionId, trimmed, userId);
    }
  }, [value, name, optionId, userId]);

  const handleRemove = useCallback(() => {
    useNodeStore.getState().removeFieldOption(attrDefId, optionId, userId);
  }, [attrDefId, optionId, userId]);

  return (
    <div className="group flex items-center gap-2 h-7 px-1 rounded-md hover:bg-muted/50">
      <span className="h-2 w-2 shrink-0 rounded-full bg-foreground/30" />
      {editing ? (
        <input
          ref={inputRef}
          data-option-id={optionId}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
          placeholder="Option name"
          className="flex-1 text-sm bg-transparent outline-none"
        />
      ) : (
        <button
          onClick={startEdit}
          className="flex-1 text-left text-sm truncate cursor-text"
        >
          {name || <span className="text-muted-foreground italic">Unnamed</span>}
        </button>
      )}
      <button
        onClick={handleRemove}
        className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
        title="Remove option"
      >
        <X size={12} />
      </button>
    </div>
  );
}

/**
 * Options field: combobox (input + dropdown + create new).
 *
 * Sole renderer for Options-type field values. Handles both
 * showing the current selection and the combobox interaction.
 *
 * Display mode:
 * - Empty: dimmed bullet + "Select option" placeholder
 * - Has value: reference-style bullet (dotted) + node name
 *
 * Editing mode (click to enter):
 * - Input field with auto-focus for search/create
 * - Filtered dropdown of predefined options from the attrDef
 * - Enter on highlighted option → select it
 * - Enter with no match → create new option node + select it
 * - Escape / click outside → close without change
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useFieldOptions } from '../../hooks/use-field-options';
import { useNodeStore } from '../../stores/node-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { useChildren } from '../../hooks/use-children';
import { BulletChevron } from '../outliner/BulletChevron';

interface OptionsPickerProps {
  nodeId: string;
  attrDefId: string;
  assocDataId?: string;
}

export function OptionsPicker({ nodeId, attrDefId, assocDataId }: OptionsPickerProps) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [hoverIndex, setHoverIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const options = useFieldOptions(attrDefId);
  const setOptionsFieldValue = useNodeStore((s) => s.setOptionsFieldValue);
  const autoCollectOption = useNodeStore((s) => s.autoCollectOption);
  const userId = useWorkspaceStore((s) => s.userId);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  // Load current selection from assocData.children
  useChildren(assocDataId ?? '');
  const selectedJson = useNodeStore((s) => {
    if (!assocDataId) return '[]';
    const assoc = s.entities[assocDataId];
    const children = assoc?.children ?? [];
    if (children.length === 0) return '[]';
    return JSON.stringify(
      children.map((id) => {
        const node = s.entities[id];
        return node ? { id, name: node.props.name ?? '' } : null;
      }).filter(Boolean),
    );
  });
  const selectedNodes: { id: string; name: string }[] = useMemo(
    () => JSON.parse(selectedJson),
    [selectedJson],
  );
  const selectedIds = useMemo(
    () => new Set(selectedNodes.map((n) => n.id)),
    [selectedNodes],
  );

  // Filter options by input value
  const filteredOptions = useMemo(() => {
    if (!inputValue.trim()) return options;
    const query = inputValue.trim().toLowerCase();
    return options.filter((opt) => opt.name.toLowerCase().includes(query));
  }, [options, inputValue]);

  // Reset hover index when filtered options change
  useEffect(() => {
    setHoverIndex(0);
  }, [filteredOptions.length]);

  const closeEditor = useCallback(() => {
    setEditing(false);
    setInputValue('');
    setHoverIndex(0);
  }, []);

  // Auto-focus input when entering editing mode
  useEffect(() => {
    if (editing) {
      // Use rAF to ensure the input is rendered before focusing
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [editing]);

  // Close on click outside
  useEffect(() => {
    if (!editing) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeEditor();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [editing, closeEditor]);

  const handleSelect = useCallback(
    (optionId: string) => {
      if (!userId) return;
      setOptionsFieldValue(nodeId, attrDefId, optionId, userId);
      closeEditor();
    },
    [nodeId, attrDefId, userId, setOptionsFieldValue, closeEditor],
  );

  const handleCreate = useCallback(
    (name: string) => {
      if (!userId || !workspaceId) return;
      // Auto-collect: creates value node, sets as field value, adds to autocollect tuple
      autoCollectOption(nodeId, attrDefId, name, workspaceId, userId);
      closeEditor();
    },
    [nodeId, attrDefId, userId, workspaceId, autoCollectOption, closeEditor],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHoverIndex((i) => Math.min(i + 1, filteredOptions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHoverIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredOptions[hoverIndex]) {
          handleSelect(filteredOptions[hoverIndex].id);
        } else if (inputValue.trim()) {
          // No matching option — create new one
          handleCreate(inputValue.trim());
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeEditor();
      }
    },
    [filteredOptions, hoverIndex, inputValue, handleSelect, handleCreate, closeEditor],
  );

  const handleClick = useCallback(() => {
    if (!editing) {
      setEditing(true);
      setInputValue('');
    }
  }, [editing]);

  const noop = useCallback(() => {}, []);
  const hasValue = selectedNodes.length > 0;

  return (
    <div
      ref={containerRef}
      className="relative min-h-[22px]"
    >
      {editing ? (
        /* Editing mode: bullet + input + dropdown */
        <div>
          <div
            className="flex min-h-7 items-start gap-[7.5px] py-1"
            style={{ paddingLeft: 6 }}
          >
            <BulletChevron
              hasChildren={false}
              isExpanded={false}
              onToggle={noop}
              onDrillDown={noop}
              onBulletClick={noop}
            />
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type to search or create..."
              className="flex-1 min-w-0 bg-transparent text-sm leading-[21px] text-foreground outline-none placeholder:text-muted-foreground/40"
            />
          </div>

          {/* Dropdown */}
          {filteredOptions.length > 0 ? (
            <div
              className="absolute left-6 top-full z-50 mt-0.5 w-48 max-h-40 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg py-1"
              onMouseDown={(e) => e.preventDefault()}
            >
              {filteredOptions.map((opt, i) => (
                <button
                  key={opt.id}
                  className={`flex w-full items-center gap-1.5 px-3 py-1.5 text-xs text-left transition-colors ${
                    i === hoverIndex ? 'bg-accent' : 'hover:bg-accent/50'
                  } ${selectedIds.has(opt.id) ? 'text-primary font-medium' : 'text-foreground'}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(opt.id)}
                  onMouseEnter={() => setHoverIndex(i)}
                >
                  {selectedIds.has(opt.id) && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  )}
                  {opt.name}
                </button>
              ))}
            </div>
          ) : inputValue.trim() ? (
            /* No matches — show create hint */
            <div
              className="absolute left-6 top-full z-50 mt-0.5 w-48 rounded-lg border border-border bg-popover shadow-lg py-1"
              onMouseDown={(e) => e.preventDefault()}
            >
              <button
                className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs text-left bg-accent text-foreground"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleCreate(inputValue.trim())}
              >
                Create "<span className="font-medium">{inputValue.trim()}</span>"
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        /* Display mode — click to enter editing */
        <div
          className="cursor-pointer group/picker"
          onClick={handleClick}
        >
          {hasValue ? (
            selectedNodes.map((node) => (
              <div
                key={node.id}
                className="flex min-h-7 items-start gap-[7.5px] py-1"
                style={{ paddingLeft: 6 }}
              >
                <BulletChevron
                  hasChildren={false}
                  isExpanded={false}
                  onToggle={noop}
                  onDrillDown={noop}
                  onBulletClick={noop}
                  isReference
                />
                <span className="text-sm leading-[21px] text-foreground">
                  {node.name}
                </span>
              </div>
            ))
          ) : (
            <div
              className="flex min-h-7 items-start gap-[7.5px] py-1"
              style={{ paddingLeft: 6 }}
            >
              <BulletChevron
                hasChildren={false}
                isExpanded={false}
                onToggle={noop}
                onDrillDown={noop}
                onBulletClick={noop}
                dimmed
              />
              <span className="text-sm leading-[21px] text-muted-foreground/40 select-none group-hover/picker:text-muted-foreground/60 transition-colors">
                Select option
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

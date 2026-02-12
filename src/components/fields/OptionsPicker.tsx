/**
 * Options field: display + picker in one component.
 *
 * Sole renderer for Options-type field values. Handles both
 * showing the current selection and the picker dropdown.
 *
 * - Empty: "• Select option" placeholder (dimmed bullet + text)
 * - Has value: reference-style bullet (dotted) + node name — click to change
 * - Click opens dropdown of predefined options from the attrDef
 * - Selecting replaces the current value (single-select)
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
  const [open, setOpen] = useState(false);
  const [hoverIndex, setHoverIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const options = useFieldOptions(attrDefId);
  const setOptionsFieldValue = useNodeStore((s) => s.setOptionsFieldValue);
  const userId = useWorkspaceStore((s) => s.userId);

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

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = useCallback(
    (optionId: string) => {
      if (!userId) return;
      setOptionsFieldValue(nodeId, attrDefId, optionId, userId);
      setOpen(false);
    },
    [nodeId, attrDefId, userId, setOptionsFieldValue],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHoverIndex((i) => Math.min(i + 1, options.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHoverIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (options[hoverIndex]) handleSelect(options[hoverIndex].id);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    },
    [open, options, hoverIndex, handleSelect],
  );

  const handleClick = useCallback(() => {
    setOpen((prev) => !prev);
    setHoverIndex(0);
  }, []);

  const noop = useCallback(() => {}, []);
  const hasValue = selectedNodes.length > 0;

  return (
    <div
      ref={containerRef}
      className="relative min-h-[22px]"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* Display area — click to open/close picker */}
      <div
        className="cursor-pointer group/picker"
        onClick={handleClick}
      >
        {hasValue ? (
          /* Selected value: reference-style bullet + name */
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
          /* Empty: placeholder */
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

      {/* Dropdown */}
      {open && options.length > 0 && (
        <div
          className="absolute left-6 z-50 mt-0 w-48 max-h-40 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg py-1"
          onMouseDown={(e) => e.preventDefault()}
        >
          {options.map((opt, i) => (
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
      )}
    </div>
  );
}

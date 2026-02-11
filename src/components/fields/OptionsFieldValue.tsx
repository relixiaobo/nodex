/**
 * Options field value: dropdown of preset options + reference-style display.
 *
 * Values are stored in AssociatedData.children (same as plain fields).
 * The difference is rendering: reference-style nodes + dropdown picker.
 *
 * - No value → "Select..." placeholder, click opens dropdown
 * - Has value → ReferenceNode (blue link), click opens dropdown to change
 * - Select → replaces assocData.children with option node ID
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useFieldOptions } from '../../hooks/use-field-options';
import { useNodeStore } from '../../stores/node-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { useChildren } from '../../hooks/use-children';
import { ReferenceNode } from './ReferenceNode';

interface OptionsFieldValueProps {
  nodeId: string;
  attrDefId: string;
  assocDataId: string;
}

export function OptionsFieldValue({ nodeId, attrDefId, assocDataId }: OptionsFieldValueProps) {
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useChildren(assocDataId);
  const childIds = useNodeStore((s) => s.entities[assocDataId]?.children ?? []);
  const options = useFieldOptions(attrDefId);
  const setOptionsFieldValue = useNodeStore((s) => s.setOptionsFieldValue);
  const userId = useWorkspaceStore((s) => s.userId);

  // Resolve selected value(s) — JSON selector to avoid infinite re-render
  const selectedIds = new Set(childIds);
  const selectedJson = useNodeStore((s) => {
    if (childIds.length === 0) return '[]';
    const nodes = childIds
      .map((id) => {
        const node = s.entities[id];
        return node ? { id, name: node.props.name ?? '' } : null;
      })
      .filter(Boolean);
    return JSON.stringify(nodes);
  });
  const selectedNodes: { id: string; name: string }[] = useMemo(
    () => (selectedJson === '[]' ? [] : JSON.parse(selectedJson)),
    [selectedJson],
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
        setSelectedIndex((i) => Math.min(i + 1, options.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (options[selectedIndex]) handleSelect(options[selectedIndex].id);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    },
    [open, options, selectedIndex, handleSelect],
  );

  const handleClick = useCallback(() => {
    setOpen((prev) => !prev);
    setSelectedIndex(0);
  }, []);

  return (
    <div ref={containerRef} className="relative min-h-[22px]" onKeyDown={handleKeyDown} tabIndex={-1}>
      <div className="cursor-pointer" onClick={handleClick}>
        {selectedNodes.length > 0 ? (
          selectedNodes.map((node) => (
            <ReferenceNode key={node.id} name={node.name} />
          ))
        ) : (
          <span className="text-[11px] text-muted-foreground/50 leading-[22px] select-none">
            Select...
          </span>
        )}
      </div>

      {open && options.length > 0 && (
        <div
          className="absolute left-0 z-50 mt-1 w-48 max-h-40 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg py-1"
          onMouseDown={(e) => e.preventDefault()}
        >
          {options.map((opt, i) => (
            <button
              key={opt.id}
              className={`flex w-full items-center gap-1.5 px-3 py-1.5 text-xs text-left transition-colors ${
                i === selectedIndex ? 'bg-accent' : 'hover:bg-accent/50'
              } ${selectedIds.has(opt.id) ? 'text-primary font-medium' : 'text-foreground'}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(opt.id)}
              onMouseEnter={() => setSelectedIndex(i)}
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

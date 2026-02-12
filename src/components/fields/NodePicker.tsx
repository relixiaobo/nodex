/**
 * Generic combobox component: bullet + click-to-edit + filtered dropdown.
 *
 * Used by OptionsPicker, FieldTypePicker, and ConfigSelect.
 *
 * Display mode:
 *   - Has value: bullet (reference style when isReference) + selected name
 *   - Empty: dimmed bullet + placeholder text
 *
 * Editing mode (click to enter):
 *   - Bullet + input (auto-focus) + filtered dropdown
 *   - ArrowUp/Down navigate, Enter selects, Escape closes
 *   - allowCreate + no match → "Create ..." button
 *   - Click outside → close
 *
 * Self-contained bullet layout (pl-6 + BulletChevron + gap-7.5px).
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { BulletChevron } from '../outliner/BulletChevron';

export interface NodePickerOption {
  id: string;
  name: string;
}

interface NodePickerProps {
  options: NodePickerOption[];
  selectedId?: string;
  onSelect: (id: string) => void;
  allowCreate?: boolean;
  onCreate?: (name: string) => void;
  placeholder?: string;
  isReference?: boolean;
}

const noop = () => {};

export function NodePicker({
  options,
  selectedId,
  onSelect,
  allowCreate = false,
  onCreate,
  placeholder = 'Select...',
  isReference = false,
}: NodePickerProps) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [hoverIndex, setHoverIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedName = useMemo(() => {
    if (!selectedId) return undefined;
    return options.find((o) => o.id === selectedId)?.name;
  }, [options, selectedId]);

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
      onSelect(optionId);
      closeEditor();
    },
    [onSelect, closeEditor],
  );

  const handleCreate = useCallback(
    (name: string) => {
      onCreate?.(name);
      closeEditor();
    },
    [onCreate, closeEditor],
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
        } else if (allowCreate && inputValue.trim()) {
          handleCreate(inputValue.trim());
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeEditor();
      }
    },
    [filteredOptions, hoverIndex, inputValue, allowCreate, handleSelect, handleCreate, closeEditor],
  );

  const handleClick = useCallback(() => {
    if (!editing) {
      setEditing(true);
      setInputValue('');
    }
  }, [editing]);

  return (
    <div ref={containerRef} className="relative min-h-[22px]">
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
              placeholder={allowCreate ? 'Type to search or create...' : 'Type to search...'}
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
                  } ${opt.id === selectedId ? 'text-primary font-medium' : 'text-foreground'}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(opt.id)}
                  onMouseEnter={() => setHoverIndex(i)}
                >
                  {opt.id === selectedId && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  )}
                  {opt.name}
                </button>
              ))}
            </div>
          ) : allowCreate && inputValue.trim() ? (
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
        <div className="cursor-pointer group/picker" onClick={handleClick}>
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
              {...(selectedName ? (isReference ? { isReference: true } : {}) : { dimmed: true })}
            />
            <span
              className={
                selectedName
                  ? 'text-sm leading-[21px] text-foreground'
                  : 'text-sm leading-[21px] text-muted-foreground/40 select-none group-hover/picker:text-muted-foreground/60 transition-colors'
              }
            >
              {selectedName ?? placeholder}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Generic combobox component: bullet + inline-edit + filtered dropdown.
 *
 * Used by OptionsPicker, FieldTypePicker, and ConfigSelect.
 *
 * Click on value → value becomes editable input (pre-filled, selected),
 * dropdown appears below. Typing filters options. Backspace clears.
 * ArrowUp/Down navigate, Enter selects, Escape closes, click outside closes.
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
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  // Whether the input text is in "selected" state (all text highlighted, next keystroke replaces)
  const [textSelected, setTextSelected] = useState(false);
  const [hoverIndex, setHoverIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedName = useMemo(() => {
    if (!selectedId) return undefined;
    return options.find((o) => o.id === selectedId)?.name;
  }, [options, selectedId]);

  // When textSelected, show all options (user hasn't typed yet); otherwise filter
  const filteredOptions = useMemo(() => {
    if (textSelected || !inputValue.trim()) return options;
    const query = inputValue.trim().toLowerCase();
    return options.filter((opt) => opt.name.toLowerCase().includes(query));
  }, [options, inputValue, textSelected]);

  // Reset hover index when filtered options change
  useEffect(() => {
    setHoverIndex(0);
  }, [filteredOptions.length]);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setInputValue('');
    setTextSelected(false);
    setHoverIndex(0);
  }, []);

  // Auto-focus and select input when dropdown opens
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        const input = inputRef.current;
        if (input) {
          input.focus();
          input.select();
        }
      });
    }
  }, [open]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, closeDropdown]);

  const handleSelect = useCallback(
    (optionId: string) => {
      onSelect(optionId);
      closeDropdown();
    },
    [onSelect, closeDropdown],
  );

  const handleCreate = useCallback(
    (name: string) => {
      onCreate?.(name);
      closeDropdown();
    },
    [onCreate, closeDropdown],
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
        closeDropdown();
      }
    },
    [filteredOptions, hoverIndex, inputValue, allowCreate, handleSelect, handleCreate, closeDropdown],
  );

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setTextSelected(false);
  }, []);

  const handleClick = useCallback(() => {
    if (!open) {
      setOpen(true);
      setInputValue(selectedName ?? '');
      setTextSelected(true);
    }
  }, [open, selectedName]);

  return (
    <div ref={containerRef} className="relative min-h-[22px]">
      {/* Value row — static display or inline editable input */}
      <div
        className={`cursor-pointer group/picker ${open ? '' : ''}`}
        onClick={handleClick}
      >
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
            {...(open
              ? (isReference ? { isReference: true } : {})
              : selectedName
                ? (isReference ? { isReference: true } : {})
                : { dimmed: true })}
          />
          {open ? (
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              className="flex-1 min-w-0 bg-transparent text-sm leading-[21px] text-foreground outline-none
                border-b border-primary/40 -mb-px"
            />
          ) : (
            <span
              className={
                selectedName
                  ? 'text-sm leading-[21px] text-foreground'
                  : 'text-sm leading-[21px] text-muted-foreground/40 select-none group-hover/picker:text-muted-foreground/60 transition-colors'
              }
            >
              {selectedName ?? placeholder}
            </span>
          )}
        </div>
      </div>

      {/* Dropdown — shown below the value */}
      {open && (
        <div
          className="absolute left-6 top-full z-50 mt-0.5 w-48 max-h-52 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg"
          onMouseDown={(e) => e.preventDefault()}
        >
          {/* Option list — bullet + text per item */}
          {filteredOptions.length > 0 ? (
            <div className="py-0.5">
              {filteredOptions.map((opt, i) => (
                <button
                  key={opt.id}
                  className={`flex w-full items-center gap-[7.5px] pl-1.5 pr-3 min-h-7 text-left transition-colors ${
                    i === hoverIndex ? 'bg-accent' : 'hover:bg-accent/50'
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(opt.id)}
                  onMouseEnter={() => setHoverIndex(i)}
                >
                  <span className="flex shrink-0 w-[15px] h-[15px] items-center justify-center">
                    <span className="block h-[5px] w-[5px] rounded-full bg-foreground/50" />
                  </span>
                  <span className="text-sm leading-[21px] text-foreground">
                    {opt.name}
                  </span>
                </button>
              ))}
            </div>
          ) : allowCreate && inputValue.trim() ? (
            <div className="py-0.5">
              <button
                className="flex w-full items-center gap-[7.5px] pl-1.5 pr-3 min-h-7 text-left bg-accent text-foreground"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleCreate(inputValue.trim())}
              >
                <span className="flex shrink-0 w-[15px] h-[15px] items-center justify-center">
                  <span className="block h-[5px] w-[5px] rounded-full bg-foreground/50" />
                </span>
                <span className="text-sm leading-[21px]">
                  Create "<span className="font-medium">{inputValue.trim()}</span>"
                </span>
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

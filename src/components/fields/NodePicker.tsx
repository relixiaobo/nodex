/**
 * Generic combobox component: bullet + click-to-edit + filtered dropdown.
 *
 * Used by OptionsPicker and FieldValueOutliner.
 *
 * Two editing modes based on isReference:
 * - Non-reference (config fields): click → plain input with cursor, like editing a normal node
 * - Reference (Options): click → bordered box "selected" state, typing replaces/filters
 *
 * ArrowUp/Down navigate, Enter selects, Escape closes, click outside closes.
 * Self-contained bullet layout (pl-6 + BulletChevron + gap-7.5px).
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { BulletChevron } from '../outliner/BulletChevron';
import { resolveTagColor } from '../../lib/tag-colors.js';
import { useNodeStore } from '../../stores/node-store';

export interface NodePickerOption {
  id: string;
  name: string;
  /** When true, renders colored # bullet instead of plain dot */
  isTagDef?: boolean;
}

interface NodePickerProps {
  options: NodePickerOption[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onClear?: () => void;
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
  onClear,
  allowCreate = false,
  onCreate,
  placeholder = 'Select...',
  isReference = false,
}: NodePickerProps) {
  const entities = useNodeStore((s) => s.entities);
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  // Whether the input text is in "selected" state (all text highlighted, next keystroke replaces)
  const [textSelected, setTextSelected] = useState(false);
  const [hoverIndex, setHoverIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOption = useMemo(() => {
    if (!selectedId) return undefined;
    return options.find((o) => o.id === selectedId);
  }, [options, selectedId]);

  const selectedName = selectedOption?.name;
  const selectedTagDefColor = selectedOption?.isTagDef ? resolveTagColor(entities, selectedOption.id).text : undefined;

  // Show all options when: textSelected (reference just opened), empty input,
  // or input matches selectedName exactly (non-reference just opened, not yet typed)
  const filteredOptions = useMemo(() => {
    if (textSelected || !inputValue.trim() || inputValue === selectedName) return options;
    const query = inputValue.trim().toLowerCase();
    return options.filter((opt) => opt.name.toLowerCase().includes(query));
  }, [options, inputValue, textSelected, selectedName]);

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

  // Auto-focus input when dropdown opens
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        const input = inputRef.current;
        if (input) {
          input.focus();
          if (!(isReference && selectedName)) {
            // Non-reference or empty reference: place cursor at end
            const len = input.value.length;
            input.setSelectionRange(len, len);
          }
        }
      });
    }
  }, [open, isReference, selectedName]);

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
      } else if (e.key === 'Backspace' && isReference && textSelected) {
        // Reference mode: backspace clears value and transitions to empty input state
        e.preventDefault();
        onClear?.();
        setInputValue('');
        setTextSelected(false);
        setHoverIndex(0);
        // Keep open — component re-renders to empty input with cursor
      }
    },
    [filteredOptions, hoverIndex, inputValue, allowCreate, isReference, textSelected, onClear, handleSelect, handleCreate, closeDropdown],
  );

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setTextSelected(false);
  }, []);

  const handleClick = useCallback(() => {
    if (!open) {
      setOpen(true);
      // Pre-select the currently selected item in the dropdown
      const idx = selectedId ? options.findIndex((o) => o.id === selectedId) : -1;
      setHoverIndex(idx >= 0 ? idx : 0);
      if (isReference && selectedName) {
        // Reference mode with value: hidden input starts empty, visible box shows selectedName
        setInputValue('');
        setTextSelected(true);
      } else {
        // Non-reference or empty reference: input with cursor, like a normal node
        setInputValue(selectedName ?? '');
        setTextSelected(false);
      }
    }
  }, [open, selectedId, selectedName, isReference, options]);

  return (
    <div ref={containerRef} className="relative min-h-[22px]">
      {/* Value row — click to open dropdown */}
      <div
        className="cursor-pointer group/picker"
        onClick={handleClick}
      >
        {open && isReference && selectedName ? (
          /* Reference mode: outline wraps bullet+text */
          <div
            className="flex min-h-7 items-start py-1"
            style={{ paddingLeft: 6 }}
          >
            {/* Outline wraps reference bullet + text together (like Tana) */}
            <span className="inline-flex items-center gap-2 rounded-sm outline outline-1 outline-primary/50">
              {/* Reference bullet dot (no chevron) — tagDef shows colored # */}
              <span className="flex shrink-0 h-[21px] w-[15px] items-center justify-center">
                {selectedTagDefColor ? (
                  <span
                    className="flex h-[13px] w-[13px] items-center justify-center rounded-full"
                    style={{ backgroundColor: selectedTagDefColor }}
                  >
                    <span className="text-[9px] font-bold leading-none text-white select-none">#</span>
                  </span>
                ) : (
                  <span className="flex h-[15px] w-[15px] items-center justify-center rounded-full border border-dashed border-foreground/40">
                    <span className="block h-[5px] w-[5px] rounded-full bg-foreground/50" />
                  </span>
                )}
              </span>
              <span className="text-sm leading-[21px] text-foreground pr-1">
                {textSelected ? selectedName : inputValue}
              </span>
            </span>
            {/* Hidden input for keyboard capture */}
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              className="sr-only"
              aria-hidden
            />
          </div>
        ) : (
          /* Non-reference mode or closed state */
          <div
            className="flex min-h-7 items-start gap-2 py-1"
            style={{ paddingLeft: 6 }}
          >
            <BulletChevron
              hasChildren={false}
              isExpanded={false}
              onBulletClick={noop}
              {...(selectedName
                ? (isReference ? { isReference: true } : {})
                : { dimmed: true })}
              tagDefColor={selectedTagDefColor}
            />
            {open ? (
              /* Non-reference editing: plain input with cursor, like a normal node */
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                className="flex-1 min-w-0 bg-transparent text-sm leading-[21px] text-foreground outline-none"
              />
            ) : (
              <span
                className={
                  selectedName
                    ? 'text-sm leading-[21px] text-foreground'
                    : 'text-sm leading-[21px] text-foreground-tertiary select-none group-hover/picker:text-foreground-secondary transition-colors'
                }
              >
                {selectedName ?? placeholder}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Dropdown — shown below the value */}
      {open && (
        <div
          className="absolute left-6 top-full z-50 mt-0.5 w-56 max-h-52 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg p-1"
          onMouseDown={(e) => e.preventDefault()}
        >
          {/* Option list — bullet + text per item */}
          {filteredOptions.length > 0 ? (
            <div>
              {filteredOptions.map((opt, i) => (
                <button
                  key={opt.id}
                  className={`flex w-full items-start gap-2 rounded-md px-2 py-1 min-h-7 text-left transition-colors ${
                    i === hoverIndex ? 'bg-accent' : 'hover:bg-foreground/5'
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(opt.id)}
                  onMouseEnter={() => setHoverIndex(i)}
                >
                  <span className="flex shrink-0 w-[15px] h-[21px] items-center justify-center">
                    {opt.isTagDef ? (
                      <span
                        className="flex h-[13px] w-[13px] items-center justify-center rounded-full"
                        style={{ backgroundColor: resolveTagColor(entities, opt.id).text }}
                      >
                        <span className="text-[9px] font-bold leading-none text-white select-none">#</span>
                      </span>
                    ) : (
                      <span className="block h-[5px] w-[5px] rounded-full bg-foreground/50" />
                    )}
                  </span>
                  <span className="text-sm leading-[21px] text-foreground">
                    {opt.name}
                  </span>
                </button>
              ))}
            </div>
          ) : allowCreate && inputValue.trim() ? (
            <div>
              <button
                className="flex w-full items-start gap-2 rounded-md px-2 py-1 min-h-7 text-left bg-accent text-foreground"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleCreate(inputValue.trim())}
              >
                <span className="flex shrink-0 w-[15px] h-[21px] items-center justify-center">
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

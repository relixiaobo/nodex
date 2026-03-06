/**
 * Inline editable field name with autocomplete.
 *
 * Auto-focuses on mount. Shows matching workspace fields as suggestions.
 * - Enter / blur → confirm name (reuse existing attrDef or rename placeholder)
 * - Tab → confirm + focus value area
 * - Escape → close editing, keep "Untitled"
 */
import { useState, useRef, useEffect, useLayoutEffect, useCallback, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useWorkspaceFields } from '../../hooks/use-workspace-fields';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { t } from '../../i18n/strings.js';

interface FieldNameInputProps {
  tupleId: string;
  nodeId: string;
  attrDefId: string;
  currentName: string;
  onEnterConfirm?: () => void;
  onNavigateRow?: (direction: 'up' | 'down') => void;
  onIndentRow?: () => void;
  onOutdentRow?: () => void;
  clickOffsetX?: number;
}

export function FieldNameInput({
  tupleId,
  nodeId,
  attrDefId,
  currentName,
  onEnterConfirm,
  onNavigateRow,
  onIndentRow,
  onOutdentRow,
  clickOffsetX,
}: FieldNameInputProps) {
  const [value, setValue] = useState(currentName === t('common.untitled') ? '' : currentName);
  const [selectedIndex, setSelectedIndex] = useState(0);
  // Track whether the user has actively typed — prevents dropdown on focus alone.
  const [isTyping, setIsTyping] = useState(currentName === t('common.untitled') || !currentName);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const confirmedRef = useRef(false);

  const allFields = useWorkspaceFields();
  const renameFieldDef = useNodeStore((s) => s.renameFieldDef);
  const replaceFieldDef = useNodeStore((s) => s.replaceFieldDef);
  const removeField = useNodeStore((s) => s.removeField);
  const setEditingFieldName = useUIStore((s) => s.setEditingFieldName);
  const setSelectedNode = useUIStore((s) => s.setSelectedNode);

  // Filter suggestions: exclude current attrDefId, match by typed text.
  // Only show suggestions when the user has actively typed (not on mere focus).
  const suggestions = isTyping && value.trim()
    ? allFields.filter(
      (f) => f.id !== attrDefId && f.name.toLowerCase().includes(value.toLowerCase()),
    ).slice(0, 5)
    : [];

  // Auto-focus + position cursor at click point (or end if no click offset)
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();

    if (clickOffsetX !== undefined && input.value) {
      // Measure text to find cursor position matching the click X offset
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const style = getComputedStyle(input);
        ctx.font = `${style.fontSize} ${style.fontFamily}`;
        const text = input.value;
        let pos = text.length;
        for (let i = 0; i <= text.length; i++) {
          const w = ctx.measureText(text.substring(0, i)).width;
          if (w >= clickOffsetX) {
            // Snap to nearest character boundary
            const prevW = i > 0 ? ctx.measureText(text.substring(0, i - 1)).width : 0;
            pos = (clickOffsetX - prevW < w - clickOffsetX) ? Math.max(0, i - 1) : i;
            break;
          }
        }
        input.setSelectionRange(pos, pos);
      }
    } else {
      // New field (Untitled) — place cursor at end
      const len = input.value.length;
      input.setSelectionRange(len, len);
    }
  }, []);

  const confirm = useCallback(
    (opts?: { focusValue?: boolean }) => {
      if (confirmedRef.current) return;
      confirmedRef.current = true;

      const trimmed = value.trim();

      // Check if typed name matches an existing field definition
      const match = trimmed
        ? allFields.find((f) => f.id !== attrDefId && f.name.toLowerCase() === trimmed.toLowerCase())
        : null;

      if (match) {
        // Reuse existing fieldDef → swap + delete placeholder
        replaceFieldDef(nodeId, tupleId, attrDefId, match.id);
      } else if (trimmed && trimmed !== currentName) {
        // Rename placeholder fieldDef
        renameFieldDef(attrDefId, trimmed);
      }

      setEditingFieldName(null);

      if (opts?.focusValue) {
        // Tab → focus value area
        requestAnimationFrame(() => {
          const row = containerRef.current?.closest('[data-field-row]');
          const valueArea = row?.querySelector<HTMLElement>(
            '[data-field-value] [contenteditable], [data-field-value] input',
          );
          valueArea?.focus();
        });
      }
    },
    [value, allFields, attrDefId, nodeId, tupleId, currentName, renameFieldDef, replaceFieldDef, setEditingFieldName],
  );

  const selectSuggestion = useCallback(
    (fieldId: string) => {
      if (confirmedRef.current) return;
      confirmedRef.current = true;
      replaceFieldDef(nodeId, tupleId, attrDefId, fieldId);
      setEditingFieldName(null);
    },
    [nodeId, tupleId, attrDefId, replaceFieldDef, setEditingFieldName],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // When a suggestion is highlighted in the dropdown, Enter applies that suggestion.
        if (suggestions.length > 0 && selectedIndex >= 0 && selectedIndex < suggestions.length) {
          selectSuggestion(suggestions[selectedIndex].id);
          return;
        }
        // Otherwise: confirm name (reuse exact-match attrDef if needed) + create content node below.
        confirm();
        onEnterConfirm?.();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          confirm();
          onOutdentRow?.();
        } else {
          confirm();
          onIndentRow?.();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        confirmedRef.current = true;
        setEditingFieldName(null);
        // Select the field tuple (same pattern as content node Escape→selected)
        setSelectedNode(tupleId, nodeId);
      } else if (e.key === 'Backspace') {
        // Empty field name + Backspace → delete the entire field
        if (value === '') {
          e.preventDefault();
          confirmedRef.current = true;
          setEditingFieldName(null);
          removeField(nodeId, tupleId);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (suggestions.length > 0) {
          setSelectedIndex((i) => Math.min(i + 1, suggestions.length - 1));
        } else if (onNavigateRow) {
          confirm();
          onNavigateRow('down');
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (suggestions.length > 0) {
          setSelectedIndex((i) => Math.max(i - 1, 0));
        } else if (onNavigateRow) {
          confirm();
          onNavigateRow('up');
        }
      }
    },
    [
      confirm,
      onEnterConfirm,
      onNavigateRow,
      onIndentRow,
      onOutdentRow,
      suggestions,
      selectedIndex,
      selectSuggestion,
      setEditingFieldName,
      value,
      nodeId,
      tupleId,
      removeField,
    ],
  );

  const [suggestionsPos, setSuggestionsPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (suggestions.length === 0 || !containerRef.current) {
      setSuggestionsPos(null);
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    setSuggestionsPos({ top: rect.bottom + 2, left: rect.left });
  }, [suggestions.length]);

  return (
    <div ref={containerRef} className="relative h-6">
      <input
        ref={inputRef}
        type="text"
        className="block w-full bg-transparent text-[15px] text-foreground outline-none border-0 py-0 px-0 m-0 h-6 leading-6 placeholder:text-foreground/20"
        placeholder={t('field.fieldNamePlaceholder')}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSelectedIndex(0);
          if (!isTyping) setIsTyping(true);
        }}
        onBlur={() => confirm()}
        onKeyDown={handleKeyDown}
      />
      {suggestions.length > 0 && suggestionsPos && createPortal(
        <div
          className="w-[180px] bg-background shadow-paper rounded-lg p-1 text-sm"
          style={{ position: 'fixed', top: suggestionsPos.top, left: suggestionsPos.left, zIndex: 1200 }}
        >
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              className={`w-full text-left rounded-md px-2 py-1 truncate ${i === selectedIndex ? 'bg-primary-muted text-foreground' : 'text-foreground hover:bg-foreground/4'
                }`}
              onMouseDown={(e) => {
                e.preventDefault(); // prevent blur
                selectSuggestion(s.id);
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              {s.name}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

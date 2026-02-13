/**
 * Inline editor for Date / Number / URL / Email field value nodes.
 *
 * Used inside OutlinerItem as a replacement for NodeEditor (ProseMirror)
 * when the node is a field value of these types. Renders a borderless
 * <input> that matches the node text style (text-sm leading-[21px]).
 *
 * Date: hidden <input type="date">, opens native picker immediately.
 * Number/URL/Email: plain <input type="text">.
 *
 * Validation is non-blocking: saves any value, shows warning icon.
 */
import { useRef, useEffect, useCallback } from 'react';
import { CircleAlert } from 'lucide-react';
import { SYS_D } from '../../types/index.js';

/** Set of field data types that use inline editing instead of ProseMirror */
export const INLINE_FIELD_TYPES: Set<string> = new Set([
  SYS_D.DATE, SYS_D.NUMBER, SYS_D.INTEGER, SYS_D.URL, SYS_D.EMAIL,
]);

interface FieldInlineEditorProps {
  /** Current node name (the raw value) */
  value: string;
  fieldDataType: string;
  /** Called on save — same as NodeEditor's updateNodeName */
  onSave: (value: string) => void;
  /** Called when editing ends (like NodeEditor onBlur) */
  onBlur: () => void;
}

export function FieldInlineEditor({ value, fieldDataType, onSave, onBlur }: FieldInlineEditorProps) {
  if (fieldDataType === SYS_D.DATE) {
    return <DateInput value={value} onSave={onSave} onBlur={onBlur} />;
  }
  return <TextInput value={value} onSave={onSave} onBlur={onBlur} />;
}

// ─── Date input: opens native picker immediately ───

function DateInput({ value, onSave, onBlur }: { value: string; onSave: (v: string) => void; onBlur: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    // Open the native date picker immediately
    try { el.showPicker(); } catch { el.focus(); }
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      if (v !== value) onSave(v);
      // Close after selection
      onBlur();
    },
    [value, onSave, onBlur],
  );

  // If user dismisses picker without selecting, blur out
  const handleBlurEvent = useCallback(() => {
    onBlur();
  }, [onBlur]);

  return (
    <input
      ref={inputRef}
      type="date"
      defaultValue={toDateInputValue(value)}
      onChange={handleChange}
      onBlur={handleBlurEvent}
      className="min-w-0 flex-1 bg-transparent text-sm leading-[21px] outline-none"
    />
  );
}

// ─── Text input (Number / URL / Email) ───

function TextInput({ value, onSave, onBlur }: { value: string; onSave: (v: string) => void; onBlur: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const handleBlurEvent = useCallback(() => {
    const trimmed = inputRef.current?.value.trim() ?? '';
    if (trimmed !== value) onSave(trimmed);
    onBlur();
  }, [value, onSave, onBlur]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const trimmed = inputRef.current?.value.trim() ?? '';
        if (trimmed !== value) onSave(trimmed);
        onBlur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onBlur();
      }
    },
    [value, onSave, onBlur],
  );

  return (
    <input
      ref={inputRef}
      type="text"
      defaultValue={value}
      onBlur={handleBlurEvent}
      onKeyDown={handleKeyDown}
      className="min-w-0 flex-1 bg-transparent text-sm leading-[21px] outline-none"
    />
  );
}

// ─── Display helpers (used by OutlinerItem for non-focused rendering) ───

export function formatFieldDate(isoDate: string): string {
  try {
    const date = new Date(isoDate + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

function toDateInputValue(value?: string): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

export function validateFieldValue(fieldDataType: string, value: string): string | null {
  if (!value) return null;
  switch (fieldDataType) {
    case SYS_D.NUMBER:
    case SYS_D.INTEGER:
      return isNaN(Number(value)) ? 'Value should be a number' : null;
    case SYS_D.URL:
      return !value.includes('://') ? 'Value should be a URL' : null;
    case SYS_D.EMAIL:
      return !value.includes('@') ? 'Value should be an email address' : null;
    default:
      return null;
  }
}

export function ValidationWarning({ message }: { message: string }) {
  return (
    <span className="inline-flex shrink-0 cursor-default ml-1" title={message}>
      <CircleAlert className="h-3.5 w-3.5 text-warning" />
    </span>
  );
}

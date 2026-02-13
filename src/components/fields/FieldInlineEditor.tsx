/**
 * Click-to-edit inline editor for Date / Number / URL / Email field values.
 *
 * Display mode: formatted text (clickable links for URL/Email, formatted dates).
 * Edit mode: plain text <input> (or type="date" for Date).
 * Validation: non-blocking visual warning icon with tooltip.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { CircleAlert } from 'lucide-react';
import { SYS_D } from '../../types/index.js';

interface FieldInlineEditorProps {
  fieldDataType: string;
  value?: string;
  onSave: (value: string) => void;
}

// ─── Validation helpers ───

function validateValue(fieldDataType: string, value: string): string | null {
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

// ─── Date formatting ───

function formatFieldDate(value: string): string {
  // Try parsing ISO date (YYYY-MM-DD) or other formats
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toDateInputValue(value?: string): string {
  if (!value) return '';
  // If already YYYY-MM-DD, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

export function FieldInlineEditor({ fieldDataType, value, onSave }: FieldInlineEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync draft when value changes externally
  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);

  // Auto-focus on edit start
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (fieldDataType !== SYS_D.DATE) {
        inputRef.current.select();
      }
    }
  }, [editing, fieldDataType]);

  const save = useCallback(() => {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed !== (value ?? '')) {
      onSave(trimmed);
    }
  }, [draft, value, onSave]);

  const cancel = useCallback(() => {
    setDraft(value ?? '');
    setEditing(false);
  }, [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        save();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    },
    [save, cancel],
  );

  // ─── Edit mode ───
  if (editing) {
    const isDate = fieldDataType === SYS_D.DATE;
    return (
      <input
        ref={inputRef}
        type={isDate ? 'date' : 'text'}
        value={isDate ? toDateInputValue(draft) : draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={handleKeyDown}
        className="h-6 w-full min-w-0 rounded border border-border bg-background px-1.5 text-sm outline-none focus:border-primary"
      />
    );
  }

  // ─── Display mode ───
  const isEmpty = !value;
  const warning = value ? validateValue(fieldDataType, value) : null;

  if (isEmpty) {
    return (
      <span
        className="flex-1 cursor-text text-sm text-muted-foreground/50 select-none"
        onClick={() => setEditing(true)}
      >
        Empty
      </span>
    );
  }

  // URL: clickable blue link
  if (fieldDataType === SYS_D.URL) {
    const href = value!.includes('://') ? value! : `https://${value!}`;
    return (
      <span className="flex min-w-0 items-center gap-1">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate text-sm text-primary underline hover:text-primary/80"
          onClick={(e) => e.stopPropagation()}
        >
          {value}
        </a>
        <span
          className="cursor-text text-sm text-transparent hover:text-muted-foreground/50 select-none px-1"
          onClick={() => setEditing(true)}
          title="Edit"
        >
          ✎
        </span>
        {warning && <ValidationWarning message={warning} />}
      </span>
    );
  }

  // Email: clickable mailto link
  if (fieldDataType === SYS_D.EMAIL) {
    return (
      <span className="flex min-w-0 items-center gap-1">
        <a
          href={`mailto:${value}`}
          className="truncate text-sm text-primary underline hover:text-primary/80"
          onClick={(e) => e.stopPropagation()}
        >
          {value}
        </a>
        <span
          className="cursor-text text-sm text-transparent hover:text-muted-foreground/50 select-none px-1"
          onClick={() => setEditing(true)}
          title="Edit"
        >
          ✎
        </span>
        {warning && <ValidationWarning message={warning} />}
      </span>
    );
  }

  // Date: formatted display
  if (fieldDataType === SYS_D.DATE) {
    return (
      <span className="flex min-w-0 items-center gap-1">
        <span
          className="cursor-text truncate text-sm"
          onClick={() => setEditing(true)}
        >
          {formatFieldDate(value!)}
        </span>
        {warning && <ValidationWarning message={warning} />}
      </span>
    );
  }

  // Number / Integer: plain text
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span
        className="cursor-text truncate text-sm"
        onClick={() => setEditing(true)}
      >
        {value}
      </span>
      {warning && <ValidationWarning message={warning} />}
    </span>
  );
}

// ─── Validation warning icon ───

function ValidationWarning({ message }: { message: string }) {
  return (
    <span className="shrink-0 cursor-default" title={message}>
      <CircleAlert className="h-3.5 w-3.5 text-amber-500" />
    </span>
  );
}

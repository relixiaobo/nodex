/**
 * Polymorphic field value editor — switches UI by data type.
 * Tana-style: click-to-edit text for most types, minimal chrome.
 *
 * Handles: Date, Number, Integer, URL, Email, Checkbox.
 * Options are handled by OptionsFieldValue; Plain by FieldValueOutliner.
 */
import { useState, useCallback } from 'react';
import { SYS_D, SYS_V } from '../../types/index.js';

const INPUT_CLASS =
  'h-5 rounded bg-transparent px-1 text-[11px] text-foreground outline-none border border-transparent focus:border-border/50 focus:bg-background';

interface FieldValueEditorProps {
  dataType: string;
  currentValue?: string;
  onChange: (value: string) => void;
}

export function FieldValueEditor({ dataType, currentValue, onChange }: FieldValueEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(currentValue ?? '');

  const commitAndClose = useCallback(() => {
    setEditing(false);
    if (draft !== (currentValue ?? '')) {
      onChange(draft);
    }
  }, [draft, currentValue, onChange]);

  // Checkbox type — uses SYS_V03 (Yes) / SYS_V04 (No)
  if (dataType === SYS_D.CHECKBOX) {
    return (
      <input
        type="checkbox"
        checked={currentValue === SYS_V.YES}
        onChange={(e) => onChange(e.target.checked ? SYS_V.YES : SYS_V.NO)}
        className="h-3 w-3 rounded border-border/50 accent-primary"
      />
    );
  }

  // Date type — click-to-reveal date input
  if (dataType === SYS_D.DATE) {
    if (editing) {
      return (
        <input
          autoFocus
          type="date"
          value={currentValue ?? ''}
          onChange={(e) => { onChange(e.target.value); setEditing(false); }}
          onBlur={() => setEditing(false)}
          className={`${INPUT_CLASS} w-auto`}
        />
      );
    }
    return (
      <span
        onClick={() => setEditing(true)}
        className="cursor-pointer text-[11px] text-foreground/80 hover:text-foreground"
      >
        {currentValue || <span className="text-muted-foreground/50">Empty</span>}
      </span>
    );
  }

  // Number / Integer types
  if (dataType === SYS_D.NUMBER || dataType === SYS_D.INTEGER) {
    if (editing) {
      return (
        <input
          autoFocus
          type="number"
          value={draft}
          step={dataType === SYS_D.INTEGER ? '1' : 'any'}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitAndClose}
          onKeyDown={(e) => { if (e.key === 'Enter') commitAndClose(); if (e.key === 'Escape') setEditing(false); }}
          placeholder="0"
          className={`${INPUT_CLASS} w-16`}
        />
      );
    }
    return (
      <span
        onClick={() => { setDraft(currentValue ?? ''); setEditing(true); }}
        className="cursor-text text-[11px] text-foreground/80"
      >
        {currentValue || <span className="text-muted-foreground/50">Empty</span>}
      </span>
    );
  }

  // URL type
  if (editing && dataType === SYS_D.URL) {
    return (
      <input
        autoFocus
        type="url"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitAndClose}
        onKeyDown={(e) => { if (e.key === 'Enter') commitAndClose(); if (e.key === 'Escape') setEditing(false); }}
        placeholder="https://..."
        className={`${INPUT_CLASS} min-w-[100px] flex-1`}
      />
    );
  }

  if (dataType === SYS_D.URL) {
    return (
      <span
        onClick={() => { setDraft(currentValue ?? ''); setEditing(true); }}
        className="cursor-text text-[11px] text-primary/70 underline decoration-primary/20 hover:decoration-primary/50"
      >
        {currentValue || <span className="text-muted-foreground/50 no-underline">Empty</span>}
      </span>
    );
  }

  // Email type
  if (editing && dataType === SYS_D.EMAIL) {
    return (
      <input
        autoFocus
        type="email"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitAndClose}
        onKeyDown={(e) => { if (e.key === 'Enter') commitAndClose(); if (e.key === 'Escape') setEditing(false); }}
        placeholder="email@example.com"
        className={`${INPUT_CLASS} min-w-[100px] flex-1`}
      />
    );
  }

  if (dataType === SYS_D.EMAIL) {
    return (
      <span
        onClick={() => { setDraft(currentValue ?? ''); setEditing(true); }}
        className="cursor-text text-[11px] text-foreground/80"
      >
        {currentValue || <span className="text-muted-foreground/50">Empty</span>}
      </span>
    );
  }

  // Default: Plain text (click-to-edit)
  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitAndClose}
        onKeyDown={(e) => { if (e.key === 'Enter') commitAndClose(); if (e.key === 'Escape') setEditing(false); }}
        placeholder="Empty"
        className={`${INPUT_CLASS} min-w-[60px] flex-1`}
      />
    );
  }

  return (
    <span
      onClick={() => { setDraft(currentValue ?? ''); setEditing(true); }}
      className="cursor-text text-[11px] text-foreground/80"
    >
      {currentValue || <span className="text-muted-foreground/50">Empty</span>}
    </span>
  );
}

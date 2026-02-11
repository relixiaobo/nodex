/**
 * Polymorphic field value editor — switches UI by data type.
 * Tana-style: click-to-edit text for most types, minimal chrome.
 */
import { useState, useCallback, useMemo } from 'react';
import { SYS_D } from '../../types/index.js';
import { useNodeStore } from '../../stores/node-store';

const INPUT_CLASS =
  'h-5 rounded bg-transparent px-1 text-[11px] text-foreground outline-none border border-transparent focus:border-border/50 focus:bg-background';

interface FieldValueEditorProps {
  dataType: string;
  currentValue?: string;
  onChange: (value: string) => void;
  /** Option nodes for SYS_D12 Options type */
  attrDefId?: string;
}

export function FieldValueEditor({ dataType, currentValue, onChange, attrDefId }: FieldValueEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(currentValue ?? '');

  // Load options for Options field type (JSON string selector to avoid infinite loops)
  const optionsJson = useNodeStore((state) => {
    if (dataType !== SYS_D.OPTIONS || !attrDefId) return '[]';
    const attrDef = state.entities[attrDefId];
    if (!attrDef?.children) return '[]';
    const opts: Array<{ id: string; name: string }> = [];
    for (const childId of attrDef.children) {
      const child = state.entities[childId];
      // Skip type tuples (they have docType=tuple)
      if (child && child.props._docType !== 'tuple' && child.props.name) {
        opts.push({ id: childId, name: child.props.name });
      }
    }
    return JSON.stringify(opts);
  });
  const options: Array<{ id: string; name: string }> = useMemo(
    () => JSON.parse(optionsJson),
    [optionsJson],
  );

  const commitAndClose = useCallback(() => {
    setEditing(false);
    if (draft !== (currentValue ?? '')) {
      onChange(draft);
    }
  }, [draft, currentValue, onChange]);

  // Checkbox type
  if (dataType === SYS_D.CHECKBOX) {
    return (
      <input
        type="checkbox"
        checked={!!currentValue && currentValue !== '0'}
        onChange={(e) => onChange(e.target.checked ? '1' : '0')}
        className="h-3 w-3 rounded border-border/50 accent-primary"
      />
    );
  }

  // Options type — click-to-reveal select
  if (dataType === SYS_D.OPTIONS) {
    if (editing) {
      return (
        <select
          autoFocus
          value={currentValue ?? ''}
          onChange={(e) => { onChange(e.target.value); setEditing(false); }}
          onBlur={() => setEditing(false)}
          className={`${INPUT_CLASS} w-auto min-w-[60px]`}
        >
          <option value="">—</option>
          {options.map((opt) => (
            <option key={opt.id} value={opt.name}>
              {opt.name}
            </option>
          ))}
        </select>
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

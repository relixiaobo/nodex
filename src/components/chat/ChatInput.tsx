import { useEffect, useRef, useState } from 'react';
import { ArrowRight, SquareCheck } from '../../lib/icons.js';

interface ChatInputProps {
  disabled: boolean;
  error?: string;
  onSend(prompt: string): Promise<void>;
  onStop(): void;
}

export function ChatInput({ disabled, error, onSend, onStop }: ChatInputProps) {
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    el.style.height = '0px';
    const nextHeight = Math.min(el.scrollHeight, 112);
    el.style.height = `${Math.max(nextHeight, 40)}px`;
  }, [draft]);

  async function handleSend() {
    const normalized = draft.trim();
    if (!normalized || disabled) return;
    await onSend(normalized);
    setDraft('');
  }

  return (
    <div className="border-t border-border px-3 py-3">
      {error && (
        <div className="mb-2 rounded-lg border border-destructive/15 bg-destructive/5 px-2.5 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={draft}
          disabled={disabled}
          rows={1}
          placeholder={disabled ? 'Responding…' : 'Ask about your notes…'}
          className="min-h-10 flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-base leading-6 text-foreground outline-none transition-colors placeholder:text-foreground-tertiary focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void handleSend();
            }
          }}
        />
        {disabled ? (
          <button
            type="button"
            onClick={onStop}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-foreground/8 px-3 text-xs font-medium text-foreground transition-colors hover:bg-foreground/15"
          >
            <SquareCheck size={14} strokeWidth={1.75} />
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={draft.trim().length === 0}
            className="inline-flex h-10 items-center justify-center rounded-full bg-foreground px-3 text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:bg-foreground/20"
            aria-label="Send message"
          >
            <ArrowRight size={15} strokeWidth={1.75} />
          </button>
        )}
      </div>
      <div className="mt-2 text-xs text-foreground-tertiary">
        {disabled ? '' : '⌘↵ to send'}
      </div>
    </div>
  );
}

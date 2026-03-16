import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Plus, Settings, Square } from '../../lib/icons.js';

interface ChatInputProps {
  disabled: boolean;
  busy?: boolean;
  error?: string;
  onSend(prompt: string): Promise<void>;
  onStop(): void;
  onOpenSettings?(): void;
}

export function ChatInput({ disabled, busy = false, error, onSend, onStop, onOpenSettings }: ChatInputProps) {
  const [draft, setDraft] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputDisabled = disabled || busy;
  const canSend = !inputDisabled && draft.trim().length > 0;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    el.style.height = '0px';
    const nextHeight = Math.min(el.scrollHeight, 160);
    el.style.height = `${Math.max(nextHeight, 24)}px`;
  }, [draft]);

  useEffect(() => {
    if (!menuOpen) return;

    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

  async function handleSend() {
    const normalized = draft.trim();
    if (!normalized || inputDisabled) return;
    await onSend(normalized);
    setDraft('');
  }

  return (
    <div className="px-3 pb-3 pt-1">
      {error && (
        <div className="mb-2 rounded-lg border border-destructive/15 bg-destructive/5 px-2.5 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
      {/* Claude-style unified composer card */}
      <div className="rounded-2xl border border-border bg-background transition-colors focus-within:border-foreground/20">
        {/* Textarea area */}
        <div className="px-3 pt-2.5 pb-1">
          <textarea
            ref={textareaRef}
            value={draft}
            disabled={inputDisabled}
            rows={1}
            placeholder={disabled ? 'Responding…' : busy ? 'Working…' : 'Ask about your notes…'}
            className="w-full resize-none bg-transparent text-base leading-6 text-foreground outline-none placeholder:text-foreground-tertiary disabled:cursor-not-allowed disabled:opacity-60"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void handleSend();
              }
            }}
          />
        </div>
        {/* Bottom action bar */}
        <div className="flex items-center justify-between px-2.5 pb-2">
          <div ref={menuRef} className="relative flex items-center">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-foreground-tertiary transition-colors hover:bg-foreground/4 hover:text-foreground"
              aria-label="More options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <Plus size={16} strokeWidth={1.75} />
            </button>
            {menuOpen && (
              <div className="absolute bottom-full left-0 mb-1 min-w-[180px] rounded-lg border border-border bg-background p-1 shadow-paper">
                {onOpenSettings && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-foreground transition-colors hover:bg-foreground/4"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenSettings();
                    }}
                  >
                    <Settings size={14} strokeWidth={1.6} className="shrink-0 text-foreground-tertiary" />
                    API Settings
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {disabled ? (
              <button
                type="button"
                onClick={onStop}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground/8 text-foreground transition-colors hover:bg-foreground/15"
                aria-label="Stop generating"
              >
                <Square size={12} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={!canSend}
                className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                  canSend
                    ? 'bg-foreground text-background hover:bg-foreground/90'
                    : 'bg-foreground/10 text-foreground-tertiary'
                }`}
                aria-label="Send message"
              >
                <ArrowUp size={15} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Check, ChevronDown, Plus, Settings, Square } from '../../lib/icons.js';

interface ChatInputModel {
  id: string;
  name: string;
  provider: string;
}

interface ChatInputProps {
  disabled: boolean;
  busy?: boolean;
  error?: string;
  currentModel?: ChatInputModel;
  availableModels?: ChatInputModel[];
  onSend(prompt: string): Promise<void>;
  onStop(): void;
  onOpenSettings?(): void;
  onModelChange?(modelId: string, provider: string): void;
}

export function ChatInput({
  disabled,
  busy = false,
  error,
  currentModel,
  availableModels,
  onSend,
  onStop,
  onOpenSettings,
  onModelChange,
}: ChatInputProps) {
  const [draft, setDraft] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const inputDisabled = disabled || busy;
  const canSend = !inputDisabled && draft.trim().length > 0;
  const canSelectModel = !!onModelChange && (availableModels?.length ?? 0) > 0;

  const modelGroups = useMemo(() => {
    const groups = new Map<string, ChatInputModel[]>();
    for (const model of availableModels ?? []) {
      const existing = groups.get(model.provider);
      if (existing) {
        existing.push(model);
      } else {
        groups.set(model.provider, [model]);
      }
    }
    return [...groups.entries()];
  }, [availableModels]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    el.style.height = '0px';
    const nextHeight = Math.min(el.scrollHeight, 160);
    el.style.height = `${Math.max(nextHeight, 24)}px`;
  }, [draft]);

  useEffect(() => {
    if (!menuOpen && !modelMenuOpen) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (modelMenuRef.current?.contains(target)) return;
      setMenuOpen(false);
      setModelMenuOpen(false);
    }

    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [menuOpen, modelMenuOpen]);

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
      <div className="rounded-2xl border border-border bg-background transition-colors focus-within:border-foreground/20">
        <div className="px-3 pb-1 pt-2.5">
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
        <div className="flex items-center justify-between px-2.5 pb-2">
          <div ref={menuRef} className="relative flex items-center">
            <button
              type="button"
              onClick={() => {
                setMenuOpen((open) => !open);
                setModelMenuOpen(false);
              }}
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
          <div className="flex min-w-0 items-center gap-1.5">
            {canSelectModel && (
              <div ref={modelMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setModelMenuOpen((open) => !open);
                    setMenuOpen(false);
                  }}
                  className="inline-flex h-7 max-w-[180px] items-center gap-1 rounded-lg px-2 text-[13px] text-foreground-secondary transition-colors hover:bg-foreground/4 hover:text-foreground"
                  aria-label="Select model"
                  aria-haspopup="menu"
                  aria-expanded={modelMenuOpen}
                >
                  <span className="truncate">{currentModel?.name ?? 'Select model'}</span>
                  <ChevronDown size={12} strokeWidth={1.8} className="shrink-0 text-foreground-tertiary" />
                </button>
                {modelMenuOpen && (
                  <div className="absolute bottom-full right-0 mb-1 min-w-[240px] max-w-[280px] rounded-lg border border-border bg-background p-1 shadow-paper">
                    {modelGroups.map(([provider, models]) => (
                      <div key={provider} className="py-1">
                        <div className="px-2.5 pb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-foreground-quaternary">
                          {provider}
                        </div>
                        {models.map((model) => {
                          const selected = currentModel?.id === model.id && currentModel.provider === model.provider;
                          return (
                            <button
                              key={`${model.provider}:${model.id}`}
                              type="button"
                              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-foreground transition-colors hover:bg-foreground/4"
                              onClick={() => {
                                setModelMenuOpen(false);
                                onModelChange?.(model.id, model.provider);
                              }}
                            >
                              <span className="flex h-3.5 w-3.5 items-center justify-center text-foreground-tertiary">
                                {selected ? <Check size={12} strokeWidth={2.4} /> : null}
                              </span>
                              <span className="truncate">{model.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
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

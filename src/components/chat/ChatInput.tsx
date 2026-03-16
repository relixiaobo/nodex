import { useEffect, useMemo, useRef, useState } from 'react';
import type { ThinkingLevel } from '@mariozechner/pi-ai';
import { ArrowUp, Brain, Check, ChevronDown, Code2, Plus, Settings, Square } from '../../lib/icons.js';

export interface ChatInputModel {
  id: string;
  name: string;
  provider: string;
  reasoning: boolean;
  featured: boolean;
}

interface ChatInputProps {
  disabled: boolean;
  busy?: boolean;
  error?: string;
  currentModel?: ChatInputModel;
  availableModels?: ChatInputModel[];
  thinkingLevel?: ThinkingLevel | null;
  debugEnabled?: boolean;
  debugOpen?: boolean;
  onSend(prompt: string): Promise<void>;
  onStop(): void;
  onOpenSettings?(): void;
  onToggleDebug?(): void;
  onModelChange?(modelId: string, provider: string): void;
  onThinkingChange?(level: ThinkingLevel | null): void;
}

const VENDOR_PREFIXES = ['Claude ', 'Google ', 'Anthropic: ', 'OpenAI: '];

function shortenModelName(name: string): string {
  for (const prefix of VENDOR_PREFIXES) {
    if (name.startsWith(prefix)) return name.slice(prefix.length);
  }
  return name;
}

const THINKING_LEVELS: { value: ThinkingLevel; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Med' },
  { value: 'high', label: 'High' },
];

function ThinkingLevelPicker({ level, onChange }: { level: ThinkingLevel; onChange: (level: ThinkingLevel) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (ref.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  const currentLabel = THINKING_LEVELS.find((l) => l.value === level)?.label ?? 'Med';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium text-foreground-secondary transition-colors hover:bg-foreground/4 hover:text-foreground"
      >
        {currentLabel}
        <ChevronDown size={10} strokeWidth={2} className="text-foreground-tertiary" />
      </button>
      {open && (
        <div className="absolute bottom-full right-0 mb-1 rounded-lg bg-background p-1 shadow-paper">
          {THINKING_LEVELS.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => { onChange(l.value); setOpen(false); }}
              className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-foreground/4 ${
                level === l.value ? 'font-medium text-foreground' : 'text-foreground-secondary'
              }`}
            >
              <span className="flex h-4 w-4 items-center justify-center text-foreground-tertiary">
                {level === l.value ? <Check size={12} strokeWidth={2.4} /> : null}
              </span>
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatInput({
  disabled,
  busy = false,
  error,
  currentModel,
  availableModels,
  thinkingLevel,
  debugEnabled = false,
  debugOpen = false,
  onSend,
  onStop,
  onOpenSettings,
  onToggleDebug,
  onModelChange,
  onThinkingChange,
}: ChatInputProps) {
  const [draft, setDraft] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [moreModelsOpen, setMoreModelsOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const inputDisabled = disabled || busy;
  const canSend = !inputDisabled && draft.trim().length > 0;
  const canSelectModel = !!onModelChange && (availableModels?.length ?? 0) > 0;
  const debugMenuLabel = !debugEnabled
    ? 'Enable AI Debug'
    : debugOpen
      ? 'Hide AI Debug'
      : 'Show AI Debug';

  const { featuredModels, moreModelGroups } = useMemo(() => {
    const featured: ChatInputModel[] = [];
    const moreGroups = new Map<string, ChatInputModel[]>();

    for (const model of availableModels ?? []) {
      if (model.featured) {
        featured.push(model);
      } else {
        const existing = moreGroups.get(model.provider);
        if (existing) {
          existing.push(model);
        } else {
          moreGroups.set(model.provider, [model]);
        }
      }
    }

    return {
      featuredModels: featured,
      moreModelGroups: [...moreGroups.entries()],
    };
  }, [availableModels]);

  const hasMoreModels = moreModelGroups.length > 0;

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

  useEffect(() => {
    if (!modelMenuOpen) {
      setMoreModelsOpen(false);
    }
  }, [modelMenuOpen]);

  async function handleSend() {
    const normalized = draft.trim();
    if (!normalized || inputDisabled) return;
    await onSend(normalized);
    setDraft('');
  }

  function handleSelectModel(model: ChatInputModel) {
    setModelMenuOpen(false);
    onModelChange?.(model.id, model.provider);
  }

  function renderModelItem(model: ChatInputModel) {
    const selected = currentModel?.id === model.id && currentModel.provider === model.provider;
    return (
      <button
        key={`${model.provider}:${model.id}`}
        type="button"
        className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm text-foreground-secondary transition-colors hover:bg-foreground/4 hover:text-foreground"
        onClick={() => handleSelectModel(model)}
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-foreground-tertiary">
          {selected ? <Check size={12} strokeWidth={2.4} /> : null}
        </span>
        <span className="min-w-0 flex-1 truncate">{model.name}</span>
      </button>
    );
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
              <div className="absolute bottom-full left-0 mb-1 min-w-[180px] rounded-lg bg-background p-1 shadow-paper">
                {onToggleDebug && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-foreground-secondary transition-colors hover:bg-foreground/4 hover:text-foreground"
                    onClick={() => {
                      setMenuOpen(false);
                      onToggleDebug();
                    }}
                  >
                    <Code2 size={14} strokeWidth={1.5} className="shrink-0 text-foreground-tertiary" />
                    {debugMenuLabel}
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
                  className="inline-flex h-7 max-w-[220px] items-center gap-1 rounded-lg px-2 text-sm text-foreground-secondary transition-colors hover:bg-foreground/4 hover:text-foreground"
                  aria-label="Select model"
                  aria-haspopup="menu"
                  aria-expanded={modelMenuOpen}
                >
                  <span className="truncate">{currentModel ? shortenModelName(currentModel.name) : 'Select model'}</span>
                  {thinkingLevel && <span className="shrink-0 text-foreground-tertiary">Thinking</span>}
                  <ChevronDown size={12} strokeWidth={1.8} className="shrink-0 text-foreground-tertiary" />
                </button>
                {modelMenuOpen && (
                  <div className="absolute bottom-full right-0 mb-1 max-h-[70vh] min-w-[260px] max-w-[300px] overflow-y-auto rounded-lg bg-background p-1 shadow-paper">
                    {/* Section 1: Models (featured + more) */}
                    <div className="py-1">
                      {featuredModels.map((model) => renderModelItem(model))}
                      {hasMoreModels && (
                        <>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-foreground-secondary transition-colors hover:bg-foreground/4 hover:text-foreground"
                            onClick={() => setMoreModelsOpen((open) => !open)}
                          >
                            <ChevronDown
                              size={12}
                              strokeWidth={1.8}
                              className={`shrink-0 text-foreground-tertiary transition-transform ${moreModelsOpen ? 'rotate-180' : ''}`}
                            />
                            More models
                          </button>
                          {moreModelsOpen && (
                            <div className="max-h-60 overflow-y-auto">
                              {moreModelGroups.map(([provider, models]) => (
                                <div key={provider} className="py-1">
                                  <div className="px-2 pb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-foreground-tertiary">
                                    {provider}
                                  </div>
                                  {models.map((model) => renderModelItem(model))}
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Section 2: Extended thinking */}
                    {currentModel?.reasoning && onThinkingChange && (
                      <>
                        <div className="mx-1 my-1 h-px bg-border-subtle" />
                        <div className="flex items-center gap-2.5 px-2 py-2">
                          <Brain size={14} strokeWidth={1.5} className="shrink-0 text-foreground-tertiary" />
                          <div className="min-w-0 flex-1 text-sm text-foreground-secondary">Thinking</div>
                          {thinkingLevel != null && (
                            <ThinkingLevelPicker level={thinkingLevel} onChange={onThinkingChange} />
                          )}
                          <button
                            type="button"
                            role="switch"
                            aria-checked={thinkingLevel != null}
                            onClick={() => onThinkingChange(thinkingLevel ? null : 'medium')}
                            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${thinkingLevel != null ? 'bg-primary' : 'bg-foreground/15'}`}
                          >
                            <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${thinkingLevel != null ? 'translate-x-4' : ''}`} />
                          </button>
                        </div>
                      </>
                    )}

                    {/* Section 3: API Settings */}
                    {onOpenSettings && (
                      <>
                        <div className="mx-1 my-1 h-px bg-border-subtle" />
                        <button
                          type="button"
                          className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-foreground-secondary transition-colors hover:bg-foreground/4 hover:text-foreground"
                          onClick={() => {
                            setModelMenuOpen(false);
                            onOpenSettings();
                          }}
                        >
                          <Settings size={14} strokeWidth={1.5} className="shrink-0 text-foreground-tertiary" />
                          API Settings
                        </button>
                      </>
                    )}
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

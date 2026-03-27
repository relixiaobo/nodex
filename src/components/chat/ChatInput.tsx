import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { EditorState, type Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { chainCommands, exitCode } from 'prosemirror-commands';
import type { ThinkingLevel } from '@mariozechner/pi-ai';
import { ArrowUp, Brain, Check, ChevronDown, Settings, Square } from '../../lib/icons.js';
import { useUIStore } from '../../stores/ui-store.js';
import { DropdownPanel } from '../ui/DropdownPanel.js';
import { docToMarks, marksToDoc } from '../../lib/pm-doc-utils.js';
import {
  isEditorViewAlive,
  replaceEditorRangeWithInlineRef,
  setEditorPlainTextContent,
} from '../../lib/pm-editor-view.js';
import {
  ReferenceSelector,
  type ReferenceDropdownHandle,
} from '../references/ReferenceSelector.js';
import { useNodeStore } from '../../stores/node-store.js';
import { buildPromptText } from '../../lib/ai-mention-context.js';
import type { InlineRefEntry } from '../../types/index.js';

export interface ChatInputModel {
  id: string;
  name: string;
  provider: string;
  reasoning: boolean;
  featured: boolean;
}

export interface ChatInputHandle {
  setDraft(text: string): void;
  getDraft(): string;
}

interface ChatInputProps {
  disabled: boolean;
  busy?: boolean;
  error?: string;
  /** When true, hide the toolbar row (Plus, model selector, send button). Used by FloatingChatBar for collapsed state. */
  compact?: boolean;
  currentModel?: ChatInputModel;
  availableModels?: ChatInputModel[];
  thinkingLevel?: ThinkingLevel | null;
  onSend(prompt: string): Promise<void>;
  onStop(): void;
  onSteer?(text: string): void;
  onOpenSettings?(): void;
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

// ─── Helpers ───

function getCaretAnchorRect(
  view: EditorView,
  pos: number,
): { left: number; top: number; bottom: number } | undefined {
  try {
    const rect = view.coordsAtPos(pos);
    return { left: rect.left, top: rect.top, bottom: rect.bottom };
  } catch {
    return undefined;
  }
}

// ─── Component ───

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput({
  disabled,
  busy = false,
  error,
  compact = false,
  currentModel,
  availableModels,
  thinkingLevel,
  onSend,
  onStop,
  onSteer,
  onOpenSettings,
  onModelChange,
  onThinkingChange,
}, ref) {
  // Draft state for canSend / canSteer computation
  const [draft, setDraftRaw] = useState('');
  const setChatDraft = useUIStore((s) => s.setChatDraft);
  const setPendingMentions = useUIStore((s) => s.setPendingMentions);

  const setDraft = useCallback((text: string) => {
    setDraftRaw(text);
    setChatDraft(text);
  }, [setChatDraft]);

  // ProseMirror refs
  const editorMountRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const propsRef = useRef({ onSend, onStop, onSteer, disabled, busy });
  propsRef.current = { onSend, onStop, onSteer, disabled, busy };

  // Reference selector state
  const [refOpen, setRefOpen] = useState(false);
  const [refQuery, setRefQuery] = useState('');
  const [refSelectedIndex, setRefSelectedIndex] = useState(0);
  const [refAnchor, setRefAnchor] = useState<{ left: number; top: number; bottom: number } | undefined>();
  const refAtPosRef = useRef(0); // Position of the '@' character in the doc
  const refDropdownRef = useRef<ReferenceDropdownHandle>(null);
  const refActiveRef = useRef(false);
  const hasUserEditedRef = useRef(false);

  // Other UI state
  const [menuOpen, setMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [moreModelsOpen, setMoreModelsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const canSteer = disabled && !!onSteer;
  const inputDisabled = (disabled || busy) && !canSteer;
  const canSend = !inputDisabled && draft.trim().length > 0;
  const hasSteeringDraft = canSteer && draft.trim().length > 0;
  const canSelectModel = !!onModelChange && (availableModels?.length ?? 0) > 0;

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
    return { featuredModels: featured, moreModelGroups: [...moreGroups.entries()] };
  }, [availableModels]);

  const hasMoreModels = moreModelGroups.length > 0;

  // ─── Send / steer ───

  const handleSend = useCallback(() => {
    const view = viewRef.current;
    if (!view || view.isDestroyed) return;

    const { text, inlineRefs } = docToMarks(view.state.doc);
    const prompt = buildPromptText(text, inlineRefs).trim();
    if (!prompt) return;

    const p = propsRef.current;
    if (p.disabled && !!p.onSteer) {
      // Steering mode
      setEditorPlainTextContent(view, '');
      setDraft('');
      p.onSteer!(prompt);
      return;
    }

    if ((p.disabled || p.busy) && !p.onSteer) return;

    // Write mentions to ui-store before sending
    setPendingMentions(inlineRefs);

    setEditorPlainTextContent(view, '');
    setDraft('');
    hasUserEditedRef.current = false;
    void p.onSend(prompt);
  }, [setDraft, setPendingMentions]);

  // ─── Reference selector callbacks ───

  const handleRefSelect = useCallback((nodeId: string) => {
    const view = viewRef.current;
    if (!view || view.isDestroyed) return;

    const targetNode = useNodeStore.getState().getNode(nodeId);
    const displayName = (targetNode?.name ?? '').replace(/<[^>]+>/g, '').trim() || nodeId;

    replaceEditorRangeWithInlineRef(view, refAtPosRef.current, view.state.selection.from, nodeId, displayName);

    setRefOpen(false);
    refActiveRef.current = false;
    view.focus();
  }, []);

  const handleRefClose = useCallback(() => {
    setRefOpen(false);
    refActiveRef.current = false;
  }, []);

  // ─── Trigger detection ───

  const runTriggerDetection = useCallback((view: EditorView, docChanged: boolean) => {
    if (docChanged) hasUserEditedRef.current = true;

    const { from } = view.state.selection;
    const $from = view.state.doc.resolve(from);
    const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\uFFFC');

    const refMatch = textBefore.match(/@([^\s]*)$/);
    if (refMatch && hasUserEditedRef.current && (docChanged || refActiveRef.current)) {
      refActiveRef.current = true;
      const query = refMatch[1];
      const atStart = from - refMatch[0].length;
      refAtPosRef.current = atStart;
      setRefQuery(query);
      setRefSelectedIndex(0);
      setRefAnchor(getCaretAnchorRect(view, from));
      setRefOpen(true);
    } else {
      if (refActiveRef.current) {
        setRefOpen(false);
      }
      refActiveRef.current = false;
    }
  }, []);

  // ─── ProseMirror plugins ───

  const plugins = useMemo<Plugin[]>(() => {
    const isComposing = (): boolean => {
      const dom = viewRef.current?.dom;
      return dom instanceof HTMLElement && dom.dataset.composing === 'true';
    };

    const insertHardBreak: (state: EditorState, dispatch?: EditorView['dispatch']) => boolean =
      chainCommands(exitCode, (state, dispatch) => {
        if (dispatch) {
          const br = state.schema.nodes.hard_break.create();
          dispatch(state.tr.replaceSelectionWith(br).scrollIntoView());
        }
        return true;
      });

    return [
      keymap({
        'Enter': () => {
          if (isComposing()) return false;
          if (refActiveRef.current) {
            // Confirm selection in dropdown
            const item = refDropdownRef.current?.getSelectedItem();
            if (item && item.type === 'existing') {
              handleRefSelect(item.id);
            } else if (item && item.type === 'create') {
              // Not supported in chat — just close
              handleRefClose();
            }
            return true;
          }
          // Send message
          handleSend();
          return true;
        },
        'Shift-Enter': (state, dispatch) => {
          if (isComposing()) return false;
          return insertHardBreak(state, dispatch);
        },
        'Escape': () => {
          if (refActiveRef.current) {
            handleRefClose();
            return true;
          }
          return false;
        },
        'ArrowDown': () => {
          if (refActiveRef.current) {
            setRefSelectedIndex((i) => {
              const count = refDropdownRef.current?.getItemCount() ?? 0;
              return count > 0 ? Math.min(i + 1, count - 1) : 0;
            });
            return true;
          }
          return false;
        },
        'ArrowUp': () => {
          if (refActiveRef.current) {
            setRefSelectedIndex((i) => Math.max(i - 1, 0));
            return true;
          }
          return false;
        },
      }),
    ];
  }, [handleSend, handleRefSelect, handleRefClose]);

  // ─── Editor mount ───

  useLayoutEffect(() => {
    const mount = editorMountRef.current;
    if (!mount) return;

    const state = EditorState.create({
      doc: marksToDoc('', [], []),
      plugins,
    });

    const view = new EditorView(mount, {
      state,
      editable: () => !((propsRef.current.disabled || propsRef.current.busy) && !propsRef.current.onSteer),
      dispatchTransaction(tr) {
        const newState = view.state.apply(tr);

        view.updateState(newState);

        // Sync draft text
        const text = newState.doc.textContent;
        setDraftRaw(text);
        setChatDraft(text);

        // Trigger detection — skip during IME composition (handled in compositionend)
        if (view.dom.dataset.composing !== 'true') {
          runTriggerDetection(view, tr.docChanged);
        }
      },
      handleDOMEvents: {
        compositionstart: (view) => {
          view.dom.dataset.composing = 'true';
          return false;
        },
        compositionend: (view) => {
          delete view.dom.dataset.composing;
          // Run trigger detection after composition ends
          runTriggerDetection(view, true);
          return false;
        },
      },
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [plugins, runTriggerDetection, setChatDraft]);

  // Update editable state when props change
  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.isDestroyed) return;
    // Force EditorView to re-evaluate editable()
    view.setProps({
      editable: () => !((propsRef.current.disabled || propsRef.current.busy) && !propsRef.current.onSteer),
    });
  }, [disabled, busy, onSteer]);

  // ─── Imperative handle ───

  useImperativeHandle(ref, () => ({
    setDraft(text: string) {
      const view = viewRef.current;
      if (view && !view.isDestroyed) {
        setEditorPlainTextContent(view, text);
        setDraft(text);
        requestAnimationFrame(() => {
          if (isEditorViewAlive(viewRef.current)) {
            viewRef.current!.focus();
          }
        });
      }
    },
    getDraft() {
      return draft;
    },
  }), [draft, setDraft]);

  // ─── Menu close on outside click ───

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [menuOpen]);

  useEffect(() => {
    if (!modelMenuOpen) setMoreModelsOpen(false);
  }, [modelMenuOpen]);

  // ─── Placeholder ───

  const placeholder = canSteer ? 'Steer the conversation…' : disabled ? 'Responding…' : busy ? 'Working…' : 'Ask anything…';

  // ─── Model item renderer ───

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
      {/* Error is now shown inline on the assistant message with retry button */}
      <div className="rounded-xl border border-border bg-surface transition-colors focus-within:border-foreground/20">
        <div className={compact ? 'px-3 py-2' : 'px-3 pt-2.5 pb-1'}>
          <div
            ref={editorMountRef}
            style={{ '--chat-placeholder': `"${placeholder}"` } as React.CSSProperties}
            className={`chat-input-editor w-full text-base leading-6 outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[24px] [&_.ProseMirror]:max-h-[160px] [&_.ProseMirror]:overflow-y-auto ${
              compact ? 'text-foreground-tertiary [&_.ProseMirror]:max-h-[24px]' : 'text-foreground'
            } ${inputDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
          />
        </div>
        <div
          className="flex items-center justify-between px-2.5 overflow-hidden transition-all duration-200 ease-out"
          style={{ maxHeight: compact ? 0 : 40, paddingBottom: compact ? 0 : 8, opacity: compact ? 0 : 1 }}
        >
          <div ref={menuRef} className="relative flex items-center">
            {/* Plus button hidden — no menu items yet */}
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
                  className="inline-flex h-7 max-w-[220px] items-center gap-1 rounded-lg px-2 text-sm text-foreground-secondary outline-none transition-colors hover:bg-foreground/4 hover:text-foreground"
                  aria-label="Select model"
                  aria-haspopup="menu"
                  aria-expanded={modelMenuOpen}
                >
                  <span className="truncate">{currentModel ? shortenModelName(currentModel.name) : 'Select model'}</span>
                  {thinkingLevel && <span className="shrink-0 text-foreground-tertiary">Thinking</span>}
                  <ChevronDown size={12} strokeWidth={1.8} className="shrink-0 text-foreground-tertiary" />
                </button>
                {modelMenuOpen && (
                  <DropdownPanel
                    anchorRef={modelMenuRef}
                    onClose={() => setModelMenuOpen(false)}
                    width={300}
                  >
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
                  </DropdownPanel>
                )}
              </div>
            )}
            {disabled && !hasSteeringDraft ? (
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
                onClick={() => handleSend()}
                disabled={!canSend}
                className={`flex h-7 w-7 items-center justify-center rounded-lg outline-none transition-colors ${
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

      {/* Reference selector (portal-based) */}
      <ReferenceSelector
        ref={refDropdownRef}
        open={refOpen}
        onSelect={handleRefSelect}
        query={refQuery}
        selectedIndex={refSelectedIndex}
        currentNodeId=""
        anchor={refAnchor}
      />
    </div>
  );
});

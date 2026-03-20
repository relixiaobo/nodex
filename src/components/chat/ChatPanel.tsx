import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Trash2 } from '../../lib/icons.js';
import { useAgent } from '../../hooks/use-agent.js';
import type { ThinkingLevel } from '@mariozechner/pi-ai';
import { readChatDebugEnabled } from '../../lib/ai-debug.js';
import { getAvailableModelsWithMeta, hasAnyEnabledProvider } from '../../lib/ai-provider-config.js';
import { getAgentForSession, selectChatModel, selectThinkingLevel } from '../../lib/ai-service.js';
import { useNodeStore } from '../../stores/node-store.js';
import { useUIStore } from '../../stores/ui-store.js';
import { SYSTEM_NODE_IDS } from '../../types/index.js';
import { ChatDebugPanel } from './ChatDebugPanel.js';
import { ChatOnboarding } from './ChatOnboarding.js';
import { ChatPanelHeader } from './ChatPanelHeader.js';
import { ChatInput, type ChatInputHandle } from './ChatInput.js';
import { ChatMessage } from './ChatMessage.js';

const AUTO_SCROLL_THRESHOLD = 48;

export interface ChatPanelProps {
  panelId: string;
  sessionId: string;
  /** When true, hide the panel-level header because the surrounding layout already renders it. */
  hideHeader?: boolean;
}

export function shouldStickChatScroll(
  scroller: Pick<HTMLDivElement, 'scrollHeight' | 'scrollTop' | 'clientHeight'>,
  threshold: number = AUTO_SCROLL_THRESHOLD,
): boolean {
  return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= threshold;
}

function getActionErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

export function ChatPanel({ panelId, sessionId, hideHeader }: ChatPanelProps) {
  const pendingChatPrompt = useUIStore((s) => s.pendingChatPrompt);
  const setPendingChatPrompt = useUIStore((s) => s.setPendingChatPrompt);
  const activePanelId = useUIStore((s) => s.activePanelId);
  const isActive = activePanelId === panelId;
  const {
    agent,
    messages,
    toolResults,
    isStreaming,
    error,
    ready,
    debug,
    sendMessage,
    editMessage,
    regenerateMessage,
    switchBranch,
    stopStreaming,
    setSteeringNote,
    hasSteering,
  } = useAgent(getAgentForSession(sessionId), sessionId);
  const settingsVersion = useNodeStore((s) => s._version);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);
  const shouldStickToBottomRef = useRef(true);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel | null>(debug.thinkingLevel);
  const [selectedModelKey, setSelectedModelKey] = useState<{ id: string; provider: string } | null>(null);
  const [pendingMessageActionId, setPendingMessageActionId] = useState<string | null>(null);
  const [steeringNote, setLocalSteeringNote] = useState<string | null>(null);
  const chatBusy = isStreaming || pendingMessageActionId !== null;

  const availableModels = useMemo(() => {
    void settingsVersion;
    return getAvailableModelsWithMeta();
  }, [settingsVersion]);
  const hasAvailableModels = availableModels.length > 0;
  const hasConfiguredProvider = useMemo(() => {
    void settingsVersion;
    return hasAnyEnabledProvider();
  }, [settingsVersion]);

  const currentModel = useMemo(() => {
    const key = selectedModelKey ?? { id: debug.modelId, provider: debug.provider };
    const selectedModel = availableModels.find(
      (model) => model.id === key.id && model.provider === key.provider,
    );
    if (selectedModel) return selectedModel;

    return {
      id: debug.modelId,
      name: agent.state.model?.name ?? '',
      provider: debug.provider,
      reasoning: debug.reasoning,
      featured: false,
    };
  }, [agent.state.model?.name, availableModels, debug.modelId, debug.provider, debug.reasoning, selectedModelKey]);

  useEffect(() => {
    let cancelled = false;

    void readChatDebugEnabled().then((storedDebugEnabled) => {
      if (!cancelled) {
        setDebugEnabled((current) => current || storedDebugEnabled);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setThinkingLevel(debug.thinkingLevel);
    setSelectedModelKey(null);
  }, [debug.thinkingLevel, debug.modelId, debug.provider]);

  useEffect(() => {
    if (debugEnabled) return;
    setDebugOpen(false);
  }, [debugEnabled]);

  const steeringArmedRef = useRef(false);
  useEffect(() => {
    if (steeringArmedRef.current && !hasSteering) {
      setLocalSteeringNote(null);
      steeringArmedRef.current = false;
    }
  }, [hasSteering]);

  useEffect(() => {
    if (!hasConfiguredProvider || !hasAvailableModels) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    if (!shouldStickToBottomRef.current) return;

    requestAnimationFrame(() => {
      scroller.scrollTop = scroller.scrollHeight;
      shouldStickToBottomRef.current = true;
    });
  }, [hasAvailableModels, hasConfiguredProvider, isStreaming, messages, steeringNote]);

  useEffect(() => {
    if (!isActive || !pendingChatPrompt || pendingChatPrompt.panelId !== panelId) return;
    if (!hasConfiguredProvider || !hasAvailableModels || chatBusy || !ready) return;

    setPendingChatPrompt(null);
    void handleSendMessage(pendingChatPrompt.prompt);
  }, [
    chatBusy,
    hasAvailableModels,
    hasConfiguredProvider,
    isActive,
    panelId,
    pendingChatPrompt,
    ready,
    setPendingChatPrompt,
  ]);

  function handleSteerMessage(text: string) {
    const combined = steeringNote ? `${steeringNote}\n${text}` : text;
    setLocalSteeringNote(combined);
    setSteeringNote(combined);
    steeringArmedRef.current = true;
  }

  function handleClearSteering() {
    setLocalSteeringNote(null);
    setSteeringNote(null);
    steeringArmedRef.current = false;
  }

  function handleEditSteerNote() {
    if (steeringNote) {
      chatInputRef.current?.setDraft(steeringNote);
    }
    handleClearSteering();
  }

  async function handleSendMessage(prompt: string) {
    if (pendingMessageActionId) return;

    shouldStickToBottomRef.current = true;
    try {
      await sendMessage(prompt);
    } catch (sendError) {
      toast.error(getActionErrorMessage(sendError, 'Failed to send message'));
    }
  }

  async function runMessageAction(nodeId: string, action: () => Promise<void>) {
    if (pendingMessageActionId) return;

    shouldStickToBottomRef.current = true;
    setPendingMessageActionId(nodeId);
    try {
      await action();
    } finally {
      setPendingMessageActionId((current) => (current === nodeId ? null : current));
    }
  }

  async function handleEditMessage(nodeId: string, newContent: string) {
    await runMessageAction(nodeId, () => editMessage(nodeId, newContent));
  }

  async function handleRegenerateMessage(nodeId: string) {
    await runMessageAction(nodeId, () => regenerateMessage(nodeId));
  }

  function handleOpenSettings() {
    useUIStore.getState().openPanel(SYSTEM_NODE_IDS.SETTINGS);
  }

  async function handleModelChange(modelId: string, provider: string) {
    const prevThinking = thinkingLevel;
    setSelectedModelKey({ id: modelId, provider });
    try {
      const model = await selectChatModel(modelId, provider, agent);
      if (!model.reasoning) {
        setThinkingLevel(null);
      }
    } catch (changeError) {
      setSelectedModelKey(null);
      setThinkingLevel(prevThinking);
      toast.error(getActionErrorMessage(changeError, 'Failed to switch models'));
    }
  }

  async function handleThinkingChange(level: ThinkingLevel | null) {
    setThinkingLevel(level);
    try {
      await selectThinkingLevel(level, agent);
    } catch (thinkingError) {
      setThinkingLevel(debug.thinkingLevel);
      toast.error(getActionErrorMessage(thinkingError, 'Failed to change thinking level'));
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      {!hideHeader && (
        <ChatPanelHeader
          sessionId={sessionId}
          onClose={(e) => {
            e.stopPropagation();
            useUIStore.getState().closePanel(panelId);
          }}
        />
      )}

      <div className="relative flex flex-1 flex-col overflow-hidden">
        {debugEnabled && (
          <button
            type="button"
            onClick={() => setDebugOpen((v) => !v)}
            className={`absolute right-3 top-2 z-10 inline-flex h-7 min-w-8 items-center justify-center rounded-full px-2 font-mono text-[11px] transition-colors ${
              debugOpen
                ? 'bg-foreground/8 text-foreground'
                : 'text-foreground-tertiary hover:bg-foreground/4 hover:text-foreground'
            }`}
            aria-label={debugOpen ? 'Hide debug panel' : 'Show debug panel'}
            aria-pressed={debugOpen}
          >
            {'</>'}
          </button>
        )}

        {!ready ? (
          <div className="flex flex-1 items-center justify-center text-sm text-foreground-tertiary">
            Loading chat…
          </div>
        ) : !hasConfiguredProvider ? (
          <div className="flex flex-1 overflow-hidden">
            <ChatOnboarding panelId={panelId} />
            {debugEnabled && debugOpen && (
              <div className="w-1/2 shrink-0 overflow-y-auto overflow-x-hidden border-l border-border px-3 py-3">
                <ChatDebugPanel debug={debug} />
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            <div className="flex flex-1 flex-col overflow-hidden">
              <div
                ref={scrollRef}
                className="flex flex-1 flex-col overflow-y-auto px-4 py-4"
                onScroll={() => {
                  const scroller = scrollRef.current;
                  if (!scroller) return;
                  shouldStickToBottomRef.current = shouldStickChatScroll(scroller);
                }}
              >
                {messages.length === 0 ? (
                  <div className="flex h-full min-h-40 flex-col items-center justify-center gap-4 px-6">
                    <div className="text-center text-sm text-foreground-tertiary">
                      Ask about your notes, clips, or the page you&apos;re reading.
                    </div>
                    <div className="flex w-full max-w-[260px] flex-col gap-2">
                      {[
                        'Summarize this page',
                        'Organize my notes from today',
                        'What did I clip this week?',
                      ].map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => void handleSendMessage(suggestion)}
                          className="rounded-lg border border-border px-3 py-2 text-left text-sm text-foreground-secondary transition-colors hover:bg-foreground/4 hover:text-foreground"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((entry, index) => (
                    <ChatMessage
                      key={entry.nodeId ?? `stream-${entry.message.timestamp}-${index}`}
                      entry={entry}
                      toolResults={toolResults}
                      streaming={isStreaming && index === messages.length - 1 && entry.message.role === 'assistant'}
                      grouped={index > 0 && messages[index - 1].message.role === entry.message.role}
                      busy={chatBusy}
                      isLastInTurn={index === messages.length - 1 || messages[index + 1].message.role !== entry.message.role}
                      onEdit={handleEditMessage}
                      onRegenerate={handleRegenerateMessage}
                      onSwitchBranch={switchBranch}
                    />
                  ))
                )}
              </div>
              <div className="relative">
                {steeringNote && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-full px-4 pb-2">
                    <div className="group/steer flex justify-end">
                      <div className="pointer-events-auto flex max-w-[88%] flex-col gap-1 items-end">
                        <div className="flex items-center gap-0.5 justify-end opacity-0 transition-opacity group-hover/steer:opacity-100">
                          <button
                            type="button"
                            onClick={handleEditSteerNote}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-foreground-tertiary transition-colors hover:bg-foreground/4 hover:text-foreground"
                            aria-label="Edit queued message"
                          >
                            <Pencil size={14} strokeWidth={1.8} />
                          </button>
                          <button
                            type="button"
                            onClick={handleClearSteering}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-foreground-tertiary transition-colors hover:bg-foreground/4 hover:text-foreground"
                            aria-label="Cancel queued message"
                          >
                            <Trash2 size={14} strokeWidth={1.8} />
                          </button>
                        </div>
                        <div className="steer-note-pending max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-background px-3 py-2 text-base leading-6 text-foreground">
                          {steeringNote}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <ChatInput
                  ref={chatInputRef}
                  disabled={isStreaming}
                  busy={pendingMessageActionId !== null}
                  error={error}
                  currentModel={currentModel}
                  availableModels={availableModels}
                  thinkingLevel={thinkingLevel}
                  onSend={handleSendMessage}
                  onStop={stopStreaming}
                  onSteer={handleSteerMessage}
                  onOpenSettings={handleOpenSettings}
                  onModelChange={handleModelChange}
                  onThinkingChange={handleThinkingChange}
                />
              </div>
            </div>
            {debugEnabled && debugOpen && (
              <div className="w-1/2 shrink-0 overflow-y-auto overflow-x-hidden border-l border-border px-3 py-3">
                <ChatDebugPanel debug={debug} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

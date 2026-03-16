import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Sparkles, X } from '../../lib/icons.js';
import { useAgent } from '../../hooks/use-agent.js';
import { readChatDebugEnabled, writeChatDebugEnabled } from '../../lib/ai-debug.js';
import { getAvailableModels } from '../../lib/ai-provider-config.js';
import { getAgentForSession, selectChatModel } from '../../lib/ai-service.js';
import { useNodeStore } from '../../stores/node-store.js';
import { useUIStore } from '../../stores/ui-store.js';
import { SYSTEM_NODE_IDS } from '../../types/index.js';
import { ChatDebugPanel } from './ChatDebugPanel.js';
import { ChatInput } from './ChatInput.js';
import { ChatMessage } from './ChatMessage.js';

const AUTO_SCROLL_THRESHOLD = 48;

export interface ChatPanelProps {
  panelId: string;
  sessionId: string;
  /** When true, hide the full header (title + close). Action buttons remain visible. */
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
  } = useAgent(getAgentForSession(sessionId), sessionId);
  const settingsVersion = useNodeStore((s) => s._version);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const debugTapResetRef = useRef<number | null>(null);
  const debugTapCountRef = useRef(0);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [pendingMessageActionId, setPendingMessageActionId] = useState<string | null>(null);
  const chatBusy = isStreaming || pendingMessageActionId !== null;
  const debugActionLabel = !debugEnabled
    ? 'Enable AI Debug'
    : debugOpen
      ? 'Hide AI Debug'
      : 'Show AI Debug';

  const availableModels = useMemo(() => {
    void settingsVersion;
    return getAvailableModels();
  }, [settingsVersion]);
  const hasAvailableModels = availableModels.length > 0;

  const currentModel = useMemo(() => {
    const selectedModel = availableModels.find(
      (model) => model.id === debug.modelId && model.provider === debug.provider,
    );
    if (selectedModel) {
      return {
        id: selectedModel.id,
        name: selectedModel.name,
        provider: selectedModel.provider,
      };
    }

    return {
      id: debug.modelId,
      name: agent.state.model.name,
      provider: debug.provider,
    };
  }, [agent.state.model.name, availableModels, debug.modelId, debug.provider]);

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
    return () => {
      if (debugTapResetRef.current != null) {
        window.clearTimeout(debugTapResetRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (debugEnabled) return;
    setDebugOpen(false);
  }, [debugEnabled]);

  useEffect(() => {
    if (!hasAvailableModels) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    if (!shouldStickToBottomRef.current) return;

    requestAnimationFrame(() => {
      scroller.scrollTop = scroller.scrollHeight;
      shouldStickToBottomRef.current = true;
    });
  }, [messages, isStreaming, hasAvailableModels]);

  useEffect(() => {
    if (!isActive || !pendingChatPrompt || pendingChatPrompt.panelId !== panelId) return;
    if (!hasAvailableModels || chatBusy || !ready) return;

    setPendingChatPrompt(null);
    void handleSendMessage(pendingChatPrompt.prompt);
  }, [
    chatBusy,
    hasAvailableModels,
    isActive,
    panelId,
    pendingChatPrompt,
    ready,
    setPendingChatPrompt,
  ]);

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

  function handleHeaderTitleClick() {
    if (hasAvailableModels || debugEnabled) return;

    debugTapCountRef.current += 1;

    if (debugTapResetRef.current != null) {
      window.clearTimeout(debugTapResetRef.current);
      debugTapResetRef.current = null;
    }

    if (debugTapCountRef.current >= 5) {
      debugTapCountRef.current = 0;
      setDebugEnabled(true);
      setDebugOpen(true);
      toast.success('Debug mode enabled');
      void writeChatDebugEnabled(true);
      return;
    }

    debugTapResetRef.current = window.setTimeout(() => {
      debugTapCountRef.current = 0;
    }, 1200);
  }

  function handleOpenSettings() {
    useUIStore.getState().openPanel(SYSTEM_NODE_IDS.SETTINGS);
  }

  function handleToggleDebug() {
    if (!debugEnabled) {
      setDebugEnabled(true);
      setDebugOpen(true);
      toast.success('AI Debug enabled');
      void writeChatDebugEnabled(true);
      return;
    }

    setDebugOpen((value) => !value);
  }

  async function handleModelChange(modelId: string, provider: string) {
    try {
      await selectChatModel(modelId, provider, agent);
    } catch (changeError) {
      toast.error(getActionErrorMessage(changeError, 'Failed to switch models'));
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      <div className={`flex items-center px-3 ${hideHeader ? 'h-8 justify-end' : 'h-12 justify-between border-b border-border'}`}>
        {!hideHeader && (
          <button
            type="button"
            onClick={handleHeaderTitleClick}
            className="flex items-center gap-2 text-sm font-medium text-foreground"
          >
            <Sparkles size={14} strokeWidth={1.75} className="text-foreground-tertiary" />
            Chat
          </button>
        )}
        <div className="flex items-center gap-1">
          {debugEnabled && (
            <button
              type="button"
              onClick={handleToggleDebug}
              className={`inline-flex h-7 min-w-8 items-center justify-center rounded-full px-2 font-mono text-[11px] transition-colors ${
                debugOpen
                  ? 'bg-foreground/8 text-foreground'
                  : 'text-foreground-tertiary hover:bg-foreground/4 hover:text-foreground'
              }`}
              aria-label={debugOpen ? 'Hide chat debug panel' : 'Show chat debug panel'}
              aria-pressed={debugOpen}
            >
              {'</>'}
            </button>
          )}
          {!hideHeader && (
            <button
              type="button"
              onClick={() => useUIStore.getState().closePanel(panelId)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-foreground-tertiary transition-colors hover:bg-foreground/4 hover:text-foreground"
              aria-label="Close chat"
            >
              <X size={15} strokeWidth={1.6} />
            </button>
          )}
        </div>
      </div>

      {!ready ? (
        <div className="flex flex-1 items-center justify-center text-sm text-foreground-tertiary">
          Loading chat…
        </div>
      ) : !hasAvailableModels ? (
        <div className="flex flex-1 flex-col justify-center gap-4 px-6">
          {debugEnabled && debugOpen && (
            <div className="mx-auto w-full max-w-[560px]">
              <ChatDebugPanel debug={debug} />
            </div>
          )}
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="max-w-[260px] text-sm text-foreground-tertiary">
              Configure an AI provider to start chatting
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleOpenSettings}
                className="inline-flex h-9 items-center rounded-full border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-foreground/4"
              >
                Open Settings
              </button>
              <button
                type="button"
                onClick={handleToggleDebug}
                className="inline-flex h-9 items-center rounded-full border border-border px-4 text-sm font-medium text-foreground-secondary transition-colors hover:bg-foreground/4 hover:text-foreground"
              >
                {debugActionLabel}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div
            ref={scrollRef}
            className="flex flex-1 flex-col overflow-y-auto px-4 py-4"
            onScroll={() => {
              const scroller = scrollRef.current;
              if (!scroller) return;
              shouldStickToBottomRef.current = shouldStickChatScroll(scroller);
            }}
          >
            {debugEnabled && debugOpen && (
              <div className="mb-4">
                <ChatDebugPanel debug={debug} />
              </div>
            )}
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
          <ChatInput
            disabled={isStreaming}
            busy={pendingMessageActionId !== null}
            error={error}
            currentModel={currentModel}
            availableModels={availableModels}
            debugEnabled={debugEnabled}
            debugOpen={debugOpen}
            onSend={handleSendMessage}
            onStop={stopStreaming}
            onOpenSettings={handleOpenSettings}
            onToggleDebug={handleToggleDebug}
            onModelChange={handleModelChange}
          />
        </>
      )}
    </div>
  );
}

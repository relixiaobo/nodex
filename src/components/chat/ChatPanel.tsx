import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, Sparkles, X } from '../../lib/icons.js';
import { useAgent } from '../../hooks/use-agent.js';
import { readChatDebugEnabled, writeChatDebugEnabled } from '../../lib/ai-debug.js';
import { clearApiKey, getAISettings, getAgentForSession, setApiKey } from '../../lib/ai-service.js';
import { useUIStore } from '../../stores/ui-store.js';
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

function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 12) return `${apiKey.slice(0, 7)}••••`;
  return `${apiKey.slice(0, 7)}••••${apiKey.slice(-4)}`;
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const debugTapResetRef = useRef<number | null>(null);
  const debugTapCountRef = useRef(0);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [savedKeyMask, setSavedKeyMask] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [pendingMessageActionId, setPendingMessageActionId] = useState<string | null>(null);
  const chatBusy = isStreaming || pendingMessageActionId !== null;

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      setLoadingSettings(true);
      const [settings, storedDebugEnabled] = await Promise.all([
        getAISettings(),
        readChatDebugEnabled(),
      ]);
      if (cancelled) return;

      if (settings?.apiKey) {
        setSavedKeyMask(maskApiKey(settings.apiKey));
        setShowSettings(false);
      } else {
        setSavedKeyMask(null);
        setShowSettings(true);
      }
      setDebugEnabled(storedDebugEnabled);
      setLoadingSettings(false);
    }

    void loadSettings();

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
    if (showSettings) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    if (!shouldStickToBottomRef.current) return;

    requestAnimationFrame(() => {
      scroller.scrollTop = scroller.scrollHeight;
      shouldStickToBottomRef.current = true;
    });
  }, [messages, isStreaming, showSettings]);

  useEffect(() => {
    if (!isActive || !pendingChatPrompt || pendingChatPrompt.panelId !== panelId) return;
    if (loadingSettings || showSettings || chatBusy || !ready) return;

    setPendingChatPrompt(null);
    void handleSendMessage(pendingChatPrompt.prompt);
  }, [
    isActive,
    panelId,
    pendingChatPrompt,
    loadingSettings,
    showSettings,
    chatBusy,
    ready,
    setPendingChatPrompt,
  ]);

  async function handleSaveKey() {
    const normalized = draftKey.trim();
    if (!normalized.startsWith('sk-ant-')) {
      setFormError('Anthropic API key must start with sk-ant-.');
      return;
    }

    setSavingKey(true);
    setFormError(null);
    try {
      await setApiKey(normalized);
      setSavedKeyMask(maskApiKey(normalized));
      setDraftKey('');
      setShowSettings(false);
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSavingKey(false);
    }
  }

  async function handleClearKey() {
    await clearApiKey();
    setSavedKeyMask(null);
    setDraftKey('');
    setFormError(null);
    setShowSettings(true);
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

  function handleHeaderTitleClick() {
    if (!showSettings || debugEnabled) return;

    debugTapCountRef.current += 1;

    if (debugTapResetRef.current != null) {
      window.clearTimeout(debugTapResetRef.current);
      debugTapResetRef.current = null;
    }

    if (debugTapCountRef.current >= 5) {
      debugTapCountRef.current = 0;
      setDebugEnabled(true);
      toast.success('Debug mode enabled');
      void writeChatDebugEnabled(true);
      return;
    }

    debugTapResetRef.current = window.setTimeout(() => {
      debugTapCountRef.current = 0;
    }, 1200);
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
          {debugEnabled && !showSettings && (
            <button
              type="button"
              onClick={() => setDebugOpen((value) => !value)}
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

      {loadingSettings || !ready ? (
        <div className="flex flex-1 items-center justify-center text-sm text-foreground-tertiary">
          Loading chat…
        </div>
      ) : showSettings ? (
        <div className="flex flex-1 flex-col justify-center px-5 py-6">
          <div className="rounded-lg border border-border bg-foreground/4 p-4">
            <div className="mb-4">
              <div className="text-xs font-medium uppercase tracking-[0.08em] text-foreground-tertiary">
                Provider
              </div>
              <div className="mt-1 text-sm text-foreground">Anthropic</div>
            </div>

            {savedKeyMask && (
              <div className="mb-4 rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground-secondary">
                Saved key: <span className="font-medium text-foreground">{savedKeyMask}</span>
              </div>
            )}

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-foreground-tertiary">
                API key
              </span>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={draftKey}
                onChange={(event) => setDraftKey(event.target.value)}
                placeholder="sk-ant-..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-foreground-tertiary focus:border-primary"
              />
            </label>

            {formError && (
              <div className="mt-3 text-xs text-destructive">{formError}</div>
            )}

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleSaveKey()}
                disabled={savingKey || draftKey.trim().length === 0}
                className="inline-flex h-9 items-center rounded-full bg-foreground px-3 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:bg-foreground/20"
              >
                {savingKey ? 'Saving…' : 'Save'}
              </button>
              {savedKeyMask && (
                <button
                  type="button"
                  onClick={() => void handleClearKey()}
                  className="inline-flex h-9 items-center rounded-full border border-border px-3 text-sm text-foreground-secondary transition-colors hover:bg-foreground/4 hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>

            <a
              href="https://console.anthropic.com/"
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-1 text-xs text-foreground-tertiary transition-colors hover:text-foreground"
            >
              Get your key at console.anthropic.com
              <ExternalLink size={11} strokeWidth={1.7} />
            </a>
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
                  Ask about your notes, clips, or the page you're reading.
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
            onSend={handleSendMessage}
            onStop={stopStreaming}
            onOpenSettings={() => {
              setFormError(null);
              setShowSettings(true);
            }}
          />
        </>
      )}
    </div>
  );
}

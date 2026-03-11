import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Settings, Sparkles, X } from '../../lib/icons.js';
import { useAgent } from '../../hooks/use-agent.js';
import { clearApiKey, getAISettings, setApiKey } from '../../lib/ai-service.js';
import { useUIStore } from '../../stores/ui-store.js';
import { ChatInput } from './ChatInput.js';
import { ChatMessage } from './ChatMessage.js';

const WIDE_LAYOUT_MIN_WIDTH = 500;

function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 12) return `${apiKey.slice(0, 7)}••••`;
  return `${apiKey.slice(0, 7)}••••${apiKey.slice(-4)}`;
}

export function ChatDrawer() {
  const closeChat = useUIStore((s) => s.closeChat);
  const { messages, isStreaming, error, sendMessage, stopStreaming } = useAgent();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isWideLayout, setIsWideLayout] = useState(() => window.innerWidth > WIDE_LAYOUT_MIN_WIDTH);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [savedKeyMask, setSavedKeyMask] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState(false);

  useEffect(() => {
    function handleResize() {
      setIsWideLayout(window.innerWidth > WIDE_LAYOUT_MIN_WIDTH);
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      setLoadingSettings(true);
      const settings = await getAISettings();
      if (cancelled) return;

      if (settings?.apiKey) {
        setSavedKeyMask(maskApiKey(settings.apiKey));
        setShowSettings(false);
      } else {
        setSavedKeyMask(null);
        setShowSettings(true);
      }
      setLoadingSettings(false);
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (showSettings) return;
    const scroller = scrollRef.current;
    if (!scroller) return;

    requestAnimationFrame(() => {
      scroller.scrollTop = scroller.scrollHeight;
    });
  }, [messages, isStreaming, showSettings]);

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

  const containerClassName = useMemo(() => {
    if (isWideLayout) {
      return 'relative z-[60] flex h-full w-[min(40vw,420px)] min-w-[320px] shrink-0 flex-col border-l border-border bg-background';
    }

    return 'absolute inset-x-0 bottom-0 z-[60] flex h-[min(68vh,560px)] flex-col rounded-t-[20px] border-t border-border bg-background shadow-paper';
  }, [isWideLayout]);

  return (
    <aside className={containerClassName}>
      <div className="flex h-12 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles size={14} strokeWidth={1.75} />
          </span>
          Chat
        </div>
        <div className="flex items-center gap-1">
          {!loadingSettings && savedKeyMask && (
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setShowSettings((value) => !value);
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-foreground-tertiary transition-colors hover:bg-foreground/4 hover:text-foreground"
              aria-label="Chat settings"
            >
              <Settings size={15} strokeWidth={1.6} />
            </button>
          )}
          <button
            type="button"
            onClick={closeChat}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-foreground-tertiary transition-colors hover:bg-foreground/4 hover:text-foreground"
            aria-label="Close chat"
          >
            <X size={15} strokeWidth={1.6} />
          </button>
        </div>
      </div>

      {loadingSettings ? (
        <div className="flex flex-1 items-center justify-center text-sm text-foreground-tertiary">
          Loading chat…
        </div>
      ) : showSettings ? (
        <div className="flex flex-1 flex-col justify-center px-5 py-6">
          <div className="rounded-2xl border border-border bg-foreground/[0.02] p-4">
            <div className="mb-4">
              <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-foreground-tertiary">
                Provider
              </div>
              <div className="mt-1 text-sm text-foreground">Anthropic</div>
            </div>

            {savedKeyMask && (
              <div className="mb-4 rounded-xl border border-border bg-background px-3 py-2 text-[12px] text-foreground-secondary">
                Saved key: <span className="font-medium text-foreground">{savedKeyMask}</span>
              </div>
            )}

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-[0.08em] text-foreground-tertiary">
                API key
              </span>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={draftKey}
                onChange={(event) => setDraftKey(event.target.value)}
                placeholder="sk-ant-..."
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-foreground-tertiary focus:border-primary"
              />
            </label>

            {formError && (
              <div className="mt-3 text-[12px] text-destructive">{formError}</div>
            )}

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleSaveKey()}
                disabled={savingKey || draftKey.trim().length === 0}
                className="inline-flex h-9 items-center rounded-xl bg-foreground px-3 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:bg-foreground/20"
              >
                {savingKey ? 'Saving…' : 'Save'}
              </button>
              {savedKeyMask && (
                <button
                  type="button"
                  onClick={() => void handleClearKey()}
                  className="inline-flex h-9 items-center rounded-xl border border-border px-3 text-sm text-foreground-secondary transition-colors hover:bg-foreground/4 hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>

            <a
              href="https://console.anthropic.com/"
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-1 text-[12px] text-foreground-tertiary transition-colors hover:text-foreground"
            >
              Get your key at console.anthropic.com
              <ExternalLink size={11} strokeWidth={1.7} />
            </a>
          </div>
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <div className="flex h-full min-h-40 items-center justify-center">
                <div className="max-w-[240px] text-center text-sm text-foreground-tertiary">
                  Ask about your notes, clips, or the page you are reading. Phase 0 is text-only and ephemeral.
                </div>
              </div>
            ) : (
              messages.map((message, index) => (
                <ChatMessage
                  key={`${message.role}-${message.timestamp}-${index}`}
                  message={message}
                  streaming={isStreaming && index === messages.length - 1 && message.role === 'assistant'}
                />
              ))
            )}
          </div>
          <ChatInput
            disabled={isStreaming}
            error={error}
            onSend={sendMessage}
            onStop={stopStreaming}
          />
        </>
      )}
    </aside>
  );
}

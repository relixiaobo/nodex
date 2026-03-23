import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, MessageSquare } from '../../lib/icons.js';
import { openChatWithPrompt, openNewChatDrawer } from '../../lib/chat-panel-actions.js';
import { useUIStore } from '../../stores/ui-store.js';

export function FloatingChatBar() {
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const currentChatSessionId = useUIStore((s) => s.currentChatSessionId);
  const openExistingDrawer = useUIStore((s) => s.openChatDrawer);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea when focused
  useEffect(() => {
    const el = textareaRef.current;
    if (!el || !focused) return;
    el.style.height = '0px';
    const nextHeight = Math.min(el.scrollHeight, 120);
    el.style.height = `${Math.max(nextHeight, 24)}px`;
  }, [draft, focused]);

  // Close on click outside
  useEffect(() => {
    if (!focused) return;
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current?.contains(e.target as Node)) return;
      setFocused(false);
    }
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [focused]);

  const handleSend = useCallback(async () => {
    const prompt = draft.trim();
    if (!prompt) return;
    setDraft('');
    setFocused(false);
    await openChatWithPrompt(prompt);
  }, [draft]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void handleSend();
    }
    if (e.key === 'Escape') {
      setFocused(false);
      textareaRef.current?.blur();
    }
  }, [handleSend]);

  const handleFocus = useCallback(() => {
    setFocused(true);
  }, []);

  const canSend = draft.trim().length > 0;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20" data-testid="floating-chat-bar">
      {/* Gradient fade */}
      <div className="h-8 bg-gradient-to-t from-background to-transparent" />

      <div ref={containerRef} className="pointer-events-auto bg-background px-3 pb-3">
        <div className="rounded-xl border border-border bg-background transition-colors focus-within:border-foreground/20">
          {focused ? (
            /* ── Focused: multi-line textarea + send button ── */
            <>
              <div className="px-3 pb-1 pt-2.5">
                <textarea
                  ref={textareaRef}
                  value={draft}
                  rows={1}
                  placeholder="Ask about your notes..."
                  className="w-full resize-none bg-transparent text-[15px] leading-6 text-foreground outline-none placeholder:text-foreground-tertiary"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoFocus
                />
              </div>
              <div className="flex items-center justify-between px-2.5 pb-2">
                <button
                  type="button"
                  onClick={() => {
                    if (currentChatSessionId) {
                      openExistingDrawer();
                    } else {
                      void openNewChatDrawer();
                    }
                    setFocused(false);
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-foreground-tertiary transition-colors hover:bg-foreground/4 hover:text-foreground"
                  aria-label="Open chat"
                >
                  <MessageSquare size={15} strokeWidth={1.7} />
                </button>
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={!canSend}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                    canSend
                      ? 'bg-foreground text-background hover:bg-foreground/90'
                      : 'text-foreground-quaternary'
                  }`}
                  aria-label="Send"
                >
                  <ArrowUp size={16} strokeWidth={2} />
                </button>
              </div>
            </>
          ) : (
            /* ── Unfocused: single-line compact ── */
            <button
              type="button"
              onClick={() => {
                setFocused(true);
                requestAnimationFrame(() => textareaRef.current?.focus());
              }}
              className="flex h-11 w-full items-center gap-2 px-3 text-[15px] text-foreground-tertiary"
            >
              <MessageSquare size={15} strokeWidth={1.7} className="shrink-0" />
              <span>{draft || 'Ask about your notes...'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

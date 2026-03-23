import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ThinkingLevel } from '@mariozechner/pi-ai';
import { ChatInput, type ChatInputHandle } from '../chat/ChatInput.js';
import { openChatWithPrompt } from '../../lib/chat-panel-actions.js';
import { getAvailableModelsWithMeta } from '../../lib/ai-provider-config.js';
import { useNodeStore } from '../../stores/node-store.js';
import { useUIStore } from '../../stores/ui-store.js';
import { SYSTEM_NODE_IDS } from '../../types/index.js';

export function FloatingChatBar() {
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);

  // Model data
  const settingsVersion = useNodeStore((s) => s._version);
  const availableModels = useMemo(() => {
    void settingsVersion;
    return getAvailableModelsWithMeta();
  }, [settingsVersion]);
  const [selectedModelKey, setSelectedModelKey] = useState<{ id: string; provider: string } | null>(null);
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel | null>(null);
  const currentModel = useMemo(() => {
    if (!selectedModelKey) return availableModels[0] ?? undefined;
    return availableModels.find((m) => m.id === selectedModelKey.id && m.provider === selectedModelKey.provider) ?? availableModels[0] ?? undefined;
  }, [availableModels, selectedModelKey]);

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

  // Close on Escape
  useEffect(() => {
    if (!focused) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setFocused(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [focused]);

  const handleSend = useCallback(async (prompt: string) => {
    setFocused(false);
    await openChatWithPrompt(prompt);
  }, []);

  const handleModelChange = useCallback((modelId: string, provider: string) => {
    setSelectedModelKey({ id: modelId, provider });
  }, []);

  const handleThinkingChange = useCallback((level: ThinkingLevel | null) => {
    setThinkingLevel(level);
  }, []);

  const handleOpenSettings = useCallback(() => {
    setFocused(false);
    useUIStore.getState().navigateToNode(SYSTEM_NODE_IDS.SETTINGS);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20" data-testid="floating-chat-bar">
      <div className="h-8 bg-gradient-to-t from-background to-transparent" />

      <div ref={containerRef} className="pointer-events-auto bg-background">
        {focused ? (
          /* ── Focused: ChatInput (it has its own px-3 pb-3 pt-1 + rounded-xl border) ── */
          <ChatInput
            ref={chatInputRef}
            disabled={false}
            currentModel={currentModel}
            availableModels={availableModels}
            thinkingLevel={thinkingLevel}
            onSend={handleSend}
            onStop={() => {}}
            onModelChange={handleModelChange}
            onThinkingChange={handleThinkingChange}
            onOpenSettings={handleOpenSettings}
          />
        ) : (
          /* ── Unfocused: match ChatInput's outer padding (px-3 pb-3) ── */
          <div className="px-3 pb-3">
            <button
              type="button"
              onClick={() => setFocused(true)}
              className="flex h-11 w-full items-center rounded-xl border border-border bg-background px-3 text-[15px] text-foreground-tertiary transition-colors hover:border-foreground/20"
            >
              Ask about your notes...
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

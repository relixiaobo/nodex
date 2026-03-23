import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ThinkingLevel } from '@mariozechner/pi-ai';
import { ChatInput, type ChatInputHandle } from '../chat/ChatInput.js';
import { openChatWithPrompt } from '../../lib/chat-panel-actions.js';
import { getAvailableModelsWithMeta } from '../../lib/ai-provider-config.js';
import { useNodeStore } from '../../stores/node-store.js';
import { useUIStore } from '../../stores/ui-store.js';
import { SYSTEM_NODE_IDS } from '../../types/index.js';

const noop = () => {};

export function FloatingChatBar() {
  const [focused, setFocused] = useState(false);
  const [selectedModelKey, setSelectedModelKey] = useState<{ id: string; provider: string } | null>(null);
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);

  const settingsVersion = useNodeStore((s) => s._version);
  const availableModels = useMemo(() => {
    void settingsVersion;
    return getAvailableModelsWithMeta();
  }, [settingsVersion]);

  const currentModel = useMemo(() => {
    if (!selectedModelKey) return availableModels[0];
    return availableModels.find((m) => m.id === selectedModelKey.id && m.provider === selectedModelKey.provider) ?? availableModels[0];
  }, [availableModels, selectedModelKey]);

  // Unfocus when focus leaves the container or user interacts outside
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onFocusOut(e: FocusEvent) {
      if (el!.contains(e.relatedTarget as Node)) return;
      setFocused(false);
    }
    el.addEventListener('focusout', onFocusOut);
    return () => el.removeEventListener('focusout', onFocusOut);
  }, []);

  useEffect(() => {
    if (!focused) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current?.contains(e.target as Node)) return;
      setFocused(false);
    }
    function onScroll() {
      setFocused(false);
    }
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [focused]);

  const handleSend = useCallback(async (prompt: string) => {
    setFocused(false);
    await openChatWithPrompt(prompt);
  }, []);

  const handleOpenSettings = useCallback(() => {
    setFocused(false);
    useUIStore.getState().navigateToNode(SYSTEM_NODE_IDS.SETTINGS);
  }, []);

  const handleOpenDrawer = useCallback(() => {
    const draft = chatInputRef.current?.getDraft() ?? '';
    setFocused(false);
    if (draft.trim()) {
      void openChatWithPrompt(draft);
    } else {
      useUIStore.getState().openChatDrawer();
    }
  }, []);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20" data-testid="floating-chat-bar">
      <div className="h-8 bg-gradient-to-t from-background to-transparent" />

      <div
        ref={containerRef}
        className="pointer-events-auto bg-background"
        onFocus={() => setFocused(true)}
      >
        {/* Handle bar — animated reveal, click opens drawer */}
        <div className={`overflow-hidden transition-all duration-200 ease-out ${focused ? 'max-h-8 opacity-100' : 'max-h-0 opacity-0'}`}>
          <button type="button" onClick={handleOpenDrawer} className="group/handle flex w-full items-center justify-center py-1.5" aria-label="Open chat">
            <span className="h-1 w-8 rounded-full bg-foreground/15 transition-colors group-hover/handle:bg-foreground/40" />
          </button>
        </div>

        <ChatInput
          ref={chatInputRef}
          disabled={false}
          compact={!focused}
          currentModel={currentModel}
          availableModels={availableModels}
          thinkingLevel={thinkingLevel}
          onSend={handleSend}
          onStop={noop}
          onModelChange={(id, provider) => setSelectedModelKey({ id, provider })}
          onThinkingChange={setThinkingLevel}
          onOpenSettings={handleOpenSettings}
        />
      </div>
    </div>
  );
}

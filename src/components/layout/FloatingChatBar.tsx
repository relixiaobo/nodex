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
  const currentModel = useMemo(() => {
    if (!selectedModelKey) return availableModels[0] ?? undefined;
    return availableModels.find((m) => m.id === selectedModelKey.id && m.provider === selectedModelKey.provider) ?? availableModels[0] ?? undefined;
  }, [availableModels, selectedModelKey]);
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel | null>(null);

  // Track focus via focus/blur on the container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function handleFocusIn() {
      setFocused(true);
    }
    function handleFocusOut(e: FocusEvent) {
      // Only unfocus if the new focus target is outside our container
      if (container!.contains(e.relatedTarget as Node)) return;
      setFocused(false);
    }

    container.addEventListener('focusin', handleFocusIn);
    container.addEventListener('focusout', handleFocusOut);
    return () => {
      container.removeEventListener('focusin', handleFocusIn);
      container.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  // Click outside closes
  useEffect(() => {
    if (!focused) return;
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current?.contains(e.target as Node)) return;
      setFocused(false);
    }
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
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
        {/* Drag handle — click to open chat drawer */}
        <div className={`overflow-hidden transition-all duration-200 ease-out ${focused ? 'max-h-8 opacity-100' : 'max-h-0 opacity-0'}`}>
          <button
            type="button"
            onClick={() => {
              const currentDraft = chatInputRef.current?.getDraft() ?? '';
              setFocused(false);
              if (currentDraft.trim()) {
                void openChatWithPrompt(currentDraft);
              } else {
                useUIStore.getState().openChatDrawer();
              }
            }}
            className="mx-auto flex w-full items-center justify-center py-1.5"
            aria-label="Open chat"
          >
            <span className="h-1 w-8 rounded-full bg-foreground/15" />
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
          onStop={() => {}}
          onModelChange={handleModelChange}
          onThinkingChange={handleThinkingChange}
          onOpenSettings={handleOpenSettings}
        />
      </div>
    </div>
  );
}

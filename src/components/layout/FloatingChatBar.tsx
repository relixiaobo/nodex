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
  const [draft, setDraft] = useState('');
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

  // When focusing, inject saved draft and focus the textarea
  useEffect(() => {
    if (focused) {
      // setDraft also focuses the textarea via requestAnimationFrame
      chatInputRef.current?.setDraft(draft);
    }
  }, [focused]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on click outside — save draft first
  useEffect(() => {
    if (!focused) return;
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current?.contains(e.target as Node)) return;
      const currentDraft = chatInputRef.current?.getDraft() ?? '';
      setDraft(currentDraft);
      setFocused(false);
    }
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [focused]);

  // Close on Escape — save draft first
  useEffect(() => {
    if (!focused) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        const currentDraft = chatInputRef.current?.getDraft() ?? '';
        setDraft(currentDraft);
        setFocused(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [focused]);

  const handleSend = useCallback(async (prompt: string) => {
    setDraft('');
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
    const currentDraft = chatInputRef.current?.getDraft() ?? '';
    setDraft(currentDraft);
    setFocused(false);
    useUIStore.getState().navigateToNode(SYSTEM_NODE_IDS.SETTINGS);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20" data-testid="floating-chat-bar">
      <div className="h-8 bg-gradient-to-t from-background to-transparent" />

      <div ref={containerRef} className="pointer-events-auto bg-background">
        {focused ? (
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
          <div className="px-3 pb-3 pt-1">
            <button
              type="button"
              onClick={() => setFocused(true)}
              className={`flex w-full rounded-xl border border-border bg-background text-base leading-6 transition-colors hover:border-foreground/20 ${
                draft ? 'items-start px-3 pt-2.5 pb-2 text-foreground' : 'items-center px-3 py-2.5 text-foreground-tertiary'
              }`}
            >
              {draft || 'Ask about your notes…'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

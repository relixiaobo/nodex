import { useState, type FormEvent } from 'react';
import { MessageSquare } from '../../lib/icons.js';
import { openChatWithPrompt, openNewChatDrawer } from '../../lib/chat-panel-actions.js';
import { useUIStore } from '../../stores/ui-store.js';

export function FloatingChatBar() {
  const [draft, setDraft] = useState('');
  const currentChatSessionId = useUIStore((s) => s.currentChatSessionId);
  const openExistingDrawer = useUIStore((s) => s.openChatDrawer);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = draft.trim();
    if (!prompt) return;

    setDraft('');
    await openChatWithPrompt(prompt);
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20" data-testid="floating-chat-bar">
      <div className="h-10 bg-gradient-to-t from-background via-background/90 to-transparent" />
      <div className="pointer-events-auto border-t border-border/80 bg-background/95 px-3 pb-3 pt-2 backdrop-blur-sm">
        <form
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
          className="flex h-11 items-center gap-2 rounded-2xl border border-border bg-background px-3 shadow-[0_1px_0_rgba(0,0,0,0.02)]"
        >
          <button
            type="button"
            onClick={() => {
              if (currentChatSessionId) {
                openExistingDrawer();
                return;
              }
              void openNewChatDrawer();
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-foreground-tertiary transition-colors hover:bg-foreground/4 hover:text-foreground"
            aria-label="Open chat drawer"
          >
            <MessageSquare size={16} strokeWidth={1.8} />
          </button>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask about your notes..."
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-foreground-tertiary"
            data-floating-chat-input="true"
          />
        </form>
      </div>
    </div>
  );
}

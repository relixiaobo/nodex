import { useUIStore } from '../../stores/ui-store.js';
import { ensureChatSession } from '../../lib/chat-panel-actions.js';

export function FloatingChatBar() {
  const openChatDrawer = useUIStore((s) => s.openChatDrawer);
  const chatDrawerOpen = useUIStore((s) => s.chatDrawerOpen);
  const chatDraft = useUIStore((s) => s.chatDraft);

  function handleClick() {
    void ensureChatSession();
    openChatDrawer();
  }

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 transition-all duration-300 ease-out ${chatDrawerOpen ? 'translate-y-4 opacity-0' : 'translate-y-0 opacity-100'}`}
      data-testid="floating-chat-bar"
    >
      <div className="h-8 bg-gradient-to-t from-background to-transparent" />
      <div className={`bg-background px-3 pb-3 ${chatDrawerOpen ? 'pointer-events-none' : 'pointer-events-auto'}`}>
        <button
          type="button"
          onClick={handleClick}
          className={`flex w-full items-center rounded-xl border border-border bg-background px-3 py-2.5 text-base leading-6 transition-colors hover:border-foreground/20 ${chatDraft ? 'text-foreground' : 'text-foreground-tertiary'}`}
        >
          <span className="min-w-0 flex-1 truncate text-left">
            {chatDraft || 'Ask anything…'}
          </span>
        </button>
      </div>
    </div>
  );
}

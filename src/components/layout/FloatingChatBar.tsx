import { useUIStore } from '../../stores/ui-store.js';
import { ensureChatSession } from '../../lib/chat-panel-actions.js';

export function FloatingChatBar() {
  const openChatDrawer = useUIStore((s) => s.openChatDrawer);
  const chatDrawerOpen = useUIStore((s) => s.chatDrawerOpen);

  function handleClick() {
    void ensureChatSession();
    openChatDrawer();
  }

  // Hide when drawer is open
  if (chatDrawerOpen) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20" data-testid="floating-chat-bar">
      <div className="h-8 bg-gradient-to-t from-background to-transparent" />
      <div className="pointer-events-auto bg-background px-3 pb-3">
        <button
          type="button"
          onClick={handleClick}
          className="flex w-full items-center rounded-xl border border-border bg-background px-3 py-2.5 text-base leading-6 text-foreground-tertiary transition-colors hover:border-foreground/20"
        >
          Ask about your notes…
        </button>
      </div>
    </div>
  );
}

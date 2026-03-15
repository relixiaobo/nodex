/**
 * DeskLayout — Two-layer Z-axis layout.
 *
 * - Desk layer (recessed background): Chat, GlobalTools
 * - Card layer (elevated paper): NodePanel cards floating on desk
 *
 * Wide chat: panel cards left + Chat column right (GlobalTools above chat)
 * No chat / narrow chat: last panel's breadcrumb as shaped tab + GlobalTools on desk
 */
import { Suspense, lazy, useEffect, useState } from 'react';
import { GlobalTools } from '../toolbar/TopToolbar.js';
import { PanelLayout } from '../panel/PanelLayout.js';
import { useUIStore } from '../../stores/ui-store.js';
import { useChatResize } from '../../hooks/use-chat-resize.js';

const ChatDrawer = lazy(async () => ({
  default: (await import('../chat/ChatDrawer')).ChatDrawer,
}));

const WIDE_LAYOUT_MIN_WIDTH = 500;

const RESIZE_HANDLE_CLASSES = 'group flex shrink-0 items-center justify-center select-none touch-none';
const RESIZE_DOT_CLASSES = 'rounded-full bg-foreground/0 transition-colors group-hover:bg-foreground/15 group-active:bg-foreground/25';

export function DeskLayout() {
  const chatOpen = useUIStore((s) => s.chatOpen);
  const [isWideLayout, setIsWideLayout] = useState(() => window.innerWidth > WIDE_LAYOUT_MIN_WIDTH);
  const { chatWidth, handlePointerDown } = useChatResize();

  useEffect(() => {
    const onResize = () => setIsWideLayout(window.innerWidth > WIDE_LAYOUT_MIN_WIDTH);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const wideChat = chatOpen && isWideLayout;
  const narrowChat = chatOpen && !isWideLayout;

  return (
    <div className={`flex flex-1 overflow-hidden p-1.5${wideChat ? '' : ' flex-col'}`}>
      {narrowChat ? (
        <Suspense fallback={<ChatFallback />}>
          <ChatDrawer />
        </Suspense>
      ) : null}
      {!narrowChat && (
        <>
          {/* ── Panel cards (elevated paper layer) ── */}
          <div className={`flex overflow-hidden${wideChat
            ? ' flex-1 min-w-0 min-h-0 relative z-10'
            : ' flex-1 min-h-0'}`}
          >
            <PanelLayout toolbar={wideChat ? undefined : <GlobalTools />} />
          </div>

          {/* ── Chat area (desk-level, same Z as background) ── */}
          {wideChat ? (
            <>
              <div
                className={`${RESIZE_HANDLE_CLASSES} cursor-col-resize`}
                style={{ width: 8 }}
                onPointerDown={handlePointerDown}
              >
                <div className={`${RESIZE_DOT_CLASSES} h-8 w-1`} />
              </div>
              <div
                className="flex flex-col shrink-0 min-w-[240px]"
                style={{ width: chatWidth }}
              >
                <div className="self-end">
                  <GlobalTools />
                </div>
                <Suspense fallback={<ChatFallback />}>
                  <ChatDrawer />
                </Suspense>
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

function ChatFallback() {
  return (
    <div className="flex flex-1 items-center justify-center text-sm text-foreground-tertiary">
      Loading chat…
    </div>
  );
}

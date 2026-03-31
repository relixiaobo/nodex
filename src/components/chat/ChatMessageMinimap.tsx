import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { ChatMessageEntry } from '../../hooks/use-agent.js';

export interface ChatMessageMinimapProps {
  messages: ChatMessageEntry[];
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}

interface UserMessageItem {
  nodeId: string;
  preview: string;
}

function getUserMessageText(entry: ChatMessageEntry): string {
  if (entry.kind !== 'message' || entry.message.role !== 'user' || !entry.nodeId) return '';
  const msg = entry.message;
  const raw = typeof msg.content === 'string'
    ? msg.content
    : msg.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join(' ');

  return raw.replace(/\s+/g, ' ').trim();
}

function getUserMessagePreview(text: string): string {
  if (!text) return 'Empty message';
  return text.length > 15 ? `${text.slice(0, 15)}...` : text;
}

function getCurrentMessageId(
  container: HTMLDivElement,
  userMessages: UserMessageItem[],
): string | null {
  const rootRect = container.getBoundingClientRect();
  let closestId: string | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const entry of userMessages) {
    const element = container.querySelector<HTMLElement>(`[data-message-id="${entry.nodeId}"]`);
    if (!element) continue;

    const rect = element.getBoundingClientRect();
    const visibleTop = Math.max(rect.top, rootRect.top);
    const visibleBottom = Math.min(rect.bottom, rootRect.bottom);
    if (visibleBottom <= visibleTop) continue;

    const distance = Math.abs(rect.top - rootRect.top);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestId = entry.nodeId;
    }
  }

  return closestId;
}

export function ChatMessageMinimap({ messages, scrollContainerRef }: ChatMessageMinimapProps) {
  const userMessages = useMemo<UserMessageItem[]>(
    () =>
      messages.flatMap((entry) => {
        if (entry.kind !== 'message' || entry.message.role !== 'user' || !entry.nodeId) {
          return [];
        }

        const text = getUserMessageText(entry);
        return [{
          nodeId: entry.nodeId,
          preview: getUserMessagePreview(text),
        }];
      }),
    [messages],
  );
  const [isHovered, setIsHovered] = useState(false);
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(userMessages[0]?.nodeId ?? null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const highlightTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (userMessages.length < 2) {
      setCurrentMessageId(null);
      return;
    }

    const container = scrollContainerRef.current;
    if (!container) return;

    const updateCurrentMessage = () => {
      const nextId = getCurrentMessageId(container, userMessages) ?? userMessages[0]?.nodeId ?? null;
      setCurrentMessageId((prev) => (prev === nextId ? prev : nextId));
    };

    const observer = new IntersectionObserver(
      () => {
        updateCurrentMessage();
      },
      {
        root: container,
        threshold: [0, 0.1, 0.5, 1],
      },
    );

    for (const entry of userMessages) {
      const element = container.querySelector<HTMLElement>(`[data-message-id="${entry.nodeId}"]`);
      if (element) observer.observe(element);
    }

    const handleScroll = () => {
      updateCurrentMessage();
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    updateCurrentMessage();

    return () => {
      container.removeEventListener('scroll', handleScroll);
      observer.disconnect();
    };
  }, [scrollContainerRef, userMessages]);

  useEffect(() => {
    const list = listRef.current;
    const currentButton = currentMessageId ? itemRefs.current.get(currentMessageId) : null;
    if (!list || !currentButton) return;

    const targetTop = currentButton.offsetTop - (list.clientHeight / 2) + (currentButton.offsetHeight / 2);
    list.scrollTop = Math.max(0, targetTop);
  }, [currentMessageId, isHovered]);

  useEffect(() => () => {
    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
    }
  }, []);

  if (userMessages.length < 2) return null;

  return (
    <div
      className="absolute right-1 top-1/2 z-10 -translate-y-1/2"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        ref={listRef}
        aria-label="Chat message minimap"
        className={`scrollbar-none flex flex-col items-end overflow-y-auto py-1 ${isHovered ? 'max-h-40' : 'max-h-[160px]'}`}
      >
        {userMessages.map((entry, index) => {
          const isCurrent = entry.nodeId === currentMessageId;
          return (
            <button
              key={entry.nodeId}
              ref={(node) => {
                if (node) {
                  itemRefs.current.set(entry.nodeId, node);
                } else {
                  itemRefs.current.delete(entry.nodeId);
                }
              }}
              type="button"
              aria-label={`Jump to message ${index + 1}`}
              title={entry.preview}
              onClick={() => {
                const container = scrollContainerRef.current;
                if (!container) return;
                const element = container.querySelector<HTMLElement>(`[data-message-id="${entry.nodeId}"]`);
                if (!element) return;

                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                element.classList.add('chat-message-highlight');
                if (highlightTimeoutRef.current !== null) {
                  window.clearTimeout(highlightTimeoutRef.current);
                }
                highlightTimeoutRef.current = window.setTimeout(() => {
                  element.classList.remove('chat-message-highlight');
                  highlightTimeoutRef.current = null;
                }, 1500);
                setCurrentMessageId(entry.nodeId);
              }}
              className="group/minimap flex h-7 items-center justify-end gap-2 rounded-full pr-1.5 pl-2 transition-colors hover:bg-foreground/[0.03]"
            >
              <span
                className={`overflow-hidden whitespace-nowrap text-right text-xs transition-all duration-150 ease-out ${
                  isHovered ? 'max-w-[132px] opacity-100' : 'max-w-0 opacity-0'
                } ${isCurrent ? 'text-foreground-secondary' : 'text-foreground-tertiary'}`}
              >
                {entry.preview}
              </span>
              <span
                className={`h-1.5 w-3 shrink-0 rounded-full transition-colors ${
                  isCurrent ? 'bg-primary' : 'bg-foreground/15'
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

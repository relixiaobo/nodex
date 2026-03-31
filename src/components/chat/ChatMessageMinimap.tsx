import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { ChatMessageEntry } from '../../hooks/use-agent.js';

const MINIMAP_SCROLL_VISIBLE_MS = 900;

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
  visibleMessageIds: ReadonlySet<string>,
  previousMessageId: string | null,
): string | null {
  const rootRect = container.getBoundingClientRect();
  let closestVisibleId: string | null = null;
  let closestVisibleDistance = Number.POSITIVE_INFINITY;
  let nearestAboveId: string | null = null;
  let nearestAboveDistance = Number.POSITIVE_INFINITY;
  let nearestBelowId: string | null = null;
  let nearestBelowDistance = Number.POSITIVE_INFINITY;

  for (const entry of userMessages) {
    const element = container.querySelector<HTMLElement>(`[data-message-id="${entry.nodeId}"]`);
    if (!element) continue;

    const rect = element.getBoundingClientRect();
    const visibleTop = Math.max(rect.top, rootRect.top);
    const visibleBottom = Math.min(rect.bottom, rootRect.bottom);
    const isVisible = visibleMessageIds.has(entry.nodeId) && visibleBottom > visibleTop;

    if (isVisible) {
      const distance = Math.abs(rect.top - rootRect.top);
      if (distance < closestVisibleDistance) {
        closestVisibleDistance = distance;
        closestVisibleId = entry.nodeId;
      }
      continue;
    }

    if (rect.bottom <= rootRect.top) {
      const distance = rootRect.top - rect.bottom;
      if (distance < nearestAboveDistance) {
        nearestAboveDistance = distance;
        nearestAboveId = entry.nodeId;
      }
      continue;
    }

    if (rect.top >= rootRect.top) {
      const distance = rect.top - rootRect.top;
      if (distance < nearestBelowDistance) {
        nearestBelowDistance = distance;
        nearestBelowId = entry.nodeId;
      }
    }
  }

  return closestVisibleId
    ?? nearestAboveId
    ?? nearestBelowId
    ?? previousMessageId
    ?? userMessages[0]?.nodeId
    ?? null;
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
  const [isScrollVisible, setIsScrollVisible] = useState(false);
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(userMessages[0]?.nodeId ?? null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const highlightTimeoutRef = useRef<number | null>(null);
  const visibilityTimeoutRef = useRef<number | null>(null);
  const visibleMessageIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (userMessages.length < 2) {
      setCurrentMessageId(null);
      setIsScrollVisible(false);
      visibleMessageIdsRef.current.clear();
      return;
    }

    const container = scrollContainerRef.current;
    if (!container) return;

    const updateCurrentMessage = () => {
      setCurrentMessageId((prev) => {
        const nextId = getCurrentMessageId(
          container,
          userMessages,
          visibleMessageIdsRef.current,
          prev,
        );
        return prev === nextId ? prev : nextId;
      });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const messageId = (entry.target as HTMLElement).dataset.messageId;
          if (!messageId) continue;
          if (entry.isIntersecting && entry.intersectionRatio > 0) {
            visibleMessageIdsRef.current.add(messageId);
          } else {
            visibleMessageIdsRef.current.delete(messageId);
          }
        }
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
      setIsScrollVisible(true);
      if (visibilityTimeoutRef.current !== null) {
        window.clearTimeout(visibilityTimeoutRef.current);
      }
      visibilityTimeoutRef.current = window.setTimeout(() => {
        visibilityTimeoutRef.current = null;
        setIsScrollVisible(false);
      }, MINIMAP_SCROLL_VISIBLE_MS);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    updateCurrentMessage();

    return () => {
      container.removeEventListener('scroll', handleScroll);
      observer.disconnect();
      visibleMessageIdsRef.current.clear();
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
    if (visibilityTimeoutRef.current !== null) {
      window.clearTimeout(visibilityTimeoutRef.current);
    }
  }, []);

  if (userMessages.length < 2) return null;

  const isVisible = isHovered || isScrollVisible;

  return (
    <div
      aria-label="Chat message minimap"
      className={`absolute right-1 top-1/2 z-10 -translate-y-1/2 transition-all duration-150 ease-out ${
        isVisible ? 'pointer-events-auto opacity-100' : 'pointer-events-none translate-x-1 opacity-0'
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        ref={listRef}
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

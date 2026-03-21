/**
 * ChatCitePopover — popover showing a past chat session summary.
 *
 * Used by CitationBadge (type="chat") to preview a past conversation
 * without leaving the current chat.
 */
import { useCallback, useEffect, useState } from 'react';
import { MessageSquare } from '../../lib/icons.js';
import { getChatSession } from '../../lib/ai-persistence.js';
import { getLinearPath, type ChatSession } from '../../lib/ai-chat-tree.js';
import { switchToChatSession } from '../../lib/chat-panel-actions.js';
import { PopoverShell } from './PopoverShell.js';

const SYSTEM_REMINDER_PATTERN = /<system-reminder>[\s\S]*?<\/system-reminder>/g;
const USER_MESSAGE_PREVIEW_CHARS = 200;
const MAX_USER_MESSAGES = 6;

interface ChatCitePopoverProps {
  sessionId: string;
  anchorRect: DOMRect;
  onClose: () => void;
}

interface SessionPreview {
  title: string;
  updatedAt: number;
  userMessages: string[];
}

function extractUserText(content: string | Array<{ type: string; text?: string }>): string {
  const raw = typeof content === 'string'
    ? content
    : content
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n\n');

  return raw.replace(SYSTEM_REMINDER_PATTERN, '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function buildPreview(session: ChatSession): SessionPreview {
  const path = getLinearPath(session).filter((node) => node.message !== null);
  const userMessages: string[] = [];

  for (const node of path) {
    if (node.message?.role !== 'user') continue;
    const text = extractUserText(node.message.content);
    if (text) userMessages.push(truncate(text, USER_MESSAGE_PREVIEW_CHARS));
    if (userMessages.length >= MAX_USER_MESSAGES) break;
  }

  return {
    title: session.title?.trim() || 'Untitled chat',
    updatedAt: session.updatedAt,
    userMessages,
  };
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) return `Today ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  if (isYesterday) return `Yesterday ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ChatCitePopover({ sessionId, anchorRect, onClose }: ChatCitePopoverProps) {
  const [preview, setPreview] = useState<SessionPreview | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getChatSession(sessionId).then((session) => {
      if (cancelled) return;
      if (!session) {
        setNotFound(true);
        return;
      }
      setPreview(buildPreview(session));
    });
    return () => { cancelled = true; };
  }, [sessionId]);

  const handleOpenChat = useCallback(() => {
    switchToChatSession(sessionId);
    onClose();
  }, [sessionId, onClose]);

  return (
    <PopoverShell anchorRect={anchorRect} onClose={onClose}>
      <div className="px-3 py-2">
        {notFound ? (
          <p className="text-xs text-foreground-tertiary">Session not found</p>
        ) : !preview ? (
          <p className="text-xs text-foreground-tertiary">Loading...</p>
        ) : (
          <>
            <div className="mb-2">
              <p className="text-sm font-medium text-foreground truncate">{preview.title}</p>
              <p className="text-xs text-foreground-tertiary">{formatDate(preview.updatedAt)}</p>
            </div>
            {preview.userMessages.length > 0 && (
              <ul className="space-y-1 mb-2">
                {preview.userMessages.map((msg, i) => (
                  <li key={i} className="text-xs text-foreground-secondary leading-4 line-clamp-2">
                    {msg}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      {!notFound && (
        <div className="flex items-center justify-end border-t border-border px-2 py-1">
          <button
            type="button"
            onClick={handleOpenChat}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-foreground-secondary transition-colors hover:bg-foreground/4 hover:text-foreground"
          >
            <MessageSquare size={12} />
            Open this chat
          </button>
        </div>
      )}
    </PopoverShell>
  );
}

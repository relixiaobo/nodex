import { useCallback, useRef, useState, useSyncExternalStore, type MouseEvent as ReactMouseEvent } from 'react';
import { getAgentForSession, getChatTitle, subscribeChatTitles, updateSessionTitle } from '../../lib/ai-service.js';
import { List, MessageCircle, Pencil, X } from '../../lib/icons.js';
import type { ChatMessageEntry } from '../../hooks/use-agent.js';
import { DropdownPanel } from '../ui/DropdownPanel.js';

const CHAT_HEADER_EDIT_BTN = 'flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-foreground-tertiary opacity-0 transition-opacity hover:bg-foreground/4 hover:text-foreground group-hover/chat-header:opacity-100';
const CHAT_HEADER_CLOSE_BTN = 'flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-foreground-tertiary transition-colors hover:bg-foreground/4 hover:text-foreground';
const CHAT_HEADER_NAV_BTN = 'flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-foreground-tertiary transition-colors hover:bg-foreground/4 hover:text-foreground';

export function useChatTitleEdit(sessionId: string) {
  const title = useSyncExternalStore(
    subscribeChatTitles,
    () => getChatTitle(sessionId),
    () => getChatTitle(sessionId),
  );
  const displayTitle = title || 'Untitled';

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback((e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setDraft(displayTitle);
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.select());
  }, [displayTitle]);

  const saveEdit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== displayTitle) {
      const agent = getAgentForSession(sessionId);
      updateSessionTitle(agent, trimmed);
    }
    setEditing(false);
  }, [draft, displayTitle, sessionId]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
  }, []);

  return { editing, draft, setDraft, displayTitle, inputRef, startEdit, saveEdit, cancelEdit };
}

export function ChatTitleInput({ edit }: { edit: ReturnType<typeof useChatTitleEdit> }) {
  return (
    <input
      ref={edit.inputRef}
      value={edit.draft}
      onChange={(e) => edit.setDraft(e.target.value)}
      onBlur={edit.saveEdit}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') edit.saveEdit();
        if (e.key === 'Escape') edit.cancelEdit();
        e.stopPropagation();
      }}
      className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none"
      placeholder="Chat"
    />
  );
}

function getUserMessageText(entry: ChatMessageEntry): string {
  if (entry.kind !== 'message' || entry.message.role !== 'user') return '';
  const msg = entry.message;
  const raw = typeof msg.content === 'string'
    ? msg.content
    : msg.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join(' ');
  return raw.replace(/\s+/g, ' ').trim();
}

interface UserMessageNavProps {
  messages: ChatMessageEntry[];
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

function UserMessageNav({ messages, scrollContainerRef }: UserMessageNavProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const userMessages = messages.filter(
    (entry) => entry.kind === 'message' && entry.message.role === 'user' && entry.nodeId,
  );

  if (userMessages.length === 0) return null;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title="Jump to message"
        className={CHAT_HEADER_NAV_BTN}
      >
        <List size={12} strokeWidth={1.8} />
      </button>
      {open && (
        <DropdownPanel
          anchorRef={anchorRef}
          onClose={() => setOpen(false)}
          title="Messages"
          width={280}
        >
          <div className="max-h-80 overflow-y-auto">
            {userMessages.map((entry, index) => {
              const nodeId = entry.kind === 'message' ? entry.nodeId : null;
              const text = getUserMessageText(entry);
              const preview = text.length > 50 ? text.slice(0, 50) + '…' : text;
              return (
                <button
                  key={nodeId ?? index}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (!nodeId) return;
                    const container = scrollContainerRef.current;
                    if (!container) return;
                    const el = container.querySelector(`[data-message-id="${nodeId}"]`);
                    if (!el) return;
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    // Brief highlight
                    el.classList.add('chat-message-highlight');
                    setTimeout(() => el.classList.remove('chat-message-highlight'), 1500);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground-secondary transition-colors hover:bg-foreground/4 hover:text-foreground"
                >
                  <span className="shrink-0 text-[11px] text-foreground-tertiary">{index + 1}</span>
                  <span className="min-w-0 truncate">{preview || 'Empty message'}</span>
                </button>
              );
            })}
          </div>
        </DropdownPanel>
      )}
    </>
  );
}

interface ChatPanelHeaderProps {
  sessionId: string;
  onClose: (e: ReactMouseEvent<HTMLButtonElement>) => void;
  className?: string;
  messages?: ChatMessageEntry[];
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
}

export function ChatPanelHeader({ sessionId, onClose, className = '', messages, scrollContainerRef }: ChatPanelHeaderProps) {
  const edit = useChatTitleEdit(sessionId);

  return (
    <div className={`group/chat-header flex h-8 shrink-0 items-center mt-1 ${className}`.trim()}>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-4 text-[13px] text-foreground-tertiary">
        <MessageCircle size={12} strokeWidth={1.6} className="shrink-0" />
        {edit.editing ? (
          <ChatTitleInput edit={edit} />
        ) : (
          <span className="min-w-0 truncate">{edit.displayTitle}</span>
        )}
      </div>
      <div className="mr-2.5 flex shrink-0 items-center">
        {!edit.editing && messages && scrollContainerRef && (
          <UserMessageNav messages={messages} scrollContainerRef={scrollContainerRef} />
        )}
        {!edit.editing && (
          <button
            type="button"
            onClick={edit.startEdit}
            title="Edit title"
            className={CHAT_HEADER_EDIT_BTN}
          >
            <Pencil size={10} strokeWidth={1.8} />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          title="Close panel"
          aria-label="Close chat"
          className={CHAT_HEADER_CLOSE_BTN}
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

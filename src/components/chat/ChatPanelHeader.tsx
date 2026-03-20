import { useCallback, useRef, useState, useSyncExternalStore, type MouseEvent as ReactMouseEvent } from 'react';
import { getAgentForSession, getChatTitle, subscribeChatTitles, updateSessionTitle } from '../../lib/ai-service.js';
import { MessageCircle, Pencil, X } from '../../lib/icons.js';
import { chatPanelSessionId } from '../../types/index.js';

const CHAT_HEADER_EDIT_BTN = 'flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-foreground-tertiary opacity-0 transition-opacity hover:bg-foreground/4 hover:text-foreground group-hover/chat-header:opacity-100';
const CHAT_HEADER_CLOSE_BTN = 'flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-foreground-tertiary transition-colors hover:bg-foreground/4 hover:text-foreground';

export function useChatTitleEdit(nodeId: string) {
  const sessionId = chatPanelSessionId(nodeId);
  const title = useSyncExternalStore(
    subscribeChatTitles,
    () => getChatTitle(sessionId),
    () => getChatTitle(sessionId),
  );
  const displayTitle = title || 'Chat';

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

interface ChatPanelHeaderProps {
  nodeId: string;
  onClose: (e: ReactMouseEvent<HTMLButtonElement>) => void;
  className?: string;
}

export function ChatPanelHeader({ nodeId, onClose, className = '' }: ChatPanelHeaderProps) {
  const edit = useChatTitleEdit(nodeId);

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

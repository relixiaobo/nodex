import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AssistantMessage, ToolResultMessage } from '@mariozechner/pi-ai';
import { toast } from 'sonner';
import type { ChatConversationMessage, ChatMessageEntry } from '../../hooks/use-agent.js';
import { Check, ChevronLeft, ChevronRight, Copy, Pencil, RefreshCw } from '../../lib/icons.js';
import { CitationBadge } from './CitationBadge.js';
import { NodeReference } from './NodeReference.js';
import { ToolCallBlock } from './ToolCallBlock.js';

interface ChatMessageProps {
  entry: ChatMessageEntry;
  toolResults?: Map<string, ToolResultMessage>;
  streaming?: boolean;
  grouped?: boolean;
  busy?: boolean;
  onEdit?: (nodeId: string, newContent: string) => void | Promise<void>;
  onRegenerate?: (nodeId: string) => void | Promise<void>;
  onSwitchBranch?: (nodeId: string) => void;
  onCopy?: (text: string) => void | Promise<void>;
}

const INLINE_MARKUP_PATTERN = /<(ref|cite)\s+id="([^"]+)">([\s\S]*?)<\/\1>/g;
const ACTION_BUTTON = 'inline-flex h-7 w-7 items-center justify-center rounded-full text-foreground-tertiary transition-colors hover:bg-foreground/4 hover:text-foreground focus-visible:bg-foreground/4 focus-visible:text-foreground disabled:cursor-not-allowed disabled:text-foreground-tertiary/40 disabled:hover:bg-transparent disabled:focus-visible:bg-transparent';
const SECONDARY_BUTTON = 'inline-flex h-8 items-center rounded-full border border-border px-3 text-sm text-foreground-secondary transition-colors hover:bg-foreground/4 hover:text-foreground';

function getActionErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

function getMessageText(message: ChatConversationMessage): string {
  if (message.role === 'user') {
    if (typeof message.content === 'string') return message.content;
    return message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n\n');
  }

  const textContent = message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n\n');

  if (textContent) return textContent;
  if (message.stopReason === 'aborted') return '';
  return message.errorMessage ?? '';
}

function renderTextWithMarkup(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let cursor = 0;
  let matchIndex = 0;
  INLINE_MARKUP_PATTERN.lastIndex = 0;

  let match = INLINE_MARKUP_PATTERN.exec(text);
  while (match) {
    const [fullMatch, kind, nodeId, content] = match;
    const start = match.index;

    if (start > cursor) {
      parts.push(text.slice(cursor, start));
    }

    if (kind === 'ref') {
      parts.push(
        <NodeReference key={`${keyPrefix}-ref-${matchIndex}`} nodeId={nodeId}>
          {content}
        </NodeReference>,
      );
    } else {
      parts.push(
        <CitationBadge
          key={`${keyPrefix}-cite-${matchIndex}`}
          nodeId={nodeId}
          label={content}
        />,
      );
    }

    cursor = start + fullMatch.length;
    matchIndex += 1;
    match = INLINE_MARKUP_PATTERN.exec(text);
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return parts;
}

function renderAssistantBlocks(message: AssistantMessage, streaming: boolean, toolResults?: Map<string, ToolResultMessage>): ReactNode[] {
  return message.content.flatMap((block, index) => {
    if (block.type === 'thinking') return [];

    if (block.type === 'toolCall') {
      return (
        <ToolCallBlock
          key={`${block.id}-${index}`}
          toolCall={block}
          result={toolResults?.get(block.id)}
        />
      );
    }

    const hasLaterText = message.content.slice(index + 1).some((candidate) => candidate.type === 'text');

    return (
      <div
        key={`text-${index}`}
        className={`whitespace-pre-wrap text-base leading-6 text-foreground ${message.errorMessage && message.stopReason !== 'aborted' ? 'text-destructive' : ''}`}
      >
        {renderTextWithMarkup(block.text, `assistant-${index}`)}
        {streaming && !hasLaterText && (
          <span className="ml-1 inline-block h-3 w-1.5 animate-pulse rounded-sm bg-primary align-[-2px]" />
        )}
      </div>
    );
  });
}

export function ChatMessage({
  entry,
  toolResults,
  streaming = false,
  grouped = false,
  busy = false,
  onEdit,
  onRegenerate,
  onSwitchBranch,
  onCopy,
}: ChatMessageProps) {
  const { message, nodeId, branches } = entry;
  const text = getMessageText(message);
  const isUser = message.role === 'user';
  const assistantBlocks = message.role === 'assistant'
    ? renderAssistantBlocks(message, streaming, toolResults)
    : null;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const copyResetRef = useRef<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(text);

  useEffect(() => {
    if (isEditing) return;
    setEditText(text);
  }, [isEditing, text]);

  useEffect(() => {
    if (!isEditing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.style.height = '0px';
    el.style.height = `${Math.max(el.scrollHeight, 40)}px`;
  }, [editText, isEditing]);

  useEffect(() => {
    return () => {
      if (copyResetRef.current !== null) {
        window.clearTimeout(copyResetRef.current);
      }
    };
  }, []);

  if (!isUser && (!assistantBlocks || assistantBlocks.length === 0) && !streaming) {
    return null;
  }

  async function handleCopy() {
    try {
      if (onCopy) {
        await onCopy(text);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopied(true);
      if (copyResetRef.current !== null) {
        window.clearTimeout(copyResetRef.current);
      }
      copyResetRef.current = window.setTimeout(() => {
        setCopied(false);
        copyResetRef.current = null;
      }, 1500);
    } catch {
      // Clipboard access can fail in extension contexts; keep the action silent.
    }
  }

  async function handleSubmitEdit() {
    if (!nodeId || !onEdit) return;
    const normalized = editText.trim();
    if (!normalized) return;
    try {
      await onEdit(nodeId, normalized);
      setIsEditing(false);
    } catch (error) {
      toast.error(getActionErrorMessage(error, 'Failed to edit message'));
    }
  }

  async function handleRegenerate() {
    if (!nodeId || !onRegenerate) return;

    try {
      await onRegenerate(nodeId);
    } catch (error) {
      toast.error(getActionErrorMessage(error, 'Failed to regenerate response'));
    }
  }

  function renderBranchNavigator(): ReactNode {
    if (!branches || branches.ids.length <= 1) return null;

    const canGoPrev = !busy && branches.currentIndex > 0;
    const canGoNext = !busy && branches.currentIndex < branches.ids.length - 1;

    return (
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => canGoPrev && onSwitchBranch?.(branches.ids[branches.currentIndex - 1])}
          className={ACTION_BUTTON}
          disabled={!canGoPrev}
          aria-label="Show previous branch"
        >
          <ChevronLeft size={14} strokeWidth={1.8} />
        </button>
        <span className="min-w-8 text-center text-[11px] font-medium text-foreground-tertiary">
          {branches.currentIndex + 1}
          /
          {branches.ids.length}
        </span>
        <button
          type="button"
          onClick={() => canGoNext && onSwitchBranch?.(branches.ids[branches.currentIndex + 1])}
          className={ACTION_BUTTON}
          disabled={!canGoNext}
          aria-label="Show next branch"
        >
          <ChevronRight size={14} strokeWidth={1.8} />
        </button>
      </div>
    );
  }

  const showToolbar = nodeId !== null && !streaming && !isEditing;

  return (
    <div className={`group/message flex w-full ${isUser ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-1' : 'mt-4 first:mt-0'}`}>
      <div className={`relative flex max-w-[88%] flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        {!grouped && (
          <span className="text-xs text-foreground-tertiary">
            {isUser ? 'You' : 'soma'}
          </span>
        )}
        {isUser ? (
          isEditing ? (
            <div className="w-full min-w-[220px] rounded-lg border border-border bg-background px-3 py-2">
              <textarea
                ref={textareaRef}
                rows={1}
                value={editText}
                onChange={(event) => setEditText(event.target.value)}
                className="min-h-10 w-full resize-none bg-transparent text-base leading-6 text-foreground outline-none placeholder:text-foreground-tertiary"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setEditText(text);
                    setIsEditing(false);
                    return;
                  }

                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void handleSubmitEdit();
                  }
                }}
              />
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditText(text);
                    setIsEditing(false);
                  }}
                  className={SECONDARY_BUTTON}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSubmitEdit()}
                  disabled={busy || editText.trim().length === 0}
                  className="inline-flex h-8 items-center rounded-full bg-foreground px-3 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:bg-foreground/20"
                >
                  Save &amp; Submit
                </button>
              </div>
            </div>
          ) : (
            <div className="whitespace-pre-wrap rounded-lg bg-foreground/4 px-3 py-2 text-base leading-6 text-foreground">
              {text}
            </div>
          )
        ) : (
          <div className="flex w-full flex-col gap-2">
            {assistantBlocks}
          </div>
        )}
        {showToolbar && (
          <div
            data-testid="chat-message-toolbar"
            className="pointer-events-none absolute right-0 top-full z-10 mt-1 flex items-center gap-1 rounded-full border border-border bg-background px-1 py-0.5 opacity-0 transition-opacity group-hover/message:pointer-events-auto group-hover/message:opacity-100 group-focus-within/message:pointer-events-auto group-focus-within/message:opacity-100"
          >
            {isUser ? (
              <button
                type="button"
                onClick={() => {
                  setEditText(text);
                  setIsEditing(true);
                }}
                className={ACTION_BUTTON}
                disabled={busy}
                aria-label="Edit message"
              >
                <Pencil size={14} strokeWidth={1.8} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleRegenerate()}
                className={ACTION_BUTTON}
                disabled={busy}
                aria-label="Regenerate response"
              >
                <RefreshCw size={14} strokeWidth={1.8} />
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleCopy()}
              className={ACTION_BUTTON}
              aria-label="Copy message"
            >
              {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={1.8} />}
            </button>
            {branches && branches.ids.length > 1 && (
              <>
                <div className="mx-0.5 h-4 w-px bg-border" />
                {renderBranchNavigator()}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

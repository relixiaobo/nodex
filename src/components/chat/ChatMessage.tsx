import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AssistantMessage, ToolResultMessage } from '@mariozechner/pi-ai';
import { toast } from 'sonner';
import type { ChatConversationMessage, ChatMessageEntry } from '../../hooks/use-agent.js';
import { Brain, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Pencil, RefreshCw } from '../../lib/icons.js';
import { MarkdownContent } from './MarkdownRenderer.js';
import { ToolCallBlock } from './ToolCallBlock.js';
import { ToolCallGroup } from './ToolCallGroup.js';

interface ChatMessageProps {
  entry: ChatMessageEntry;
  toolResults?: Map<string, ToolResultMessage>;
  streaming?: boolean;
  grouped?: boolean;
  busy?: boolean;
  /** True when this is the last message in a consecutive same-role group.
   *  Assistant toolbar only renders on the last message of a turn. */
  isLastInTurn?: boolean;
  onEdit?: (nodeId: string, newContent: string) => void | Promise<void>;
  onRegenerate?: (nodeId: string) => void | Promise<void>;
  onSwitchBranch?: (nodeId: string) => void;
  onCopy?: (text: string) => void | Promise<void>;
}

const ACTION_BUTTON = 'inline-flex h-7 w-7 items-center justify-center rounded-lg text-foreground-tertiary transition-colors hover:bg-foreground/4 hover:text-foreground focus-visible:bg-foreground/4 focus-visible:text-foreground disabled:cursor-not-allowed disabled:text-foreground-tertiary/40 disabled:hover:bg-transparent disabled:focus-visible:bg-transparent';
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

function ThinkingBlock({ text, streaming }: { text: string; streaming: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="max-w-full">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="group/thinking flex max-w-full items-center gap-1.5 py-0.5 text-foreground-tertiary transition-colors hover:text-foreground-secondary"
      >
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
          {expanded ? (
            <ChevronDown size={14} strokeWidth={1.8} className="rotate-180" />
          ) : (
            <>
              <Brain size={14} strokeWidth={1.5} className="group-hover/thinking:hidden" />
              <ChevronDown size={14} strokeWidth={1.8} className="hidden group-hover/thinking:block" />
            </>
          )}
        </span>
        <span className="text-xs">
          {streaming && !text ? 'Thinking…' : 'Thought'}
        </span>
      </button>
      {expanded && text && (
        <pre className="ml-5 mt-1 max-h-96 overflow-auto whitespace-pre-wrap text-xs leading-5 text-foreground-tertiary">
          {text}
        </pre>
      )}
    </div>
  );
}

function renderAssistantBlocks(message: AssistantMessage, streaming: boolean, toolResults?: Map<string, ToolResultMessage>): ReactNode[] {
  const result: ReactNode[] = [];
  const blocks = message.content;
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i];

    if (block.type === 'thinking') {
      if (!block.redacted && (block.thinking || streaming)) {
        const hasLaterContent = blocks.slice(i + 1).some((b) => b.type === 'text' || b.type === 'toolCall');
        result.push(
          <ThinkingBlock
            key={`thinking-${i}`}
            text={block.thinking}
            streaming={streaming && !hasLaterContent}
          />,
        );
      }
      i++;
      continue;
    }

    if (block.type === 'toolCall') {
      // Collect consecutive toolCall blocks
      const runStart = i;
      const run: typeof blocks = [];
      while (i < blocks.length && blocks[i].type === 'toolCall') {
        run.push(blocks[i]);
        i++;
      }

      if (run.length >= 2) {
        const toolCalls = run.filter((b): b is import('@mariozechner/pi-ai').ToolCall => b.type === 'toolCall');
        result.push(
          <ToolCallGroup
            key={`toolgroup-${runStart}`}
            toolCalls={toolCalls}
            results={toolResults}
          />,
        );
      } else {
        const tc = run[0] as import('@mariozechner/pi-ai').ToolCall;
        result.push(
          <ToolCallBlock
            key={`${tc.id}-${runStart}`}
            toolCall={tc}
            result={toolResults?.get(tc.id)}
          />,
        );
      }
      continue;
    }

    // Text block
    const hasLaterText = blocks.slice(i + 1).some((candidate) => candidate.type === 'text');
    const isError = message.errorMessage && message.stopReason !== 'aborted';

    if (isError) {
      result.push(
        <div key={`text-${i}`} className="whitespace-pre-wrap text-base leading-6 text-destructive">
          {block.text}
        </div>,
      );
    } else {
      result.push(
        <MarkdownContent
          key={`text-${i}`}
          text={block.text}
          streaming={streaming && !hasLaterText}
          keyPrefix={`assistant-${i}`}
        />,
      );
    }
    i++;
  }

  return result;
}

export function ChatMessage({
  entry,
  toolResults,
  streaming = false,
  grouped = false,
  busy = false,
  isLastInTurn = true,
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

  const showToolbar = nodeId !== null && !streaming && !isEditing && (isUser || isLastInTurn);

  return (
    <div className={`${isUser ? 'group/message' : ''} flex w-full ${isUser ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-1' : 'mt-4 first:mt-0'}`}>
      <div className={`flex flex-col gap-1 ${isUser ? 'max-w-[88%] items-end' : 'w-full items-start'}`}>
        {isUser ? (
          isEditing ? (
            <div className="w-full min-w-[220px]">
              <div className="rounded-xl border border-border-emphasis bg-background px-3 py-2">
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
              </div>
              <div className="mt-2 flex items-center justify-end gap-2">
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
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div className="whitespace-pre-wrap rounded-lg bg-secondary-muted px-3 py-2 text-base leading-6 text-foreground">
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
            className={`flex items-center gap-0.5 ${isUser ? 'justify-end opacity-0 transition-opacity group-hover/message:opacity-100' : 'justify-start'}`}
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

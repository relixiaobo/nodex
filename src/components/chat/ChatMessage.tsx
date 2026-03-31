import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AssistantMessage, ToolCall, ToolResultMessage } from '@mariozechner/pi-ai';
import { toast } from 'sonner';
import type { ChatConversationMessage, ChatConversationEntry, ChatMessageEntry, ChatTurnPhase } from '../../hooks/use-agent.js';
import { AlertTriangle, Brain, ChevronLeft, ChevronRight, Pencil, RefreshCw } from '../../lib/icons.js';
import { CollapsibleIndicator } from './CollapsibleIndicator.js';
import { MarkdownContent } from './MarkdownRenderer.js';
import { ToolCallBlock } from './ToolCallBlock.js';
import { ToolCallGroup } from './ToolCallGroup.js';
import { CopyIconButton } from './CopyIconButton.js';

interface ChatMessageProps {
  entry: ChatMessageEntry;
  toolResults?: Map<string, ToolResultMessage>;
  streaming?: boolean;
  turnPhase?: ChatTurnPhase;
  grouped?: boolean;
  busy?: boolean;
  /** True when this is the last message in a consecutive same-role group.
   *  Assistant toolbar only renders on the last message of a turn. */
  isLastInTurn?: boolean;
  onEdit?: (nodeId: string, newContent: string) => void | Promise<void>;
  onRegenerate?: (nodeId: string) => void | Promise<void>;
  onRetry?: (nodeId: string) => void | Promise<void>;
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

/** Try to extract a human-readable message from an error string that may be raw JSON. */
function parseErrorMessage(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const msg = parsed?.error?.message ?? parsed?.message;
      if (typeof msg === 'string' && msg.length > 0) return msg;
    } catch {
      // not valid JSON — use as-is
    }
  }
  // Strip common prefixes like "Error: Proxy error: "
  return trimmed.replace(/^Error:\s*/i, '').replace(/^Proxy error:\s*/i, '');
}

/** Check if a text string looks like raw JSON (API error payload). */
function looksLikeJsonError(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('{') && trimmed.includes('"error"');
}

function getMessageText(message: ChatConversationMessage): string {
  if (message.role === 'user') {
    if (typeof message.content === 'string') return message.content;
    return message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n\n');
  }

  const isError = !!(message.errorMessage && message.stopReason !== 'aborted');
  const textContent = message.content
    .filter((block) => block.type === 'text')
    .filter((block) => !(isError && looksLikeJsonError(block.text)))
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
        className="group/thinking flex max-w-full items-center gap-1.5 py-0.5 text-left text-foreground-tertiary transition-colors hover:text-foreground-secondary"
      >
        <CollapsibleIndicator
          expanded={expanded}
          hoverScopeClass="group-hover/thinking"
          sizeClassName="h-3.5 w-3.5"
          icon={<Brain size={14} strokeWidth={1.5} />}
        />
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

function StreamingIndicator() {
  return (
    <div
      data-testid="chat-message-streaming-indicator"
      className="flex items-center py-1"
      aria-label="Assistant is responding"
    >
      <span className="chat-streaming-capsule" />
    </div>
  );
}

interface AssistantBlocksResult {
  blocks: ReactNode[];
  hasError: boolean;
  errorText: string;
}

function renderAssistantBlocks(message: AssistantMessage, streaming: boolean, toolResults?: Map<string, ToolResultMessage>): AssistantBlocksResult {
  const result: ReactNode[] = [];
  const blocks = message.content;
  const isError = !!(message.errorMessage && message.stopReason !== 'aborted');
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
      // Collect consecutive toolCall blocks into a run
      const runStart = i;
      const run: ToolCall[] = [];
      while (i < blocks.length && blocks[i].type === 'toolCall') {
        run.push(blocks[i] as ToolCall);
        i++;
      }

      if (run.length >= 2) {
        result.push(
          <ToolCallGroup key={`toolgroup-${runStart}`} toolCalls={run} results={toolResults} />,
        );
      } else {
        result.push(
          <ToolCallBlock key={`${run[0].id}-${runStart}`} toolCall={run[0]} result={toolResults?.get(run[0].id)} />,
        );
      }
      continue;
    }

    // Text block — skip raw JSON error payloads
    if (isError && block.type === 'text' && looksLikeJsonError(block.text)) {
      i++;
      continue;
    }

    const hasLaterText = blocks.slice(i + 1).some((candidate) => candidate.type === 'text');
    result.push(
      <MarkdownContent
        key={`text-${i}`}
        text={block.text}
        streaming={streaming && !hasLaterText}
        keyPrefix={`assistant-${i}`}
      />,
    );
    i++;
  }

  // Build user-friendly error message
  let errorText = '';
  if (isError) {
    errorText = parseErrorMessage(message.errorMessage ?? '');
    if (!errorText) errorText = 'Something went wrong';
  }

  return { blocks: result, hasError: isError, errorText };
}

export function ChatMessage({
  entry,
  toolResults,
  streaming = false,
  turnPhase = 'idle',
  grouped = false,
  busy = false,
  isLastInTurn = true,
  onEdit,
  onRegenerate,
  onRetry,
  onSwitchBranch,
  onCopy,
}: ChatMessageProps) {
  const message = entry.kind === 'message' ? entry.message : null;
  const nodeId = entry.kind === 'message' ? entry.nodeId : null;
  const branches = entry.kind === 'message' ? entry.branches : null;
  const text = message ? getMessageText(message) : '';
  const isUser = message?.role === 'user';
  const turnActive = turnPhase !== 'idle';
  const assistantResult = message?.role === 'assistant'
    ? renderAssistantBlocks(message, streaming, toolResults)
    : null;
  const assistantBlocks = assistantResult?.blocks ?? null;
  const hasInlineError = assistantResult?.hasError ?? false;
  const inlineErrorText = assistantResult?.errorText ?? '';
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(text);

  useEffect(() => {
    if (isEditing) return;
    setEditText(text);
  }, [isEditing, text]);

  // Focus + cursor to end only when entering edit mode
  useEffect(() => {
    if (!isEditing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [isEditing]);

  // Auto-resize height on every content change
  useEffect(() => {
    if (!isEditing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.max(el.scrollHeight, 40)}px`;
  }, [editText, isEditing]);

  if (!isUser && (!assistantBlocks || assistantBlocks.length === 0) && !hasInlineError && !turnActive) {
    return null;
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

  async function handleRetry() {
    if (!nodeId) return;
    const fn = onRetry ?? onRegenerate;
    if (!fn) return;

    try {
      await fn(nodeId);
    } catch (error) {
      toast.error(getActionErrorMessage(error, 'Failed to retry'));
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

  const showToolbar = entry.kind === 'message' && nodeId !== null && !turnActive && !isEditing && (isUser || isLastInTurn);

  return (
    <div data-message-id={nodeId ?? undefined} className={`${isUser ? 'group/message' : ''} flex w-full ${isUser ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-1' : 'mt-4 first:mt-0'}`}>
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
            {hasInlineError && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/15 bg-destructive/5 px-3 py-2">
                <AlertTriangle size={14} strokeWidth={1.8} className="mt-0.5 shrink-0 text-destructive" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="text-sm leading-5 text-destructive">{inlineErrorText}</span>
                  <button
                    type="button"
                    onClick={() => void handleRetry()}
                    disabled={busy}
                    className="inline-flex w-fit items-center gap-1.5 rounded-full border border-destructive/20 px-2.5 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw size={12} strokeWidth={2} />
                    Retry
                  </button>
                </div>
              </div>
            )}
            {turnActive && <StreamingIndicator />}
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
            <CopyIconButton
              text={text}
              ariaLabel="Copy message"
              className={ACTION_BUTTON}
              onCopy={onCopy}
            />
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

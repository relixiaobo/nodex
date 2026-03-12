import type { ReactNode } from 'react';
import type { AssistantMessage } from '@mariozechner/pi-ai';
import type { ChatConversationMessage } from '../../hooks/use-agent.js';
import { CitationBadge } from './CitationBadge.js';
import { NodeReference } from './NodeReference.js';
import { ToolCallBlock } from './ToolCallBlock.js';

interface ChatMessageProps {
  message: ChatConversationMessage;
  streaming?: boolean;
}

const INLINE_MARKUP_PATTERN = /<(ref|cite)\s+id="([^"]+)">([\s\S]*?)<\/\1>/g;

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

function renderAssistantBlocks(message: AssistantMessage, streaming: boolean): ReactNode[] {
  return message.content.flatMap((block, index) => {
    if (block.type === 'thinking') return [];

    if (block.type === 'toolCall') {
      return (
        <ToolCallBlock
          key={`${block.id}-${index}`}
          toolCall={block}
        />
      );
    }

    const hasLaterText = message.content.slice(index + 1).some((candidate) => candidate.type === 'text');

    return (
      <div
        key={`text-${index}`}
        className={`whitespace-pre-wrap text-[13px] leading-6 text-foreground ${message.errorMessage && message.stopReason !== 'aborted' ? 'text-destructive' : ''}`}
      >
        {renderTextWithMarkup(block.text, `assistant-${index}`)}
        {streaming && !hasLaterText && (
          <span className="ml-1 inline-block h-3 w-1.5 animate-pulse rounded-sm bg-primary align-[-2px]" />
        )}
      </div>
    );
  });
}

export function ChatMessage({ message, streaming = false }: ChatMessageProps) {
  const text = getMessageText(message);
  const isUser = message.role === 'user';
  const assistantBlocks = message.role === 'assistant'
    ? renderAssistantBlocks(message, streaming)
    : null;

  if (!isUser && (!assistantBlocks || assistantBlocks.length === 0) && !streaming) {
    return null;
  }

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[88%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-foreground-tertiary">
          {isUser ? 'You' : 'soma'}
        </span>
        {isUser ? (
          <div className="whitespace-pre-wrap rounded-2xl bg-foreground/[0.04] px-3 py-2 text-[13px] leading-6 text-foreground">
            {text}
          </div>
        ) : (
          <div className="flex w-full flex-col gap-2">
            {assistantBlocks}
          </div>
        )}
      </div>
    </div>
  );
}

import type { ChatConversationMessage } from '../../hooks/use-agent.js';

interface ChatMessageProps {
  message: ChatConversationMessage;
  streaming?: boolean;
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

export function ChatMessage({ message, streaming = false }: ChatMessageProps) {
  const text = getMessageText(message);
  const isUser = message.role === 'user';
  const hasError = message.role === 'assistant' && !!message.errorMessage && message.stopReason !== 'aborted';

  if (!text && !streaming) return null;

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[88%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-foreground-tertiary">
          {isUser ? 'You' : 'Claude'}
        </span>
        <div
          className={[
            'whitespace-pre-wrap text-[13px] leading-6 text-foreground',
            isUser ? 'rounded-2xl bg-foreground/[0.04] px-3 py-2' : '',
            hasError ? 'text-destructive' : '',
          ].join(' ')}
        >
          {text}
          {!isUser && streaming && (
            <span className="ml-1 inline-block h-3 w-1.5 animate-pulse rounded-sm bg-primary align-[-2px]" />
          )}
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import type { ToolCall, ToolResultMessage } from '@mariozechner/pi-ai';
import { ChevronDown, RotateCcw, Sparkles } from '../../lib/icons.js';

interface ToolCallBlockProps {
  toolCall: ToolCall;
  result?: ToolResultMessage;
}

function summarizeToolCall(toolCall: ToolCall): string {
  if (toolCall.name === 'node') {
    const action = typeof toolCall.arguments.action === 'string' ? toolCall.arguments.action : 'run';
    const subject = typeof toolCall.arguments.name === 'string'
      ? toolCall.arguments.name
      : typeof toolCall.arguments.query === 'string'
        ? toolCall.arguments.query
        : typeof toolCall.arguments.nodeId === 'string'
          ? toolCall.arguments.nodeId
          : null;

    return subject ? `node.${action} — ${subject}` : `node.${action}`;
  }

  if (toolCall.name === 'undo') {
    const steps = typeof toolCall.arguments.steps === 'number' ? toolCall.arguments.steps : 1;
    return steps === 1 ? 'undo — 1 step' : `undo — ${steps} steps`;
  }

  return toolCall.name;
}

function getResultText(result: ToolResultMessage): string {
  return result.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

export function ToolCallBlock({ toolCall, result }: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const Icon = toolCall.name === 'undo' ? RotateCcw : Sparkles;

  return (
    <div className="rounded-xl border border-border bg-foreground/[0.02]">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon size={13} strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground-secondary">
          {summarizeToolCall(toolCall)}
        </span>
        <ChevronDown
          size={14}
          strokeWidth={1.8}
          className={`shrink-0 text-foreground-tertiary transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>
      {expanded && (
        <div className="border-t border-border">
          <div className="px-3 py-2">
            <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.06em] text-foreground-tertiary">Input</div>
            <pre className="overflow-x-auto text-[11px] leading-5 text-foreground-secondary">
              {JSON.stringify(toolCall.arguments, null, 2)}
            </pre>
          </div>
          {result && (
            <div className="border-t border-border/50 px-3 py-2">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.06em] text-foreground-tertiary">
                Output
                {result.isError && <span className="ml-1.5 text-destructive">error</span>}
              </div>
              <pre className={`overflow-x-auto text-[11px] leading-5 ${result.isError ? 'text-destructive' : 'text-foreground-secondary'}`}>
                {getResultText(result)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

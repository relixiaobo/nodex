import { useState } from 'react';
import type { ToolCall } from '@mariozechner/pi-ai';
import { ChevronDown, RotateCcw, Sparkles } from '../../lib/icons.js';

interface ToolCallBlockProps {
  toolCall: ToolCall;
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

export function ToolCallBlock({ toolCall }: ToolCallBlockProps) {
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
        <pre className="overflow-x-auto border-t border-border px-3 py-2 text-[11px] leading-5 text-foreground-secondary">
          {JSON.stringify(toolCall.arguments, null, 2)}
        </pre>
      )}
    </div>
  );
}

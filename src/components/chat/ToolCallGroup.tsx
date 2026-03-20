import { useState } from 'react';
import type { ToolCall, ToolResultMessage } from '@mariozechner/pi-ai';
import { Check, ChevronDown, Loader2 } from '../../lib/icons.js';
import { ToolCallBlock, getStatus, summarizeToolCall } from './ToolCallBlock.js';

interface ToolCallGroupProps {
  toolCalls: ToolCall[];
  results?: Map<string, ToolResultMessage>;
}

export function ToolCallGroup({ toolCalls, results }: ToolCallGroupProps) {
  const [expanded, setExpanded] = useState(false);

  const total = toolCalls.length;
  let failed = 0;
  let isExecuting = false;

  for (const tc of toolCalls) {
    const s = getStatus(results?.get(tc.id));
    if (s === 'pending') isExecuting = true;
    else if (s === 'error') failed++;
  }

  const latestToolCall = toolCalls[total - 1];
  const latestStatus = getStatus(results?.get(latestToolCall.id));

  // ── Title ─────────────────────────────────────────────────────────────

  let titleText: string;
  if (!isExecuting) {
    titleText = `Completed ${total} steps`;
  } else if (expanded) {
    titleText = `${total} steps`;
  } else {
    titleText = `${summarizeToolCall(latestToolCall, latestStatus)} · step ${total}`;
  }

  const failedSuffix = !isExecuting && failed > 0 ? ` · ${failed} failed` : '';

  // ── Icon ──────────────────────────────────────────────────────────────

  const StatusIcon = isExecuting ? Loader2 : Check;
  const statusIconClass = isExecuting ? 'animate-spin' : '';

  return (
    <div className="max-w-full">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="group/toolgroup flex max-w-full items-center gap-1.5 py-0.5 text-foreground-tertiary transition-colors hover:text-foreground-secondary"
      >
        <span className="flex h-4 w-3.5 shrink-0 items-center justify-center">
          {expanded ? (
            <ChevronDown size={14} strokeWidth={1.8} className="rotate-180" />
          ) : (
            <>
              <StatusIcon size={14} strokeWidth={1.6} className={`group-hover/toolgroup:hidden ${statusIconClass}`} />
              <ChevronDown size={14} strokeWidth={1.8} className="hidden group-hover/toolgroup:block" />
            </>
          )}
        </span>
        <span className="min-w-0 truncate text-xs">
          {titleText}
          {failedSuffix && <span className="text-destructive">{failedSuffix}</span>}
        </span>
      </button>
      {expanded && (
        <div className="ml-5 mt-1 flex flex-col">
          {toolCalls.map((tc, i) => (
            <ToolCallBlock key={`${tc.id}-${i}`} toolCall={tc} result={results?.get(tc.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

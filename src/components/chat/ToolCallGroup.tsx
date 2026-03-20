import { useState } from 'react';
import type { ToolCall, ToolResultMessage } from '@mariozechner/pi-ai';
import { Check, ChevronDown, Loader2, XCircle } from '../../lib/icons.js';
import { ToolCallBlock, getStatus, summarizeToolCall } from './ToolCallBlock.js';

interface ToolCallGroupProps {
  toolCalls: ToolCall[];
  results?: Map<string, ToolResultMessage>;
}

export function ToolCallGroup({ toolCalls, results }: ToolCallGroupProps) {
  const [expanded, setExpanded] = useState(false);

  const total = toolCalls.length;
  let done = 0;
  let failed = 0;
  let pending = 0;

  for (const tc of toolCalls) {
    const status = getStatus(results?.get(tc.id));
    if (status === 'done') done++;
    else if (status === 'error') { done++; failed++; }
    else pending++;
  }

  const isExecuting = pending > 0;
  const latestToolCall = toolCalls[total - 1];
  const latestStatus = getStatus(results?.get(latestToolCall.id));

  // ── Title text ──────────────────────────────────────────────────────────

  let titleText: string;
  if (expanded) {
    titleText = isExecuting
      ? `${total} steps`
      : `Completed ${total} steps`;
  } else {
    if (isExecuting) {
      titleText = `${summarizeToolCall(latestToolCall, latestStatus)} \u00b7 step ${total}`;
    } else {
      titleText = `Completed ${total} steps`;
    }
  }

  const failedSuffix = !isExecuting && failed > 0 ? ` \u00b7 ${failed} failed` : '';

  // ── Status icon ─────────────────────────────────────────────────────────

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
        <div className="ml-5 mt-1 flex flex-col gap-0.5">
          {toolCalls.map((tc, i) => {
            const status = getStatus(results?.get(tc.id));
            return (
              <div key={`${tc.id}-${i}`} className="flex items-start gap-1.5">
                <div className="flex flex-1 min-w-0">
                  <ToolCallBlock toolCall={tc} result={results?.get(tc.id)} />
                </div>
                <span className="flex h-5 w-3.5 shrink-0 items-center justify-center">
                  {status === 'done' && <Check size={12} strokeWidth={2} className="text-foreground-tertiary" />}
                  {status === 'pending' && <Loader2 size={12} strokeWidth={2} className="animate-spin text-foreground-tertiary" />}
                  {status === 'error' && <XCircle size={12} strokeWidth={2} className="text-destructive" />}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

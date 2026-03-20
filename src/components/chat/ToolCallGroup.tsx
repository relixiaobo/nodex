import { useState } from 'react';
import type { ToolCall, ToolResultMessage } from '@mariozechner/pi-ai';
import { Check, Loader2, XCircle } from '../../lib/icons.js';
import { DisclosureIcon } from './DisclosureIcon.js';
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

  const statusIcon = isExecuting ? Loader2 : Check;
  const statusIconClass = isExecuting ? 'animate-spin' : undefined;

  return (
    <div className="max-w-full">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="group/disc flex max-w-full items-center gap-1.5 py-0.5 text-foreground-tertiary transition-colors hover:text-foreground-secondary"
      >
        <DisclosureIcon expanded={expanded} icon={statusIcon} iconClass={statusIconClass} />
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

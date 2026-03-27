import { useState } from 'react';
import type { ToolCall, ToolResultMessage } from '@mariozechner/pi-ai';
import { ListChecks, Loader2 } from '../../lib/icons.js';
import { CollapsibleIndicator } from './CollapsibleIndicator.js';
import { ToolCallBlock, getStatus } from './ToolCallBlock.js';

interface ToolCallGroupProps {
  toolCalls: ToolCall[];
  results?: Map<string, ToolResultMessage>;
}

export function ToolCallGroup({ toolCalls, results }: ToolCallGroupProps) {
  const total = toolCalls.length;
  let failed = 0;
  let isExecuting = false;

  for (const tc of toolCalls) {
    const s = getStatus(results?.get(tc.id));
    if (s === 'pending') isExecuting = true;
    else if (s === 'error') failed++;
  }

  const [expanded, setExpanded] = useState(false);

  function handleToggle() {
    setExpanded((v) => !v);
  }

  // ── Title ─────────────────────────────────────────────────────────────

  let titleText: string;
  if (!isExecuting) {
    titleText = `Completed ${total} steps`;
  } else {
    titleText = `Working through ${total} step${total > 1 ? 's' : ''}`;
  }

  const failedSuffix = !isExecuting && failed > 0 ? ` · ${failed} failed` : '';

  // ── Icon ──────────────────────────────────────────────────────────────

  const StatusIcon = isExecuting ? Loader2 : ListChecks;
  const statusIconClass = isExecuting ? 'animate-spin' : '';

  return (
    <div className="max-w-full">
      <button
        type="button"
        onClick={handleToggle}
        className="group/toolgroup flex max-w-full items-center gap-1.5 py-0.5 text-left text-foreground-tertiary transition-colors hover:text-foreground-secondary"
      >
        <CollapsibleIndicator
          expanded={expanded}
          hoverScopeClass="group-hover/toolgroup"
          icon={<StatusIcon size={14} strokeWidth={1.6} className={statusIconClass} />}
        />
        <span className="min-w-0 truncate text-xs font-medium">
          {titleText}
          {failedSuffix}
        </span>
      </button>
      {expanded && (
        <div className="flex flex-col">
          {toolCalls.map((tc, i) => (
            <ToolCallBlock key={`${tc.id}-${i}`} toolCall={tc} result={results?.get(tc.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

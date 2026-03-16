import { useMemo, useState } from 'react';
import type { ToolCall, ToolResultMessage } from '@mariozechner/pi-ai';
import type { AppIcon } from '../../lib/icons.js';
import { IMAGE_PLACEHOLDER } from '../../lib/ai-message-images.js';
import { highlightCode } from '../../lib/code-highlight.js';
import { ChevronDown, FileText, Globe, Image, Pencil, Plus, RotateCcw, Search, Sparkles, Trash2 } from '../../lib/icons.js';

interface ToolCallBlockProps {
  toolCall: ToolCall;
  result?: ToolResultMessage;
}

function getToolIcon(name: string, args: Record<string, unknown>): AppIcon {
  if (name === 'node_create') return Plus;
  if (name === 'node_read') return FileText;
  if (name === 'node_edit') return Pencil;
  if (name === 'node_delete') return Trash2;
  if (name === 'node_search') return Search;
  if (name === 'undo') return RotateCcw;
  if (name === 'browser') return Globe;

  // Legacy combined node tool
  if (name === 'node') {
    const action = typeof args.action === 'string' ? args.action : '';
    if (action === 'create') return Plus;
    if (action === 'read') return FileText;
    if (action === 'edit') return Pencil;
    if (action === 'delete') return Trash2;
    if (action === 'search') return Search;
  }

  return Sparkles;
}

function summarizeToolCall(toolCall: ToolCall): string {
  const { name, arguments: args } = toolCall;

  if (name === 'node_create') {
    const nodeName = typeof args.name === 'string' ? args.name : null;
    return nodeName ? `Create — ${nodeName}` : 'Create node';
  }
  if (name === 'node_read') {
    return `Read — ${typeof args.nodeId === 'string' ? args.nodeId : 'node'}`;
  }
  if (name === 'node_edit') {
    const label = typeof args.name === 'string' ? args.name : typeof args.nodeId === 'string' ? args.nodeId : 'node';
    return `Edit — ${label}`;
  }
  if (name === 'node_delete') {
    const restore = args.restore === true;
    return `${restore ? 'Restore' : 'Delete'} — ${typeof args.nodeId === 'string' ? args.nodeId : 'node'}`;
  }
  if (name === 'node_search') {
    return `Search — ${typeof args.query === 'string' ? args.query : '…'}`;
  }

  // Legacy combined node tool
  if (name === 'node') {
    const action = typeof args.action === 'string' ? args.action : 'run';
    const subject = typeof args.name === 'string'
      ? args.name
      : typeof args.query === 'string'
        ? args.query
        : typeof args.nodeId === 'string'
          ? args.nodeId
          : null;
    return subject ? `node.${action} — ${subject}` : `node.${action}`;
  }

  if (name === 'undo') {
    const steps = typeof args.steps === 'number' ? args.steps : 1;
    return steps === 1 ? 'Undo — 1 step' : `Undo — ${steps} steps`;
  }

  if (name === 'browser') {
    const action = typeof args.action === 'string' ? args.action : null;
    if (!action) return 'browser';
    const readable = action.replace(/_/g, ' ');
    const subject = typeof args.query === 'string' ? args.query
      : typeof args.url === 'string' ? args.url
      : typeof args.selector === 'string' ? args.selector
      : typeof args.elementDescription === 'string' ? args.elementDescription
      : null;
    return subject ? `${readable} — ${subject}` : readable;
  }

  return name;
}

function isImagePlaceholder(text: string): boolean {
  const t = text.trim();
  return t === IMAGE_PLACEHOLDER || t.startsWith('[Image removed');
}

type ResultPart = { type: 'text'; text: string } | { type: 'image_placeholder' };

function getResultParts(result: ToolResultMessage): ResultPart[] {
  return result.content
    .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
    .map((block) =>
      isImagePlaceholder(block.text)
        ? { type: 'image_placeholder' as const }
        : { type: 'text' as const, text: block.text },
    );
}

const CODE_BLOCK = 'max-h-48 overflow-auto whitespace-pre text-[11px] leading-5';

export function ToolCallBlock({ toolCall, result }: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const Icon = getToolIcon(toolCall.name, toolCall.arguments);

  const inputHtml = useMemo(
    () => expanded ? highlightCode(JSON.stringify(toolCall.arguments, null, 2), 'json') : '',
    [expanded, toolCall.arguments],
  );

  const parts = useMemo(() => result && expanded ? getResultParts(result) : [], [result, expanded]);

  return (
    <div className="max-w-full">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="group/tool flex max-w-full items-center gap-1.5 py-0.5 text-foreground-tertiary transition-colors hover:text-foreground-secondary"
      >
        {/* Icon area: tool icon by default, chevron on hover / when expanded */}
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
          {expanded ? (
            <ChevronDown size={14} strokeWidth={1.8} className="rotate-180" />
          ) : (
            <>
              <Icon size={14} strokeWidth={1.6} className="group-hover/tool:hidden" />
              <ChevronDown size={14} strokeWidth={1.8} className="hidden group-hover/tool:block" />
            </>
          )}
        </span>
        <span className="min-w-0 truncate text-xs">
          {summarizeToolCall(toolCall)}
        </span>
      </button>
      {expanded && (
        <div className="ml-5 mt-1 overflow-hidden rounded-lg border border-border/60 bg-foreground/[0.02]">
          <div className="px-3 py-2">
            <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.06em] text-foreground-tertiary">Input</div>
            <pre
              className={`${CODE_BLOCK} text-foreground-secondary`}
              dangerouslySetInnerHTML={{ __html: inputHtml }}
            />
          </div>
          {result && (
            <div className="border-t border-border/50 px-3 py-2">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.06em] text-foreground-tertiary">
                Output
                {result.isError && <span className="ml-1.5 text-destructive">error</span>}
              </div>
              {parts.map((part, i) =>
                part.type === 'image_placeholder' ? (
                  <div key={i} className="flex items-center gap-1.5 py-1 text-[11px] text-foreground-tertiary">
                    <Image size={14} strokeWidth={1.6} className="shrink-0" />
                    <span>Screenshot captured</span>
                  </div>
                ) : (
                  <HighlightedPre key={i} text={part.text} isError={result.isError} />
                ),
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HighlightedPre({ text, isError }: { text: string; isError: boolean }) {
  const html = useMemo(() => highlightCode(text), [text]);
  return (
    <pre
      className={`${CODE_BLOCK} ${isError ? 'text-destructive' : 'text-foreground-secondary'}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

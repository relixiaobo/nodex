import { useMemo, useState } from 'react';
import type { AssistantMessage, Message, ToolCall, ToolResultMessage } from '@mariozechner/pi-ai';
import type { AgentDebugState } from '../../hooks/use-agent.js';
import { useChatDebugSnapshot } from '../../hooks/use-chat-debug-snapshot.js';
import type { AgentDebugSnapshot, DebugTokenEstimate } from '../../lib/ai-debug.js';
import { sanitizeDebugValue } from '../../lib/ai-debug.js';
import { highlightCode } from '../../lib/code-highlight.js';
import { ChevronDown } from '../../lib/icons.js';

interface ChatDebugPanelProps {
  debug: AgentDebugState;
}

type DisplayRole = 'SYSTEM' | 'USER' | 'ASST' | 'TOOL' | 'TOOLS';

interface ContentPart {
  type: string;
  preview: string;
  fullText: string;
}

interface UsageMeta {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  stopReason: string;
}

interface ConversationEntry {
  id: string;
  role: DisplayRole;
  contentParts: ContentPart[];
  rawJson: string | null;
  usageMeta?: UsageMeta;
}

const DEBUG_TEXT = 'max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-4 text-foreground-secondary';
const DEBUG_CODE = 'max-h-80 overflow-auto whitespace-pre font-mono text-[10px] leading-4 text-foreground-secondary';
const DEBUG_CODE_CARD = `${DEBUG_CODE} rounded-xl border border-border bg-background px-2 py-2`;
const PANEL_CARD = 'overflow-hidden rounded-xl border border-border bg-background';

function formatTokenCount(value: number): string {
  return `~${Math.round(value).toLocaleString()}`;
}

function formatUsagePercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatCost(value: number | null | undefined): string {
  if (typeof value !== 'number') return 'n/a';
  return `$${value.toFixed(4)}`;
}

function formatCount(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function useToggleMap() {
  const [value, setValue] = useState<Record<string, boolean>>({});

  function toggle(id: string) {
    setValue((current) => ({
      ...current,
      [id]: !current[id],
    }));
  }

  return [value, toggle] as const;
}

function truncatePreview(text: string, maxLength = 100): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '(empty)';
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
}

function roleBadgeClass(role: DisplayRole): string {
  switch (role) {
    case 'USER':
      return 'text-foreground';
    case 'ASST':
      return 'text-primary';
    case 'TOOL':
      return 'text-warning';
    case 'TOOLS':
      return 'text-foreground-tertiary';
    default:
      return 'text-foreground-tertiary';
  }
}

function inferLanguage(text: string): string | undefined {
  const trimmed = text.trimStart();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('<')) return 'xml';
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  return undefined;
}

function formatInlineValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  if (Array.isArray(value)) return value.length === 0 ? '[]' : `[${value.length}]`;
  if (typeof value === 'object') return '{…}';
  return '…';
}

function summarizeArguments(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return '';
  const summarized = entries
    .slice(0, 3)
    .map(([key, nestedValue]) => `${key}: ${formatInlineValue(nestedValue)}`)
    .join(', ');
  return `{${summarized}${entries.length > 3 ? ', …' : ''}}`;
}

function summarizeToolCall(toolCall: ToolCall): string {
  const argsSummary = summarizeArguments(toolCall.arguments);
  return argsSummary ? `${toolCall.name}(${argsSummary})` : `${toolCall.name}()`;
}

function HighlightedPre({
  text,
  language,
  className,
}: {
  text: string;
  language?: string;
  className: string;
}) {
  const html = useMemo(() => highlightCode(text, language), [text, language]);
  return (
    <pre
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function DebugCodeBlock({
  text,
  language,
  wrap = false,
}: {
  text: string;
  language?: string;
  wrap?: boolean;
}) {
  return (
    <HighlightedPre
      text={text}
      language={language}
      className={wrap ? `${DEBUG_CODE_CARD} whitespace-pre-wrap break-words` : DEBUG_CODE_CARD}
    />
  );
}

function RawJsonToggle({
  label,
  open,
  onToggle,
  json,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  json: string;
}) {
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-1 font-mono text-[10px] text-foreground-tertiary transition-colors hover:border-border-emphasis hover:text-foreground"
      >
        <span>{label}</span>
        <ChevronDown
          size={12}
          strokeWidth={1.5}
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <DebugCodeBlock text={json} language="json" />
      )}
    </div>
  );
}

function TokenBreakdown({ tokenEstimate }: { tokenEstimate: DebugTokenEstimate }) {
  return (
    <div className="space-y-1 font-mono text-[10px] text-foreground-secondary">
      <div className="flex items-center justify-between">
        <span>system prompt</span>
        <span>{formatTokenCount(tokenEstimate.systemPrompt)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span>messages</span>
        <span>{formatTokenCount(tokenEstimate.messages)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span>tools</span>
        <span>{formatTokenCount(tokenEstimate.tools)}</span>
      </div>
      <div className="flex items-center justify-between text-foreground">
        <span>total</span>
        <span>{formatTokenCount(tokenEstimate.total)}</span>
      </div>
    </div>
  );
}

function ContextSummaryBar({
  snapshot,
  open,
  onToggle,
}: {
  snapshot: AgentDebugSnapshot;
  open: boolean;
  onToggle: () => void;
}) {
  const summary = `${formatTokenCount(snapshot.tokenEstimate.total)} · ${formatCount(snapshot.messages.length, 'msg')} · ${formatCount(snapshot.tools.length, 'tool')}`;

  return (
    <div className={PANEL_CARD} data-testid="chat-debug-context">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-col gap-2 px-3 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 text-[11px] font-medium text-foreground">Context</span>
          <span className="font-mono text-[10px] text-foreground-tertiary">{summary}</span>
          <ChevronDown
            size={14}
            strokeWidth={1.5}
            className={`shrink-0 text-foreground-tertiary transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between font-mono text-[10px] text-foreground-secondary">
            <span>{formatTokenCount(snapshot.tokenEstimate.total)} tokens</span>
            <span>
              {formatUsagePercent(snapshot.tokenEstimate.usagePercent)} of {snapshot.tokenEstimate.contextWindow.toLocaleString()}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]">
            <div
              className="h-full rounded-full bg-primary/60"
              style={{ width: `${snapshot.tokenEstimate.usagePercent}%` }}
            />
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-border px-3 py-3">
          <TokenBreakdown tokenEstimate={snapshot.tokenEstimate} />
        </div>
      )}
    </div>
  );
}

function ConversationRow({
  entry,
  expandedParts,
  rawJsonOpen,
  onTogglePart,
  onToggleRawJson,
}: {
  entry: ConversationEntry;
  expandedParts: Record<string, boolean>;
  rawJsonOpen: boolean;
  onTogglePart: (id: string) => void;
  onToggleRawJson: () => void;
}) {
  return (
    <div data-testid="chat-debug-message-row">
      {entry.contentParts.map((part, partIndex) => {
        const partId = `${entry.id}-${partIndex}`;
        const isExpanded = expandedParts[partId] ?? false;

        return (
          <button
            key={partId}
            type="button"
            onClick={() => onTogglePart(partId)}
            className={`flex w-full flex-col rounded-lg px-2 py-1 text-left transition-colors hover:bg-foreground/4 ${isExpanded ? 'bg-foreground/4' : ''}`}
          >
            <div className="flex w-full items-center gap-2">
              {partIndex === 0 ? (
                <span className={`w-11 shrink-0 font-mono text-[10px] uppercase tracking-[0.04em] ${roleBadgeClass(entry.role)}`}>
                  {entry.role}
                </span>
              ) : (
                <span className="w-11 shrink-0" />
              )}
              <span className="min-w-0 flex-1 font-mono text-[10px] text-foreground-tertiary">
                {part.type}
              </span>
              <ChevronDown
                size={12}
                strokeWidth={1.5}
                className={`shrink-0 text-foreground-tertiary transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              />
            </div>
            <div className="ml-11 pl-2">
              {isExpanded ? (
                <HighlightedPre
                  text={part.fullText}
                  language={inferLanguage(part.fullText)}
                  className={DEBUG_TEXT}
                />
              ) : (
                <span className="block truncate font-mono text-[10px] leading-4 text-foreground-secondary">
                  {part.preview}
                </span>
              )}
            </div>
          </button>
        );
      })}
      {entry.usageMeta && (
        <div className="ml-11 pl-2 py-0.5 font-mono text-[10px] text-foreground-tertiary" data-testid="chat-debug-usage-meta">
          {'↳ '}in:{entry.usageMeta.input} out:{entry.usageMeta.output} cache:{entry.usageMeta.cacheRead}
          {' · '}{formatCost(entry.usageMeta.cost)}
          {' · '}{entry.usageMeta.stopReason}
        </div>
      )}
      {entry.rawJson && (
        <div className="ml-11 pl-2 pt-1">
          <RawJsonToggle
            label="Raw JSON"
            open={rawJsonOpen}
            onToggle={onToggleRawJson}
            json={entry.rawJson}
          />
        </div>
      )}
    </div>
  );
}

function buildUserParts(message: Message): ContentPart[] {
  if (typeof message.content === 'string') {
    return [{ type: 'text', preview: truncatePreview(message.content), fullText: message.content }];
  }
  return (message.content as Array<{ type: string; text?: string; data?: string; mimeType?: string }>).map((block) => {
    if (block.type === 'text' && block.text) {
      return { type: 'text', preview: truncatePreview(block.text), fullText: block.text };
    }
    if (block.type === 'image') {
      const label = `[image: ${block.mimeType ?? 'unknown'}]`;
      return { type: 'image', preview: label, fullText: label };
    }
    return { type: block.type, preview: '(unknown block)', fullText: JSON.stringify(block, null, 2) };
  });
}

function buildAssistantParts(message: AssistantMessage): ContentPart[] {
  return message.content.map((block) => {
    if (block.type === 'text') {
      return { type: 'text', preview: truncatePreview(block.text), fullText: block.text };
    }
    if (block.type === 'thinking') {
      if (block.redacted) {
        return { type: 'thinking (redacted)', preview: '(content redacted by provider)', fullText: '(content redacted by provider)' };
      }
      return { type: 'thinking', preview: truncatePreview(block.thinking), fullText: block.thinking };
    }
    if (block.type === 'toolCall') {
      const summary = summarizeToolCall(block);
      return { type: 'toolCall', preview: summary, fullText: JSON.stringify(block.arguments, null, 2) };
    }
    return { type: 'unknown', preview: '(unknown block)', fullText: JSON.stringify(block, null, 2) };
  });
}

function buildToolResultParts(message: ToolResultMessage): ContentPart[] {
  const typeLabel = message.isError ? `${message.toolName} (error)` : message.toolName;
  return (message.content as Array<{ type: string; text?: string; data?: string; mimeType?: string }>).map((block) => {
    if (block.type === 'text' && block.text) {
      return { type: typeLabel, preview: truncatePreview(block.text), fullText: block.text };
    }
    if (block.type === 'image') {
      const label = `[image: ${block.mimeType ?? 'unknown'}]`;
      return { type: typeLabel, preview: label, fullText: label };
    }
    return { type: typeLabel, preview: '(unknown block)', fullText: JSON.stringify(block, null, 2) };
  });
}

function buildToolsParts(snapshot: AgentDebugSnapshot): ContentPart[] {
  return snapshot.tools.map((tool) => ({
    type: tool.name,
    preview: truncatePreview(tool.description),
    fullText: tool.schema,
  }));
}

function buildUsageMeta(originalMessage: Message): UsageMeta | undefined {
  if (originalMessage.role !== 'assistant') return undefined;
  const assistantMsg = originalMessage as AssistantMessage;
  const usage = assistantMsg.usage;
  if (!usage) return undefined;
  return {
    input: usage.input,
    output: usage.output,
    cacheRead: usage.cacheRead,
    cacheWrite: usage.cacheWrite,
    cost: usage.cost.total,
    stopReason: assistantMsg.stopReason ?? 'unknown',
  };
}

function buildConversationEntries(snapshot: AgentDebugSnapshot): ConversationEntry[] {
  const sanitizedMessages = snapshot.messages.map((message) => sanitizeDebugValue(message) as Message);

  const entries: ConversationEntry[] = [{
    id: 'system-prompt',
    role: 'SYSTEM',
    contentParts: [{ type: 'text', preview: truncatePreview(snapshot.systemPrompt), fullText: snapshot.systemPrompt || '(empty)' }],
    rawJson: null,
  }];

  // Tools entry (after system, before user messages)
  if (snapshot.tools.length > 0) {
    entries.push({
      id: 'tools',
      role: 'TOOLS',
      contentParts: buildToolsParts(snapshot),
      rawJson: null,
    });
  }

  sanitizedMessages.forEach((message, index) => {
    const inspector = snapshot.messageInspectors[index];
    const originalMessage = snapshot.messages[index];

    if (message.role === 'toolResult') {
      entries.push({
        id: inspector.id,
        role: 'TOOL',
        contentParts: buildToolResultParts(message),
        rawJson: inspector.json,
      });
      return;
    }

    if (message.role === 'assistant') {
      entries.push({
        id: inspector.id,
        role: 'ASST',
        contentParts: buildAssistantParts(message),
        rawJson: inspector.json,
        usageMeta: buildUsageMeta(originalMessage),
      });
      return;
    }

    entries.push({
      id: inspector.id,
      role: 'USER',
      contentParts: buildUserParts(message),
      rawJson: inspector.json,
    });
  });

  return entries;
}

export function ChatDebugPanel({ debug }: ChatDebugPanelProps) {
  const [contextOpen, setContextOpen] = useState(false);
  const [expandedParts, togglePart] = useToggleMap();
  const [expandedMessageJson, toggleMessageJson] = useToggleMap();
  const { snapshot, error, loading } = useChatDebugSnapshot(debug);

  const conversationEntries = useMemo(
    () => snapshot ? buildConversationEntries(snapshot) : [],
    [snapshot],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-2">
        <div className="text-[11px] font-medium text-foreground">Chat Debug</div>
        <div className="font-mono text-[10px] text-foreground-tertiary">
          {debug.provider} / {debug.modelId}
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-border bg-background px-3 py-3 font-mono text-[10px] text-foreground-tertiary">
          Loading live context snapshot…
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-3 font-mono text-[10px] text-destructive">
          Live snapshot failed to load: {error}
        </div>
      )}

      {snapshot && (
        <>
          <ContextSummaryBar
            snapshot={snapshot}
            open={contextOpen}
            onToggle={() => setContextOpen((value) => !value)}
          />

          <div className="space-y-1.5">
            {conversationEntries.length === 0 ? (
              <div className="font-mono text-[10px] text-foreground-tertiary">No messages in context.</div>
            ) : (
              conversationEntries.map((entry) => (
                <ConversationRow
                  key={entry.id}
                  entry={entry}
                  expandedParts={expandedParts}
                  rawJsonOpen={expandedMessageJson[entry.id] ?? false}
                  onTogglePart={togglePart}
                  onToggleRawJson={() => toggleMessageJson(entry.id)}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

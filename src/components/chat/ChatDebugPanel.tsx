import { useMemo, useState, type ReactNode } from 'react';
import type { AssistantMessage, Message, ToolCall, ToolResultMessage } from '@mariozechner/pi-ai';
import type { AgentDebugState } from '../../hooks/use-agent.js';
import { useChatDebugSnapshot } from '../../hooks/use-chat-debug-snapshot.js';
import type { AgentDebugSnapshot, ChatTurnDebugRecord, DebugMessageInspector, DebugTokenEstimate } from '../../lib/ai-debug.js';
import { sanitizeDebugValue } from '../../lib/ai-debug.js';
import { highlightCode } from '../../lib/code-highlight.js';
import { ChevronDown } from '../../lib/icons.js';

interface ChatDebugPanelProps {
  debug: AgentDebugState;
}

type DisplayRole = 'SYSTEM' | 'USER' | 'ASST' | 'TOOL';

interface ConversationToolEntry {
  id: string;
  summary: string;
  argumentsJson: string;
  resultPreview: string;
  resultText: string | null;
  resultJson: string | null;
  resultIsError: boolean;
}

interface ConversationEntry {
  id: string;
  role: DisplayRole;
  preview: string;
  fullText: string;
  rawJson: string | null;
  toolEntries: ConversationToolEntry[];
}

interface TurnJsonState {
  request: boolean;
  response: boolean;
}

const DEBUG_TEXT = 'max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-4 text-foreground-secondary';
const DEBUG_CODE = 'max-h-80 overflow-auto whitespace-pre font-mono text-[10px] leading-4 text-foreground-secondary';
const DEBUG_CODE_CARD = `${DEBUG_CODE} rounded-xl border border-border/80 bg-background px-2.5 py-2`;
const PANEL_CARD = 'overflow-hidden rounded-xl border border-border bg-background';

function formatTokenCount(value: number): string {
  return `~${Math.round(value).toLocaleString()}`;
}

function formatUsagePercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return 'running';
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
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
      return 'text-amber-700';
    default:
      return 'text-foreground-tertiary';
  }
}

function toolBadgeClass(): string {
  return 'border-amber-500/30 bg-amber-500/10 text-amber-700';
}

function turnStatusClass(status: ChatTurnDebugRecord['status']): string {
  switch (status) {
    case 'completed':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700';
    case 'error':
      return 'border-destructive/30 bg-destructive/10 text-destructive';
    case 'aborted':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-700';
    case 'interrupted':
      return 'border-border bg-background text-foreground-tertiary';
    default:
      return 'border-border bg-background text-foreground-tertiary';
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

function blockToText(block: Record<string, unknown>): string {
  if (block.type === 'text' && typeof block.text === 'string') {
    return block.text;
  }

  if (block.type === 'image' && typeof block.mimeType === 'string') {
    return `[image: ${block.mimeType}]`;
  }

  return '';
}

function extractArrayContentText(content: unknown[]): string {
  return content
    .map((block) => block && typeof block === 'object' ? blockToText(block as Record<string, unknown>) : '')
    .filter(Boolean)
    .join('\n');
}

function extractMessageText(message: Message): string {
  if (message.role === 'assistant') {
    return extractAssistantText(message);
  }

  if (typeof message.content === 'string') {
    return message.content;
  }

  return extractArrayContentText(message.content as unknown[]);
}

function extractAssistantText(message: AssistantMessage): string {
  return message.content
    .map((block) => {
      if (block.type === 'text') return block.text;
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function extractToolResultText(result: ToolResultMessage): string {
  return extractArrayContentText(result.content as unknown[]);
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
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-1 font-mono text-[10px] text-foreground-tertiary transition-colors hover:border-foreground/20 hover:text-foreground"
      >
        <span>{label}</span>
        <ChevronDown
          size={12}
          strokeWidth={1.8}
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <DebugCodeBlock text={json} language="json" />
      )}
    </div>
  );
}

function DebugSection({
  title,
  meta,
  open,
  onToggle,
  children,
}: {
  title: string;
  meta?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={PANEL_CARD}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className="min-w-0 flex-1 text-[11px] font-medium text-foreground">{title}</span>
        {meta && (
          <span className="font-mono text-[10px] text-foreground-tertiary">{meta}</span>
        )}
        <ChevronDown
          size={14}
          strokeWidth={1.8}
          className={`shrink-0 text-foreground-tertiary transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="border-t border-border/80 px-3 py-3">
          {children}
        </div>
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
            strokeWidth={1.8}
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
        <div className="border-t border-border/80 px-3 py-3">
          <TokenBreakdown tokenEstimate={snapshot.tokenEstimate} />
        </div>
      )}
    </div>
  );
}

function ToolDetail({
  tool,
  open,
  onToggle,
}: {
  tool: ConversationToolEntry;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="ml-[52px] rounded-lg border border-border/70 bg-foreground/[0.02]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-2 px-2.5 py-2 text-left"
      >
        <span className={`mt-0.5 rounded-full border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.04em] ${toolBadgeClass()}`}>
          TOOL
        </span>
        <div className="min-w-0 flex-1 font-mono text-[10px] leading-4">
          <div className="truncate text-foreground">{tool.summary}</div>
          <div className="mt-0.5 truncate text-foreground-tertiary">
            {tool.resultPreview}
          </div>
        </div>
        <ChevronDown
          size={14}
          strokeWidth={1.8}
          className={`mt-0.5 shrink-0 text-foreground-tertiary transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="space-y-2 border-t border-border/70 px-2.5 py-2.5">
          <div>
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.04em] text-foreground-tertiary">Input</div>
            <DebugCodeBlock text={tool.argumentsJson} language="json" />
          </div>
          {tool.resultText && (
            <div>
              <div className={`mb-1 font-mono text-[10px] uppercase tracking-[0.04em] ${tool.resultIsError ? 'text-destructive' : 'text-foreground-tertiary'}`}>
                Output
              </div>
              <DebugCodeBlock
                text={tool.resultText}
                language={inferLanguage(tool.resultText)}
                wrap
              />
            </div>
          )}
          {tool.resultJson && (
            <div className="font-mono text-[10px] text-foreground-tertiary">
              Sanitized tool result available.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ConversationRow({
  entry,
  open,
  rawJsonOpen,
  onToggle,
  onToggleRawJson,
  expandedTools,
  onToggleTool,
}: {
  entry: ConversationEntry;
  open: boolean;
  rawJsonOpen: boolean;
  onToggle: () => void;
  onToggleRawJson: () => void;
  expandedTools: Record<string, boolean>;
  onToggleTool: (id: string) => void;
}) {
  return (
    <div className="space-y-1.5" data-testid="chat-debug-message-row">
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-start gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-foreground/[0.03] ${open ? 'bg-foreground/[0.03]' : ''}`}
      >
        <span className={`w-11 shrink-0 pt-0.5 font-mono text-[10px] uppercase tracking-[0.04em] ${roleBadgeClass(entry.role)}`}>
          {entry.role}
        </span>
        {open ? (
          <div className="min-w-0 flex-1 space-y-2">
            <HighlightedPre
              text={entry.fullText}
              language={inferLanguage(entry.fullText)}
              className={DEBUG_TEXT}
            />
          </div>
        ) : (
          <span className="min-w-0 flex-1 font-mono text-[10px] leading-4 text-foreground-secondary">
            {entry.preview}
          </span>
        )}
        <ChevronDown
          size={14}
          strokeWidth={1.8}
          className={`mt-0.5 shrink-0 text-foreground-tertiary transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && entry.rawJson && (
        <div className="ml-[52px]">
          <RawJsonToggle
            label="Raw JSON"
            open={rawJsonOpen}
            onToggle={onToggleRawJson}
            json={entry.rawJson}
          />
        </div>
      )}

      {entry.toolEntries.map((tool) => (
        <ToolDetail
          key={tool.id}
          tool={tool}
          open={expandedTools[tool.id] ?? false}
          onToggle={() => onToggleTool(tool.id)}
        />
      ))}
    </div>
  );
}

function TurnPayloadSection({
  title,
  meta,
  rawJson,
  rawJsonOpen,
  onToggleRawJson,
  children,
}: {
  title: string;
  meta: string;
  rawJson: string;
  rawJsonOpen: boolean;
  onToggleRawJson: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-background px-2.5 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.04em] text-foreground">{title}</div>
        <div className="font-mono text-[10px] text-foreground-tertiary">{meta}</div>
      </div>
      <div className="space-y-2">
        {children}
        <RawJsonToggle
          label="Raw JSON"
          open={rawJsonOpen}
          onToggle={onToggleRawJson}
          json={rawJson}
        />
      </div>
    </div>
  );
}

function TurnRow({
  turn,
  turnNumber,
  open,
  rawJsonOpen,
  onToggle,
  onToggleRequestJson,
  onToggleResponseJson,
}: {
  turn: ChatTurnDebugRecord;
  turnNumber: number;
  open: boolean;
  rawJsonOpen: TurnJsonState;
  onToggle: () => void;
  onToggleRequestJson: () => void;
  onToggleResponseJson: () => void;
}) {
  const usage = turn.response.usage;
  const summary = [
    `Turn ${turnNumber}`,
    formatDuration(turn.durationMs),
    formatCost(usage?.cost.total),
  ].join(' · ');

  return (
    <div className={PANEL_CARD}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className="min-w-0 flex-1 font-mono text-[10px] text-foreground">{summary}</span>
        <span className={`rounded-full border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.04em] ${turnStatusClass(turn.status)}`}>
          {turn.status}
        </span>
        <ChevronDown
          size={14}
          strokeWidth={1.8}
          className={`shrink-0 text-foreground-tertiary transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-border/80 px-3 py-3">
          <TurnPayloadSection
            title="Request"
            meta={`${formatCount(turn.request.messageCount, 'msg')} · ${formatCount(turn.request.toolCount, 'tool')}`}
            rawJson={turn.request.json}
            rawJsonOpen={rawJsonOpen.request}
            onToggleRawJson={onToggleRequestJson}
          >
            <TokenBreakdown tokenEstimate={turn.request.tokenEstimate} />
          </TurnPayloadSection>

          <TurnPayloadSection
            title="Response"
            meta={turn.response.stopReason ?? (turn.status === 'interrupted' ? 'interrupted' : 'pending')}
            rawJson={turn.response.json}
            rawJsonOpen={rawJsonOpen.response}
            onToggleRawJson={onToggleResponseJson}
          >
            <div className="space-y-1 font-mono text-[10px] text-foreground-secondary">
              <div className="flex items-center justify-between">
                <span>tool results</span>
                <span>{turn.response.toolResultCount}</span>
              </div>
              {usage && (
                <>
                  <div className="flex items-center justify-between">
                    <span>input tokens</span>
                    <span>{usage.input.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>output tokens</span>
                    <span>{usage.output.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>cache read</span>
                    <span>{usage.cacheRead.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>cache write</span>
                    <span>{usage.cacheWrite.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-foreground">
                    <span>total cost</span>
                    <span>{formatCost(usage.cost.total)}</span>
                  </div>
                </>
              )}
              {turn.response.errorMessage && (
                <div className="text-destructive">
                  error: {turn.response.errorMessage}
                </div>
              )}
            </div>
          </TurnPayloadSection>
        </div>
      )}
    </div>
  );
}

function ToolSchemaRow({
  tool,
  open,
  onToggle,
}: {
  tool: AgentDebugSnapshot['tools'][number];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/80 bg-background">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-2 px-2.5 py-2 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] text-foreground">{tool.name}</div>
          <div className="mt-1 font-mono text-[10px] leading-4 text-foreground-secondary">
            {tool.description}
          </div>
        </div>
        <ChevronDown
          size={14}
          strokeWidth={1.8}
          className={`shrink-0 text-foreground-tertiary transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="border-t border-border/80 px-2.5 py-2">
          <DebugCodeBlock text={tool.schema} language="json" />
        </div>
      )}
    </div>
  );
}

function buildConversationEntries(snapshot: AgentDebugSnapshot): ConversationEntry[] {
  const sanitizedMessages = snapshot.messages.map((message) => sanitizeDebugValue(message) as Message);
  const toolResultMap = new Map<string, { message: ToolResultMessage; inspector: DebugMessageInspector }>();

  sanitizedMessages.forEach((message, index) => {
    if (message.role !== 'toolResult') return;
    toolResultMap.set(message.toolCallId, {
      message,
      inspector: snapshot.messageInspectors[index],
    });
  });

  const entries: ConversationEntry[] = [{
    id: 'system-prompt',
    role: 'SYSTEM',
    preview: truncatePreview(snapshot.systemPrompt),
    fullText: snapshot.systemPrompt || '(empty)',
    rawJson: null,
    toolEntries: [],
  }];

  sanitizedMessages.forEach((message, index) => {
    const inspector = snapshot.messageInspectors[index];

    if (message.role === 'toolResult') {
      const resultText = extractToolResultText(message);
      entries.push({
        id: inspector.id,
        role: 'TOOL',
        preview: inspector.summary,
        fullText: resultText || '(empty)',
        rawJson: inspector.json,
        toolEntries: [],
      });
      return;
    }

    if (message.role === 'assistant') {
      const toolEntries = message.content
        .filter((block): block is ToolCall => block.type === 'toolCall')
        .map((toolCall) => {
          const result = toolResultMap.get(toolCall.id);
          const resultText = result ? extractToolResultText(result.message) : null;
          return {
            id: toolCall.id,
            summary: summarizeToolCall(toolCall),
            argumentsJson: JSON.stringify(toolCall.arguments, null, 2),
            resultPreview: result ? truncatePreview(result.inspector.summary) : 'Waiting for result…',
            resultText: resultText && resultText.trim().length > 0 ? resultText : result ? '(empty)' : null,
            resultJson: result?.inspector.json ?? null,
            resultIsError: result?.message.isError === true,
          } satisfies ConversationToolEntry;
        });

      entries.push({
        id: inspector.id,
        role: 'ASST',
        preview: inspector.summary,
        fullText: extractAssistantText(message) || '(tool calls only)',
        rawJson: inspector.json,
        toolEntries,
      });
      return;
    }

    entries.push({
      id: inspector.id,
      role: 'USER',
      preview: inspector.summary,
      fullText: extractMessageText(message) || '(empty)',
      rawJson: inspector.json,
      toolEntries: [],
    });
  });

  return entries;
}

export function ChatDebugPanel({ debug }: ChatDebugPanelProps) {
  const [contextOpen, setContextOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [expandedMessages, toggleMessage] = useToggleMap();
  const [expandedMessageJson, toggleMessageJson] = useToggleMap();
  const [expandedConversationTools, toggleConversationTool] = useToggleMap();
  const [expandedTurns, toggleTurn] = useToggleMap();
  const [expandedTurnRequestJson, toggleTurnRequestJson] = useToggleMap();
  const [expandedTurnResponseJson, toggleTurnResponseJson] = useToggleMap();
  const [expandedToolSchemas, toggleToolSchema] = useToggleMap();
  const { snapshot, error, loading } = useChatDebugSnapshot(debug);

  const conversationEntries = useMemo(
    () => snapshot ? buildConversationEntries(snapshot) : [],
    [snapshot],
  );

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-foreground/[0.02] p-2.5">
      <div className="flex items-center justify-between px-1">
        <div className="text-[11px] font-medium text-foreground">Chat Debug</div>
        <div className="font-mono text-[10px] text-foreground-tertiary">
          {debug.provider} / {debug.modelId}
        </div>
      </div>

      {loading && (
        <div className="rounded-2xl border border-border bg-background px-3 py-3 font-mono text-[10px] text-foreground-tertiary">
          Loading live context snapshot…
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-3 py-3 font-mono text-[10px] text-destructive">
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

          <div className="space-y-1.5 px-1">
            {conversationEntries.length === 0 ? (
              <div className="font-mono text-[10px] text-foreground-tertiary">No messages in context.</div>
            ) : (
              conversationEntries.map((entry) => (
                <ConversationRow
                  key={entry.id}
                  entry={entry}
                  open={expandedMessages[entry.id] ?? false}
                  rawJsonOpen={expandedMessageJson[entry.id] ?? false}
                  onToggle={() => toggleMessage(entry.id)}
                  onToggleRawJson={() => toggleMessageJson(entry.id)}
                  expandedTools={expandedConversationTools}
                  onToggleTool={toggleConversationTool}
                />
              ))
            )}
          </div>

          {debug.turns.length > 0 && (
            <div className="space-y-2 pt-1">
              {debug.turns.map((turn, index) => (
                <TurnRow
                  key={turn.id}
                  turn={turn}
                  turnNumber={index + 1}
                  open={expandedTurns[turn.id] ?? false}
                  rawJsonOpen={{
                    request: expandedTurnRequestJson[turn.id] ?? false,
                    response: expandedTurnResponseJson[turn.id] ?? false,
                  }}
                  onToggle={() => toggleTurn(turn.id)}
                  onToggleRequestJson={() => toggleTurnRequestJson(turn.id)}
                  onToggleResponseJson={() => toggleTurnResponseJson(turn.id)}
                />
              ))}
            </div>
          )}

          <DebugSection
            title="Tools"
            meta={`${snapshot.tools.length}`}
            open={toolsOpen}
            onToggle={() => setToolsOpen((value) => !value)}
          >
            <div className="space-y-2">
              {snapshot.tools.length === 0 ? (
                <div className="font-mono text-[10px] text-foreground-tertiary">No registered tools.</div>
              ) : (
                snapshot.tools.map((tool) => (
                  <ToolSchemaRow
                    key={tool.id}
                    tool={tool}
                    open={expandedToolSchemas[tool.id] ?? false}
                    onToggle={() => toggleToolSchema(tool.id)}
                  />
                ))
              )}
            </div>
          </DebugSection>
        </>
      )}
    </div>
  );
}

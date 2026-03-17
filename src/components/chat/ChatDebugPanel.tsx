import { useMemo, useState, type ReactNode } from 'react';
import type { AssistantMessage, Message, ToolCall, ToolResultMessage } from '@mariozechner/pi-ai';
import type { AgentDebugState } from '../../hooks/use-agent.js';
import { useChatDebugSnapshot } from '../../hooks/use-chat-debug-snapshot.js';
import type { AgentDebugSnapshot, ChatTurnDebugRecord, DebugTokenEstimate } from '../../lib/ai-debug.js';
import { sanitizeDebugValue } from '../../lib/ai-debug.js';
import { highlightCode } from '../../lib/code-highlight.js';
import { ChevronDown } from '../../lib/icons.js';

interface ChatDebugPanelProps {
  debug: AgentDebugState;
}

type DisplayRole = 'SYSTEM' | 'USER' | 'ASST' | 'TOOL';

interface ContentPart {
  type: string;
  preview: string;
  fullText: string;
}

interface ConversationEntry {
  id: string;
  role: DisplayRole;
  roleMeta?: string;
  contentParts: ContentPart[];
  rawJson: string | null;
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
  const roleLabel = entry.roleMeta ? `${entry.role} · ${entry.roleMeta}` : entry.role;

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
            className={`flex w-full items-start gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-foreground/[0.03] ${isExpanded ? 'bg-foreground/[0.03]' : ''}`}
          >
            {partIndex === 0 ? (
              <span className={`w-11 shrink-0 pt-0.5 font-mono text-[10px] uppercase tracking-[0.04em] ${roleBadgeClass(entry.role)}`}>
                {roleLabel}
              </span>
            ) : (
              <span className="w-11 shrink-0" />
            )}
            <span className="w-14 shrink-0 pt-0.5 font-mono text-[9px] text-foreground-tertiary">
              {part.type}
            </span>
            {isExpanded ? (
              <div className="min-w-0 flex-1">
                <HighlightedPre
                  text={part.fullText}
                  language={inferLanguage(part.fullText)}
                  className={DEBUG_TEXT}
                />
              </div>
            ) : (
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] leading-4 text-foreground-secondary">
                {part.preview}
              </span>
            )}
            <ChevronDown
              size={12}
              strokeWidth={1.8}
              className={`mt-0.5 shrink-0 text-foreground-tertiary transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            />
          </button>
        );
      })}
      {entry.rawJson && (
        <div className="ml-[108px] pt-1">
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

function buildConversationEntries(snapshot: AgentDebugSnapshot): ConversationEntry[] {
  const sanitizedMessages = snapshot.messages.map((message) => sanitizeDebugValue(message) as Message);

  const entries: ConversationEntry[] = [{
    id: 'system-prompt',
    role: 'SYSTEM',
    contentParts: [{ type: 'text', preview: truncatePreview(snapshot.systemPrompt), fullText: snapshot.systemPrompt || '(empty)' }],
    rawJson: null,
  }];

  sanitizedMessages.forEach((message, index) => {
    const inspector = snapshot.messageInspectors[index];

    if (message.role === 'toolResult') {
      entries.push({
        id: inspector.id,
        role: 'TOOL',
        roleMeta: message.toolName,
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
  const [toolsOpen, setToolsOpen] = useState(false);
  const [expandedParts, togglePart] = useToggleMap();
  const [expandedMessageJson, toggleMessageJson] = useToggleMap();
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
                  expandedParts={expandedParts}
                  rawJsonOpen={expandedMessageJson[entry.id] ?? false}
                  onTogglePart={togglePart}
                  onToggleRawJson={() => toggleMessageJson(entry.id)}
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

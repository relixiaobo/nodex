import { useMemo, useState } from 'react';
import type { AgentDebugState } from '../../hooks/use-agent.js';
import { useChatDebugSnapshot } from '../../hooks/use-chat-debug-snapshot.js';
import type { AgentDebugSnapshot, ChatTurnDebugRecord } from '../../lib/ai-debug.js';
import { ChevronDown } from '../../lib/icons.js';

type SectionKey = 'turns' | 'system' | 'context' | 'messages' | 'tools' | 'tokens';

interface ChatDebugPanelProps {
  debug: AgentDebugState;
}

const DEFAULT_SECTION_STATE: Record<SectionKey, boolean> = {
  turns: true,
  system: false,
  context: false,
  messages: false,
  tools: false,
  tokens: true,
};

function sectionPlaceholder(tagName: 'panel-context' | 'page-context' | 'time-context'): string {
  return `<${tagName}>\nUnavailable\n</${tagName}>`;
}

function formatTokenCount(value: number): string {
  return `~${Math.round(value).toLocaleString()}`;
}

function formatUsagePercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatTimestamp(value: number): string {
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return 'running';
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(1)} s`;
}

function formatCost(value: number | null | undefined): string {
  if (typeof value !== 'number') return 'n/a';
  return `$${value.toFixed(4)}`;
}

function messageBadgeClass(kind: AgentDebugSnapshot['messageInspectors'][number]['kind']): string {
  switch (kind) {
    case 'tool_result':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-700';
    case 'tool_use':
      return 'border-primary/25 bg-primary/10 text-primary';
    default:
      return 'border-border bg-background text-foreground-tertiary';
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

function DebugSection({
  title,
  open,
  onToggle,
  meta,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background">
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

function DebugCodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-border/80 bg-background px-2.5 py-2 font-mono text-[10px] leading-4 text-foreground-secondary">
      {children}
    </pre>
  );
}

function TurnLogCard({
  turn,
  turnNumber,
  requestOpen,
  responseOpen,
  onToggleRequest,
  onToggleResponse,
}: {
  turn: ChatTurnDebugRecord;
  turnNumber: number;
  requestOpen: boolean;
  responseOpen: boolean;
  onToggleRequest: () => void;
  onToggleResponse: () => void;
}) {
  const usage = turn.response.usage;

  return (
    <div className="overflow-hidden rounded-xl border border-border/80 bg-foreground/[0.02]">
      <div className="space-y-3 px-3 py-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.04em] text-foreground-tertiary">
                Turn {turnNumber}
              </span>
              <span className={`rounded-full border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.04em] ${turnStatusClass(turn.status)}`}>
                {turn.status}
              </span>
            </div>
            <div className="mt-1 font-mono text-[10px] leading-4 text-foreground">
              {turn.requestSummary}
            </div>
            <div className="mt-1 font-mono text-[10px] leading-4 text-foreground-secondary">
              {turn.responseSummary}
            </div>
            <div className="mt-1 font-mono text-[10px] leading-4 text-foreground-secondary">
              {turn.provider} / {turn.modelId} · {formatTimestamp(turn.startedAt)} · {formatDuration(turn.durationMs)}
            </div>
          </div>
        </div>

        <div className="space-y-1 font-mono text-[10px] text-foreground-secondary">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>stop: {turn.response.stopReason ?? (turn.status === 'interrupted' ? 'interrupted' : 'pending')}</span>
            <span>tool results: {turn.response.toolResultCount}</span>
            <span>request: {formatTokenCount(turn.request.tokenEstimate.total)}</span>
          </div>
          {usage && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>input: {usage.input.toLocaleString()}</span>
              <span>output: {usage.output.toLocaleString()}</span>
              <span>cache read: {usage.cacheRead.toLocaleString()}</span>
              <span>cache write: {usage.cacheWrite.toLocaleString()}</span>
              <span>total: {usage.totalTokens.toLocaleString()}</span>
              <span>cost: {formatCost(usage.cost.total)}</span>
            </div>
          )}
          {turn.response.errorMessage && (
            <div className="text-destructive">
              error: {turn.response.errorMessage}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <DebugSection
            title="Request"
            meta={`${turn.request.messageCount} msg · ${turn.request.toolCount} tools`}
            open={requestOpen}
            onToggle={onToggleRequest}
          >
            <div className="space-y-2">
              <div className="space-y-1 font-mono text-[10px] text-foreground-secondary">
                <div className="flex items-center justify-between">
                  <span>system prompt</span>
                  <span>{formatTokenCount(turn.request.tokenEstimate.systemPrompt)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>messages</span>
                  <span>{formatTokenCount(turn.request.tokenEstimate.messages)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>tools</span>
                  <span>{formatTokenCount(turn.request.tokenEstimate.tools)}</span>
                </div>
                <div className="flex items-center justify-between text-foreground">
                  <span>total</span>
                  <span>{formatTokenCount(turn.request.tokenEstimate.total)}</span>
                </div>
              </div>
              <DebugCodeBlock>{turn.request.json}</DebugCodeBlock>
            </div>
          </DebugSection>

          <DebugSection
            title="Response"
            meta={turn.response.stopReason ?? (turn.status === 'interrupted' ? 'interrupted' : 'pending')}
            open={responseOpen}
            onToggle={onToggleResponse}
          >
            <div className="space-y-2">
              {usage && (
                <div className="space-y-1 font-mono text-[10px] text-foreground-secondary">
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
                    <span>total tokens</span>
                    <span>{usage.totalTokens.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>total cost</span>
                    <span>{formatCost(usage.cost.total)}</span>
                  </div>
                </div>
              )}
              <DebugCodeBlock>{turn.response.json}</DebugCodeBlock>
            </div>
          </DebugSection>
        </div>
      </div>
    </div>
  );
}

export function ChatDebugPanel({ debug }: ChatDebugPanelProps) {
  const [expandedSections, setExpandedSections] = useState(DEFAULT_SECTION_STATE);
  const [expandedMessages, setExpandedMessages] = useState<Record<string, boolean>>({});
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [expandedTurnRequests, setExpandedTurnRequests] = useState<Record<string, boolean>>({});
  const [expandedTurnResponses, setExpandedTurnResponses] = useState<Record<string, boolean>>({});
  const { snapshot, error, loading } = useChatDebugSnapshot(debug);
  const turns = useMemo(() => [...debug.turns].reverse(), [debug.turns]);

  function toggleSection(section: SectionKey) {
    setExpandedSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }

  function toggleMessage(id: string) {
    setExpandedMessages((current) => ({
      ...current,
      [id]: !current[id],
    }));
  }

  function toggleTool(id: string) {
    setExpandedTools((current) => ({
      ...current,
      [id]: !current[id],
    }));
  }

  function toggleTurnRequest(id: string) {
    setExpandedTurnRequests((current) => ({
      ...current,
      [id]: !current[id],
    }));
  }

  function toggleTurnResponse(id: string) {
    setExpandedTurnResponses((current) => ({
      ...current,
      [id]: !current[id],
    }));
  }

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-foreground/[0.02] p-2.5">
      <div className="flex items-center justify-between px-1">
        <div className="text-[11px] font-medium text-foreground">Chat Debug</div>
        <div className="font-mono text-[10px] text-foreground-tertiary">
          {debug.provider} / {debug.modelId}
        </div>
      </div>

      <DebugSection
        title="Turn Log"
        meta={`${turns.length}`}
        open={expandedSections.turns}
        onToggle={() => toggleSection('turns')}
      >
        <div className="space-y-2">
          <div className="font-mono text-[10px] leading-4 text-foreground-tertiary">
            Captured from actual `streamFn` requests while AI Debug is enabled.
          </div>
          {turns.length === 0 ? (
            <div className="font-mono text-[10px] text-foreground-tertiary">
              No captured turn logs yet. Send a message while AI Debug is enabled to record the request and response.
            </div>
          ) : (
            turns.map((turn: ChatTurnDebugRecord, index: number) => (
              <TurnLogCard
                key={turn.id}
                turn={turn}
                turnNumber={debug.turns.length - index}
                requestOpen={expandedTurnRequests[turn.id] ?? false}
                responseOpen={expandedTurnResponses[turn.id] ?? true}
                onToggleRequest={() => toggleTurnRequest(turn.id)}
                onToggleResponse={() => toggleTurnResponse(turn.id)}
              />
            ))
          )}
        </div>
      </DebugSection>

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
          <div className="px-1 font-mono text-[10px] uppercase tracking-[0.04em] text-foreground-tertiary">
            Live Snapshot
          </div>

          <DebugSection
            title="System Prompt"
            meta={formatTokenCount(snapshot.tokenEstimate.systemPrompt)}
            open={expandedSections.system}
            onToggle={() => toggleSection('system')}
          >
            <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-4 text-foreground-secondary">
              {snapshot.systemPrompt || '(empty)'}
            </pre>
          </DebugSection>

          <DebugSection
            title="Dynamic Context"
            open={expandedSections.context}
            onToggle={() => toggleSection('context')}
          >
            <div className="space-y-2">
              {[
                snapshot.reminder.panelContext ?? sectionPlaceholder('panel-context'),
                snapshot.reminder.pageContext ?? sectionPlaceholder('page-context'),
                snapshot.reminder.timeContext ?? sectionPlaceholder('time-context'),
              ].map((block, index) => (
                <DebugCodeBlock key={`${index}-${block.slice(0, 24)}`}>{block}</DebugCodeBlock>
              ))}
            </div>
          </DebugSection>

          <DebugSection
            title="Messages Inspector"
            meta={`${snapshot.messages.length}`}
            open={expandedSections.messages}
            onToggle={() => toggleSection('messages')}
          >
            <div className="space-y-2">
              {snapshot.messageInspectors.length === 0 ? (
                <div className="font-mono text-[10px] text-foreground-tertiary">No messages in context.</div>
              ) : (
                snapshot.messageInspectors.map((message) => (
                  <div key={message.id} className="overflow-hidden rounded-xl border border-border/80 bg-background">
                    <button
                      type="button"
                      onClick={() => toggleMessage(message.id)}
                      className="flex w-full items-start gap-2 px-2.5 py-2 text-left"
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-2">
                        <span className="font-mono text-[10px] uppercase text-foreground-tertiary">
                          {message.role}
                        </span>
                        <span className="min-w-0 flex-1 font-mono text-[10px] leading-4 text-foreground-secondary">
                          {message.summary}
                        </span>
                      </div>
                      <span className={`rounded-full border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.04em] ${messageBadgeClass(message.kind)}`}>
                        {message.kind}
                      </span>
                      <ChevronDown
                        size={14}
                        strokeWidth={1.8}
                        className={`shrink-0 text-foreground-tertiary transition-transform ${expandedMessages[message.id] ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {expandedMessages[message.id] && (
                      <div className="border-t border-border/80 px-2.5 py-2">
                        <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-4 text-foreground-secondary">
                          {message.json}
                        </pre>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </DebugSection>

          <DebugSection
            title="Tools"
            meta={`${snapshot.tools.length}`}
            open={expandedSections.tools}
            onToggle={() => toggleSection('tools')}
          >
            <div className="space-y-2">
              {snapshot.tools.length === 0 ? (
                <div className="font-mono text-[10px] text-foreground-tertiary">No registered tools.</div>
              ) : (
                snapshot.tools.map((tool) => (
                  <div key={tool.id} className="overflow-hidden rounded-xl border border-border/80 bg-background">
                    <button
                      type="button"
                      onClick={() => toggleTool(tool.id)}
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
                        className={`shrink-0 text-foreground-tertiary transition-transform ${expandedTools[tool.id] ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {expandedTools[tool.id] && (
                      <div className="border-t border-border/80 px-2.5 py-2">
                        <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-4 text-foreground-secondary">
                          {tool.schema}
                        </pre>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </DebugSection>

          <DebugSection
            title="Token Estimate"
            meta={formatTokenCount(snapshot.tokenEstimate.total)}
            open={expandedSections.tokens}
            onToggle={() => toggleSection('tokens')}
          >
            <div className="space-y-3">
              <div className="space-y-1 font-mono text-[10px] text-foreground-secondary">
                <div className="flex items-center justify-between">
                  <span>system prompt</span>
                  <span>{formatTokenCount(snapshot.tokenEstimate.systemPrompt)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>messages</span>
                  <span>{formatTokenCount(snapshot.tokenEstimate.messages)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>tools</span>
                  <span>{formatTokenCount(snapshot.tokenEstimate.tools)}</span>
                </div>
                <div className="flex items-center justify-between text-foreground">
                  <span>total</span>
                  <span>{formatTokenCount(snapshot.tokenEstimate.total)}</span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between font-mono text-[10px] text-foreground-secondary">
                  <span>context window</span>
                  <span>
                    {snapshot.tokenEstimate.contextWindow.toLocaleString()} · {formatUsagePercent(snapshot.tokenEstimate.usagePercent)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]">
                  <div
                    className="h-full rounded-full bg-primary/60"
                    style={{ width: `${snapshot.tokenEstimate.usagePercent}%` }}
                  />
                </div>
              </div>
            </div>
          </DebugSection>
        </>
      )}
    </div>
  );
}

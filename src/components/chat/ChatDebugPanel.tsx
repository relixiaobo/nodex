import { useEffect, useState } from 'react';
import type { AgentDebugState } from '../../hooks/use-agent.js';
import { collectAgentDebugSnapshot, type AgentDebugSnapshot } from '../../lib/ai-debug.js';
import { ChevronDown } from '../../lib/icons.js';
import { useUIStore } from '../../stores/ui-store.js';

type SectionKey = 'system' | 'context' | 'messages' | 'tools' | 'tokens';

interface ChatDebugPanelProps {
  debug: AgentDebugState;
}

const DEFAULT_SECTION_STATE: Record<SectionKey, boolean> = {
  system: true,
  context: true,
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

export function ChatDebugPanel({ debug }: ChatDebugPanelProps) {
  const panelHistory = useUIStore((state) => state.panelHistory);
  const panelIndex = useUIStore((state) => state.panelIndex);
  const [expandedSections, setExpandedSections] = useState(DEFAULT_SECTION_STATE);
  const [expandedMessages, setExpandedMessages] = useState<Record<string, boolean>>({});
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [tabRefreshVersion, setTabRefreshVersion] = useState(0);
  const [snapshot, setSnapshot] = useState<AgentDebugSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleTabRefresh() {
      setTabRefreshVersion((value) => value + 1);
    }

    window.addEventListener('focus', handleTabRefresh);

    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.onActivated?.addListener(handleTabRefresh);
      chrome.tabs.onUpdated?.addListener(handleTabRefresh);
    }

    return () => {
      window.removeEventListener('focus', handleTabRefresh);
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.onActivated?.removeListener(handleTabRefresh);
        chrome.tabs.onUpdated?.removeListener(handleTabRefresh);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void collectAgentDebugSnapshot(debug)
      .then((nextSnapshot) => {
        if (cancelled) return;
        setSnapshot(nextSnapshot);
        setError(null);
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      });

    return () => {
      cancelled = true;
    };
  }, [debug, panelHistory, panelIndex, tabRefreshVersion]);

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

  if (!snapshot && !error) {
    return (
      <div className="rounded-2xl border border-border bg-foreground/[0.02] px-3 py-3 font-mono text-[10px] text-foreground-tertiary">
        Loading debug context…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-3 py-3 font-mono text-[10px] text-destructive">
        Debug panel failed to load: {error}
      </div>
    );
  }

  if (!snapshot) {
    return null;
  }

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-foreground/[0.02] p-2.5">
      <div className="flex items-center justify-between px-1">
        <div className="text-[11px] font-medium text-foreground">Chat Debug</div>
        <div className="font-mono text-[10px] text-foreground-tertiary">
          {snapshot.provider} / {snapshot.modelId}
        </div>
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
            <pre
              key={`${index}-${block.slice(0, 24)}`}
              className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-border/80 bg-background px-2.5 py-2 font-mono text-[10px] leading-4 text-foreground-secondary"
            >
              {block}
            </pre>
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
    </div>
  );
}

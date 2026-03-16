import type { AgentMessage, AgentTool } from '@mariozechner/pi-agent-core';
import type {
  AssistantMessage,
  Context,
  Message,
  Model,
  StopReason,
  Tool,
  ToolResultMessage,
  Usage,
} from '@mariozechner/pi-ai';
import { prepareAgentContext, type PreparedAgentContext } from './ai-context.js';

const CHAT_DEBUG_STORAGE_KEY = 'soma-chat-debug-enabled';

export interface AgentDebugSource {
  revision: number;
  systemPrompt: string;
  messages: AgentMessage[];
  tools: AgentTool<any>[];
  modelId: string;
  provider: string;
}

export interface DebugReminderSections {
  full: string;
  panelContext: string | null;
  pageContext: string | null;
  timeContext: string | null;
}

export interface DebugMessageInspector {
  id: string;
  role: Message['role'];
  kind: 'message' | 'tool_use' | 'tool_result';
  summary: string;
  json: string;
}

export interface DebugToolInspector {
  id: string;
  name: string;
  description: string;
  schema: string;
}

export interface DebugTokenEstimate {
  systemPrompt: number;
  messages: number;
  tools: number;
  total: number;
  contextWindow: number;
  usagePercent: number;
}

export type DebugTurnStatus = 'running' | 'completed' | 'error' | 'aborted';

export interface ChatTurnDebugRecord {
  id: string;
  startedAt: number;
  finishedAt: number | null;
  durationMs: number | null;
  modelId: string;
  provider: string;
  status: DebugTurnStatus;
  requestSummary: string;
  responseSummary: string;
  request: {
    json: string;
    messageCount: number;
    toolCount: number;
    tokenEstimate: DebugTokenEstimate;
  };
  response: {
    json: string;
    stopReason: StopReason | null;
    usage: Usage | null;
    toolResultCount: number;
    errorMessage: string | null;
  };
}

export interface AgentDebugSnapshot {
  systemPrompt: string;
  reminder: DebugReminderSections;
  messages: Message[];
  messageInspectors: DebugMessageInspector[];
  tools: DebugToolInspector[];
  tokenEstimate: DebugTokenEstimate;
  modelId: string;
  provider: string;
}

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.local;
}

function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

export async function readChatDebugEnabled(): Promise<boolean> {
  if (hasChromeStorage()) {
    const result = await chrome.storage.local.get(CHAT_DEBUG_STORAGE_KEY);
    return result[CHAT_DEBUG_STORAGE_KEY] === true;
  }

  if (!hasLocalStorage()) return false;
  return localStorage.getItem(CHAT_DEBUG_STORAGE_KEY) === 'true';
}

export async function writeChatDebugEnabled(enabled: boolean): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [CHAT_DEBUG_STORAGE_KEY]: enabled });
    return;
  }

  if (!hasLocalStorage()) return;
  localStorage.setItem(CHAT_DEBUG_STORAGE_KEY, enabled ? 'true' : 'false');
}

function isLlmMessage(message: AgentMessage): message is Message {
  return message.role === 'user'
    || message.role === 'assistant'
    || message.role === 'toolResult';
}

function extractReminderBlock(reminder: string, tagName: 'panel-context' | 'page-context' | 'time-context'): string | null {
  const match = reminder.match(new RegExp(`<${tagName}>[\\s\\S]*?<\\/${tagName}>`));
  return match?.[0] ?? null;
}

function truncateSummary(text: string, maxLength = 120): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '(empty)';
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
}

function isSensitiveDebugKey(key: string): boolean {
  return /^(api[-_]?key|auth[-_]?token|authorization|cookie|secret)$/i.test(key);
}

export function sanitizeDebugValue(
  value: unknown,
  seen = new WeakSet<object>(),
  path: string[] = [],
): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeDebugValue(item, seen, [...path, String(index)]));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[circular]';
  }

  seen.add(value);
  const record = value as Record<string, unknown>;

  if (record.type === 'image' && typeof record.mimeType === 'string') {
    return {
      ...record,
      data: `[image: ${record.mimeType}]`,
    };
  }

  const nextRecord: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(record)) {
    if (isSensitiveDebugKey(key)) {
      nextRecord[key] = '[redacted]';
      continue;
    }
    nextRecord[key] = sanitizeDebugValue(nestedValue, seen, [...path, key]);
  }
  return nextRecord;
}

export function getMessageSummary(message: Message): {
  kind: DebugMessageInspector['kind'];
  summary: string;
} {
  if (message.role === 'toolResult') {
    const textSummary = truncateSummary(
      message.content
        .map((block) => block.type === 'text' ? block.text : `[image: ${block.mimeType}]`)
        .join(' '),
    );
    return {
      kind: 'tool_result',
      summary: `${message.toolName} ${message.isError ? '(error)' : ''} ${textSummary}`.trim(),
    };
  }

  if (message.role === 'assistant') {
    const toolCalls = message.content
      .filter((block) => block.type === 'toolCall')
      .map((block) => block.name);
    const textSummary = truncateSummary(
      message.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join(' '),
    );

    if (toolCalls.length > 0) {
      return {
        kind: 'tool_use',
        summary: `${toolCalls.join(', ')} ${textSummary !== '(empty)' ? `· ${textSummary}` : ''}`.trim(),
      };
    }

    return {
      kind: 'message',
      summary: textSummary,
    };
  }

  if (typeof message.content === 'string') {
    return {
      kind: 'message',
      summary: truncateSummary(message.content),
    };
  }

  return {
    kind: 'message',
    summary: truncateSummary(
      message.content
        .map((block) => block.type === 'text' ? block.text : `[image: ${block.mimeType}]`)
        .join(' '),
    ),
  };
}

function estimateTokens(value: unknown): number {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return Math.ceil(text.length / 4);
}

export function getContextWindowLimit(modelId: string): number {
  if (modelId.includes('claude')) return 200_000;
  return 200_000;
}

function buildToolPayload(tools: Array<Pick<Tool, 'name' | 'description' | 'parameters'>>): Array<{
  name: string;
  description: string;
  parameters: unknown;
}> {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

export function buildDebugToolInspectors(tools: Array<Pick<Tool, 'name' | 'description' | 'parameters'>>): DebugToolInspector[] {
  return buildToolPayload(tools).map((tool, index) => ({
    id: `${tool.name}-${index}`,
    name: tool.name,
    description: tool.description,
    schema: JSON.stringify(tool.parameters, null, 2),
  }));
}

export function buildDebugMessageInspectors(messages: Message[]): DebugMessageInspector[] {
  const sanitizedMessages = messages.map((message) => sanitizeDebugValue(message));

  return sanitizedMessages.map((message, index) => {
    const typedMessage = messages[index];
    const { kind, summary } = getMessageSummary(typedMessage);
    return {
      id: `${typedMessage.role}-${typedMessage.timestamp}-${index}`,
      role: typedMessage.role,
      kind,
      summary,
      json: JSON.stringify(message, null, 2),
    };
  });
}

export function buildDebugTokenEstimate(
  systemPrompt: string,
  messages: Message[],
  tools: Array<Pick<Tool, 'name' | 'description' | 'parameters'>>,
  modelId: string,
): DebugTokenEstimate {
  const plainTools = buildToolPayload(tools);
  const sanitizedMessages = messages.map((message) => sanitizeDebugValue(message));
  const systemPromptTokens = estimateTokens(systemPrompt);
  const messageTokens = estimateTokens(sanitizedMessages);
  const toolTokens = estimateTokens(plainTools);
  const totalTokens = systemPromptTokens + messageTokens + toolTokens;
  const contextWindow = getContextWindowLimit(modelId);

  return {
    systemPrompt: systemPromptTokens,
    messages: messageTokens,
    tools: toolTokens,
    total: totalTokens,
    contextWindow,
    usagePercent: contextWindow > 0
      ? Math.min((totalTokens / contextWindow) * 100, 100)
      : 0,
  };
}

function getRequestSummary(context: Context): string {
  const lastUserMessage = [...context.messages].reverse().find((message) => message.role === 'user');
  if (!lastUserMessage) {
    return `${context.messages.length} messages`;
  }

  return getMessageSummary(lastUserMessage).summary;
}

function stringifyDebugPayload(value: unknown): string {
  return JSON.stringify(sanitizeDebugValue(value), null, 2);
}

export function createChatTurnDebugRecord(args: {
  id: string;
  model: Model<any>;
  context: Context;
  options: Record<string, unknown>;
  startedAt?: number;
}): ChatTurnDebugRecord {
  const startedAt = args.startedAt ?? Date.now();
  const tools = args.context.tools ?? [];
  const tokenEstimate = buildDebugTokenEstimate(
    args.context.systemPrompt ?? '',
    args.context.messages,
    tools,
    args.model.id,
  );

  return {
    id: args.id,
    startedAt,
    finishedAt: null,
    durationMs: null,
    modelId: args.model.id,
    provider: args.model.provider,
    status: 'running',
    requestSummary: getRequestSummary(args.context),
    responseSummary: 'Waiting for response…',
    request: {
      json: stringifyDebugPayload({
        model: {
          id: args.model.id,
          provider: args.model.provider,
          api: args.model.api,
        },
        context: args.context,
        options: args.options,
      }),
      messageCount: args.context.messages.length,
      toolCount: tools.length,
      tokenEstimate,
    },
    response: {
      json: stringifyDebugPayload({
        assistantMessage: null,
        toolResults: [],
      }),
      stopReason: null,
      usage: null,
      toolResultCount: 0,
      errorMessage: null,
    },
  };
}

export function finalizeChatTurnDebugRecord(
  record: ChatTurnDebugRecord,
  args: {
    assistantMessage?: AssistantMessage | null;
    toolResults?: ToolResultMessage[];
    finishedAt?: number;
    errorMessage?: string | null;
    stopReason?: StopReason | null;
  } = {},
): ChatTurnDebugRecord {
  const assistantMessage = args.assistantMessage ?? null;
  const toolResults = args.toolResults ?? [];
  const finishedAt = args.finishedAt ?? Date.now();
  const stopReason = args.stopReason ?? assistantMessage?.stopReason ?? null;
  const errorMessage = args.errorMessage ?? assistantMessage?.errorMessage ?? null;
  const responseSummary = assistantMessage
    ? getMessageSummary(assistantMessage).summary
    : truncateSummary(errorMessage ?? 'No assistant response captured');

  let status: DebugTurnStatus = 'completed';
  if (stopReason === 'aborted') {
    status = 'aborted';
  } else if (stopReason === 'error' || errorMessage) {
    status = 'error';
  }

  return {
    ...record,
    finishedAt,
    durationMs: Math.max(finishedAt - record.startedAt, 0),
    status,
    responseSummary,
    response: {
      json: stringifyDebugPayload({
        assistantMessage,
        toolResults,
      }),
      stopReason,
      usage: assistantMessage?.usage ?? null,
      toolResultCount: toolResults.length,
      errorMessage,
    },
  };
}

export function buildAgentDebugSnapshot(
  source: Omit<AgentDebugSource, 'revision'>,
  preparedContext: PreparedAgentContext,
): AgentDebugSnapshot {
  const normalizedReminder = preparedContext.reminder.trim();
  const messages = preparedContext.messages.filter(isLlmMessage);
  const tools = source.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));

  return {
    systemPrompt: source.systemPrompt,
    reminder: {
      full: normalizedReminder,
      panelContext: extractReminderBlock(normalizedReminder, 'panel-context'),
      pageContext: extractReminderBlock(normalizedReminder, 'page-context'),
      timeContext: extractReminderBlock(normalizedReminder, 'time-context'),
    },
    messages,
    messageInspectors: buildDebugMessageInspectors(messages),
    tools: buildDebugToolInspectors(tools),
    tokenEstimate: buildDebugTokenEstimate(source.systemPrompt, messages, tools, source.modelId),
    modelId: source.modelId,
    provider: source.provider,
  };
}

export async function collectAgentDebugSnapshot(source: AgentDebugSource): Promise<AgentDebugSnapshot> {
  const preparedContext = await prepareAgentContext(source.messages);
  return buildAgentDebugSnapshot(source, preparedContext);
}

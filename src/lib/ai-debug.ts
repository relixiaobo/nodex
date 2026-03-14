import type { AgentMessage, AgentTool } from '@mariozechner/pi-agent-core';
import type { Message } from '@mariozechner/pi-ai';
import { buildSystemReminder, injectReminder, stripOldImages } from './ai-context.js';

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

function sanitizeDebugValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDebugValue(item, seen));
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
    nextRecord[key] = sanitizeDebugValue(nestedValue, seen);
  }
  return nextRecord;
}

function getMessageSummary(message: Message): {
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

function getContextWindowLimit(modelId: string): number {
  if (modelId.includes('claude')) return 200_000;
  return 200_000;
}

export function buildAgentDebugSnapshot(
  source: Omit<AgentDebugSource, 'revision'>,
  reminder: string,
): AgentDebugSnapshot {
  const normalizedReminder = reminder.trim();
  const messages = injectReminder(stripOldImages(source.messages), normalizedReminder)
    .filter(isLlmMessage);

  const plainTools = source.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));

  const sanitizedMessages = messages.map((message) => sanitizeDebugValue(message));
  const systemPromptTokens = estimateTokens(source.systemPrompt);
  const messageTokens = estimateTokens(sanitizedMessages);
  const toolTokens = estimateTokens(plainTools);
  const totalTokens = systemPromptTokens + messageTokens + toolTokens;
  const contextWindow = getContextWindowLimit(source.modelId);

  return {
    systemPrompt: source.systemPrompt,
    reminder: {
      full: normalizedReminder,
      panelContext: extractReminderBlock(normalizedReminder, 'panel-context'),
      pageContext: extractReminderBlock(normalizedReminder, 'page-context'),
      timeContext: extractReminderBlock(normalizedReminder, 'time-context'),
    },
    messages,
    messageInspectors: sanitizedMessages.map((message, index) => {
      const typedMessage = messages[index];
      const { kind, summary } = getMessageSummary(typedMessage);
      return {
        id: `${typedMessage.role}-${typedMessage.timestamp}-${index}`,
        role: typedMessage.role,
        kind,
        summary,
        json: JSON.stringify(message, null, 2),
      };
    }),
    tools: plainTools.map((tool, index) => ({
      id: `${tool.name}-${index}`,
      name: tool.name,
      description: tool.description,
      schema: JSON.stringify(tool.parameters, null, 2),
    })),
    tokenEstimate: {
      systemPrompt: systemPromptTokens,
      messages: messageTokens,
      tools: toolTokens,
      total: totalTokens,
      contextWindow,
      usagePercent: contextWindow > 0
        ? Math.min((totalTokens / contextWindow) * 100, 100)
        : 0,
    },
    modelId: source.modelId,
    provider: source.provider,
  };
}

export async function collectAgentDebugSnapshot(source: AgentDebugSource): Promise<AgentDebugSnapshot> {
  const reminder = await buildSystemReminder();
  return buildAgentDebugSnapshot(source, reminder);
}

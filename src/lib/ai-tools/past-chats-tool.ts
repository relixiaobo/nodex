import type { AgentMessage, AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import { Type } from '@mariozechner/pi-ai';
import { getLinearPath, type ChatSession, type MessageNode } from '../ai-chat-tree.js';
import { getChatSession, listChatSessionMetas } from '../ai-persistence.js';
import { formatResultText } from './shared.js';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;
const DEFAULT_MAX_CHARS = 2_000;
const DEFAULT_TEXT_OFFSET = 0;
const USER_MESSAGE_PREVIEW_CHARS = 200;
const SYSTEM_REMINDER_PATTERN = /<system-reminder>[\s\S]*?<\/system-reminder>/g;

const pastChatsToolParameters = Type.Object({
  sessionId: Type.Optional(Type.String({
    description: 'Session to explore. Omit to list sessions. Browse with past_chats() first instead of guessing IDs.',
  })),
  messageId: Type.Optional(Type.String({
    description: 'Level 2 only. User message ID to read in detail. Requires sessionId. Returns that user message plus assistant replies until the next user message.',
  })),
  query: Type.Optional(Type.String({
    description: 'Keyword filter (case-insensitive substring match). Level 0: search session title plus active-branch user and assistant text. Level 1: search user messages inside the session. Use concrete keywords like names, features, or decisions.',
  })),
  before: Type.Optional(Type.String({
    description: 'Level 0 only. ISO date or datetime, inclusive upper bound. Examples: "2026-03-15" or "2026-03-15T18:30:00Z".',
  })),
  after: Type.Optional(Type.String({
    description: 'Level 0 only. ISO date or datetime, inclusive lower bound. Examples: "2026-03-01" or "2026-03-01T09:00:00+08:00".',
  })),
  limit: Type.Optional(Type.Integer({
    minimum: 1,
    maximum: MAX_LIMIT,
    default: DEFAULT_LIMIT,
    description: 'Level 0/1 only. Max sessions or messages to return. Default 10, max 20.',
  })),
  offset: Type.Optional(Type.Integer({
    minimum: 0,
    default: 0,
    description: 'Level 0/1 only. Pagination offset for sessions or messages. Default 0.',
  })),
  maxChars: Type.Optional(Type.Integer({
    minimum: 1,
    default: DEFAULT_MAX_CHARS,
    description: 'Level 2 only. Max assistant-response characters to return. Default 2000. Use with textOffset when the previous result was truncated.',
  })),
  textOffset: Type.Optional(Type.Integer({
    minimum: 0,
    default: DEFAULT_TEXT_OFFSET,
    description: 'Level 2 only. Character offset into the assistant response. Default 0. Requires messageId.',
  })),
});

type PastChatsToolParams = typeof pastChatsToolParameters.static;

export interface PastChatsToolRuntime {
  getCurrentSessionId?: () => string | null;
}

type SessionMeta = Awaited<ReturnType<typeof listChatSessionMetas>>[number];

interface SessionSummary {
  id: string;
  title: string;
  updatedAt: string;
  userMessageCount: number;
}

interface UserMessageSummary {
  id: string;
  text: string;
  createdAt: string;
}

function parseTimeFilter(value: string | undefined, kind: 'before' | 'after'): number | null {
  if (!value) return null;

  const trimmed = value.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const normalized = dateOnly
    ? `${trimmed}${kind === 'after' ? 'T00:00:00.000' : 'T23:59:59.999'}`
    : trimmed;
  const timestamp = new Date(normalized).getTime();

  if (!Number.isFinite(timestamp)) {
    throw new Error(`Invalid ${kind} time: ${value}. Use ISO date or datetime, for example "2026-03-15" or "2026-03-15T18:30:00Z".`);
  }

  return timestamp;
}

function extractTextParts(content: AgentMessage['content']): string {
  if (typeof content === 'string') return content;

  return content
    .filter((part): part is Extract<typeof content[number], { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n\n');
}

function normalizeExtractedText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripSystemReminder(text: string): string {
  return normalizeExtractedText(text.replace(SYSTEM_REMINDER_PATTERN, ''));
}

function extractUserText(message: AgentMessage): string {
  if (message.role !== 'user') return '';
  return stripSystemReminder(extractTextParts(message.content));
}

function extractAssistantText(message: AgentMessage): string {
  if (message.role !== 'assistant') return '';
  return normalizeExtractedText(extractTextParts(message.content));
}

function truncatePreview(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function matchesQuery(text: string, query: string | null): boolean {
  if (!query) return true;
  return text.toLowerCase().includes(query);
}

function toIsoString(timestamp: number | undefined): string {
  return new Date(timestamp ?? 0).toISOString();
}

function getSessionTitle(meta: SessionMeta): string {
  return meta.title?.trim() || '';
}

function getActivePath(session: ChatSession): MessageNode[] {
  return getLinearPath(session).filter((node) => node.message !== null);
}

function getVisibleUserMessages(session: ChatSession): Array<{ node: MessageNode; text: string }> {
  return getActivePath(session)
    .filter((node): node is MessageNode & { message: Extract<AgentMessage, { role: 'user' }> } => node.message?.role === 'user')
    .map((node) => ({
      node,
      text: extractUserText(node.message),
    }))
    .filter((entry) => entry.text.length > 0);
}

function getSessionSearchText(meta: SessionMeta, session: ChatSession): string {
  const parts = [getSessionTitle(meta)];

  for (const node of getActivePath(session)) {
    const message = node.message;
    if (!message) continue;
    if (message.role === 'user') {
      const text = extractUserText(message);
      if (text) parts.push(text);
      continue;
    }
    if (message.role === 'assistant') {
      const text = extractAssistantText(message);
      if (text) parts.push(text);
    }
  }

  return parts.join('\n\n').toLowerCase();
}

async function listSessionSummaries(
  params: PastChatsToolParams,
  currentSessionId: string | null,
): Promise<AgentToolResult<unknown>> {
  const after = parseTimeFilter(params.after, 'after');
  const before = parseTimeFilter(params.before, 'before');
  const query = params.query?.trim().toLowerCase() || null;
  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const offset = params.offset ?? 0;

  const metas = (await listChatSessionMetas())
    .filter((meta) => meta.id !== currentSessionId)
    .filter((meta) => after === null || meta.updatedAt >= after)
    .filter((meta) => before === null || meta.updatedAt <= before);

  const summaries: SessionSummary[] = [];

  for (const meta of metas) {
    const session = await getChatSession(meta.id);
    if (!session) continue;

    if (!matchesQuery(getSessionSearchText(meta, session), query)) continue;

    summaries.push({
      id: meta.id,
      title: getSessionTitle(meta),
      updatedAt: new Date(meta.updatedAt).toISOString(),
      userMessageCount: getVisibleUserMessages(session).length,
    });
  }

  const result = {
    total: summaries.length,
    offset,
    limit,
    sessions: summaries.slice(offset, offset + limit),
    ...(query && summaries.length === 0
      ? {
        hint: `No past chats match query "${params.query}". Try different keywords or use past_chats() to browse all sessions.`,
      }
      : {}),
  };

  return {
    content: [{ type: 'text', text: formatResultText(result) }],
    details: result,
  };
}

function ensureSessionAllowed(sessionId: string, currentSessionId: string | null): void {
  if (sessionId === currentSessionId) {
    throw new Error(`Session ${sessionId} is the current chat. Use the existing conversation context instead of past_chats.`);
  }
}

async function loadSessionOrThrow(sessionId: string, currentSessionId: string | null): Promise<ChatSession> {
  ensureSessionAllowed(sessionId, currentSessionId);
  const session = await getChatSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}. Use past_chats() to browse available sessions.`);
  }
  return session;
}

async function listUserMessagesInSession(
  sessionId: string,
  params: PastChatsToolParams,
  currentSessionId: string | null,
): Promise<AgentToolResult<unknown>> {
  const session = await loadSessionOrThrow(sessionId, currentSessionId);
  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const offset = params.offset ?? 0;
  const query = params.query?.trim().toLowerCase() || null;

  const messages: UserMessageSummary[] = getVisibleUserMessages(session)
    .filter(({ text }) => matchesQuery(text.toLowerCase(), query))
    .map(({ node, text }) => ({
      id: node.id,
      text: truncatePreview(text, USER_MESSAGE_PREVIEW_CHARS),
      createdAt: toIsoString(node.message?.timestamp),
    }));

  const result = {
    sessionId,
    title: session.title?.trim() || '',
    total: messages.length,
    offset,
    limit,
    messages: messages.slice(offset, offset + limit),
    ...(query && messages.length === 0
      ? {
        hint: `No user messages in session ${sessionId} match query "${params.query}". Use past_chats(sessionId: "${sessionId}") to browse all user messages.`,
      }
      : {}),
  };

  return {
    content: [{ type: 'text', text: formatResultText(result) }],
    details: result,
  };
}

function collectAssistantResponse(path: MessageNode[], startIndex: number): string {
  const parts: string[] = [];

  for (let index = startIndex + 1; index < path.length; index += 1) {
    const message = path[index]?.message;
    if (!message) continue;
    if (message.role === 'user') break;
    if (message.role !== 'assistant') continue;

    const text = extractAssistantText(message);
    if (text) parts.push(text);
  }

  return parts.join('\n\n').trim();
}

async function readMessageDetail(
  sessionId: string,
  messageId: string,
  params: PastChatsToolParams,
  currentSessionId: string | null,
): Promise<AgentToolResult<unknown>> {
  const session = await loadSessionOrThrow(sessionId, currentSessionId);
  const path = getActivePath(session);
  const messageIndex = path.findIndex((node) => node.id === messageId);

  if (messageIndex < 0 || path[messageIndex]?.message?.role !== 'user') {
    throw new Error(`Message not found: ${messageId} in session ${sessionId}. Use past_chats(sessionId: "${sessionId}") to browse user messages.`);
  }

  const userMessage = path[messageIndex].message!;
  const userText = extractUserText(userMessage);
  const assistantText = collectAssistantResponse(path, messageIndex);
  const maxChars = params.maxChars ?? DEFAULT_MAX_CHARS;
  const textOffset = params.textOffset ?? DEFAULT_TEXT_OFFSET;

  const assistant = assistantText.length === 0
    ? null
    : (() => {
      const text = assistantText.slice(textOffset, textOffset + maxChars);
      const totalLength = assistantText.length;
      const nextOffset = textOffset + maxChars;
      const truncated = nextOffset < totalLength;

      return {
        text,
        totalLength,
        offset: textOffset,
        ...(truncated ? { truncated: true, nextOffset } : {}),
      };
    })();

  const result = {
    user: {
      id: messageId,
      text: userText,
      createdAt: toIsoString(userMessage.timestamp),
    },
    assistant,
  };

  return {
    content: [{ type: 'text', text: formatResultText(result) }],
    details: result,
  };
}

async function executePastChatsTool(
  params: PastChatsToolParams,
  runtime: PastChatsToolRuntime,
): Promise<AgentToolResult<unknown>> {
  if (params.messageId && !params.sessionId) {
    throw new Error('messageId requires sessionId. Use past_chats() to browse sessions first.');
  }

  if (params.textOffset && !params.messageId) {
    throw new Error('textOffset requires messageId. Use past_chats(sessionId: "...", messageId: "...") to read a specific reply.');
  }

  const currentSessionId = runtime.getCurrentSessionId?.() ?? null;

  if (!params.sessionId) {
    return listSessionSummaries(params, currentSessionId);
  }

  if (!params.messageId) {
    return listUserMessagesInSession(params.sessionId, params, currentSessionId);
  }

  return readMessageDetail(params.sessionId, params.messageId, params, currentSessionId);
}

export function createPastChatsTool(runtime: PastChatsToolRuntime = {}): AgentTool<typeof pastChatsToolParameters, unknown> {
  return {
    name: 'past_chats',
    label: 'Past Chats',
    description: [
      'Explore past chat conversations with progressive disclosure.',
      '',
      'Modes:',
      '- No sessionId: list sessions (title, updatedAt, userMessageCount).',
      '- sessionId only: list user messages from that session for quick scanning.',
      '- sessionId + messageId: read that user message plus assistant replies until the next user message.',
      '',
      'Defaults and limits:',
      '- limit defaults to 10 and maxes at 20.',
      '- Assistant response pagination uses maxChars (default 2000) and textOffset.',
      '',
      'Guidance:',
      '- Browse with past_chats() before drilling in.',
      '- Use concrete keywords, not meta words like "discussed" or "mentioned".',
      '- Do not use past_chats for the current conversation; it is already in context.',
      '- If a session or message is missing, use the browse forms to recover.',
      '',
      'Quick patterns:',
      '- Browse recent: past_chats()',
      '- Time range: past_chats(after: "2026-03-01", before: "2026-03-15")',
      '- Search all: past_chats(query: "pricing")',
      '- Explore session: past_chats(sessionId: "session_123")',
      '- Search inside session: past_chats(sessionId: "session_123", query: "roadmap")',
      '- Read detail: past_chats(sessionId: "session_123", messageId: "msg_456")',
      '- Continue a long reply: past_chats(sessionId: "session_123", messageId: "msg_456", textOffset: 2000)',
    ].join('\n'),
    parameters: pastChatsToolParameters,
    execute: async (_toolCallId, toolParams) => executePastChatsTool(toolParams, runtime),
  };
}

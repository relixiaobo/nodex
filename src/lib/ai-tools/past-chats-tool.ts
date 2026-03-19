import type { AgentMessage, AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import { Type } from '@mariozechner/pi-ai';
import type { ChatSession, MessageNode } from '../ai-chat-tree.js';
import { extractAssistantText, extractUserText, getActivePath, getVisibleUserMessages } from '../ai-chat-summary.js';
import { getChatSession, listChatSessionMetas } from '../ai-persistence.js';
import { fuzzyMatch } from '../fuzzy-search.js';
import { formatResultText } from './shared.js';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;
const DEFAULT_MAX_CHARS = 2_000;
const DEFAULT_TEXT_OFFSET = 0;
const USER_MESSAGE_PREVIEW_CHARS = 200;

const pastChatsToolParameters = Type.Object({
  sessionId: Type.Optional(Type.String({
    description: 'Session to explore. Omit to list sessions. Browse with past_chats() first instead of guessing IDs.',
  })),
  messageId: Type.Optional(Type.String({
    description: 'Level 2 only. User message ID to read in detail. Requires sessionId. Returns that user message plus assistant replies until the next user message.',
  })),
  query: Type.Optional(Type.String({
    description: 'Keyword filter (case-insensitive fuzzy match across whitespace-separated terms). Valid for Level 0/1 only. Level 0: search session title plus active-branch user and assistant text. Level 1: search user messages inside the session. Use concrete keywords like names, features, or decisions.',
  })),
  before: Type.Optional(Type.String({
    description: 'Level 0 only. Only valid when sessionId is omitted. ISO date (user\'s local timezone), inclusive upper bound. Use plain date like "2026-03-15" — do NOT append Z or timezone offset. The date is interpreted in the user\'s local timezone.',
  })),
  after: Type.Optional(Type.String({
    description: 'Level 0 only. Only valid when sessionId is omitted. ISO date (user\'s local timezone), inclusive lower bound. Use plain date like "2026-03-01" — do NOT append Z or timezone offset. The date is interpreted in the user\'s local timezone.',
  })),
  limit: Type.Optional(Type.Integer({
    minimum: 1,
    maximum: MAX_LIMIT,
    default: DEFAULT_LIMIT,
    description: 'Level 0/1 only. Not valid with messageId. Max sessions or user messages to return. Default 10, max 20.',
  })),
  offset: Type.Optional(Type.Integer({
    minimum: 0,
    default: 0,
    description: 'Level 0/1 only. Not valid with messageId. Pagination offset for sessions or user messages. Default 0.',
  })),
  maxChars: Type.Optional(Type.Integer({
    minimum: 1,
    default: DEFAULT_MAX_CHARS,
    description: 'Level 2 only. Requires messageId. Max assistant-response characters to return. Default 2000. Use with textOffset when the previous result was truncated.',
  })),
  textOffset: Type.Optional(Type.Integer({
    minimum: 0,
    default: DEFAULT_TEXT_OFFSET,
    description: 'Level 2 only. Requires messageId. Character offset into the assistant response. Default 0.',
  })),
});

type PastChatsToolParams = typeof pastChatsToolParameters.static;
type PastChatsMode = 'sessions' | 'sessionMessages' | 'messageDetail';

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

function toToolResult<T>(details: T): AgentToolResult<T> {
  return {
    content: [{ type: 'text', text: formatResultText(details) }],
    details,
  };
}

function parseTimeFilter(value: string | undefined, kind: 'before' | 'after'): number | null {
  if (!value) return null;

  const trimmed = value.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);

  // Always interpret as local timezone — strip Z or timezone offset if present,
  // so new Date() parses in user's local time (not UTC).
  const stripped = dateOnly
    ? trimmed
    : trimmed.replace(/[Zz]$/, '').replace(/[+-]\d{2}:\d{2}$/, '');
  const normalized = dateOnly
    ? `${stripped}${kind === 'after' ? 'T00:00:00.000' : 'T23:59:59.999'}`
    : stripped;
  const timestamp = new Date(normalized).getTime();

  if (!Number.isFinite(timestamp)) {
    throw new Error(`Invalid ${kind} time: ${value}. Use plain date like "2026-03-15" without Z or timezone offset.`);
  }

  return timestamp;
}

function truncatePreview(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function matchesQuery(text: string, query: string | null): boolean {
  if (!query) return true;
  return fuzzyMatch(query, text) !== null;
}

function normalizeQuery(query: string | undefined): string | null {
  return query?.trim() || null;
}

function getListPagingParams(params: PastChatsToolParams): { limit: number; offset: number } {
  return {
    limit: Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT),
    offset: params.offset ?? 0,
  };
}

function getDetailPagingParams(params: PastChatsToolParams): { maxChars: number; textOffset: number } {
  return {
    maxChars: params.maxChars ?? DEFAULT_MAX_CHARS,
    textOffset: params.textOffset ?? DEFAULT_TEXT_OFFSET,
  };
}

function getPastChatsMode(params: PastChatsToolParams): PastChatsMode {
  if (!params.sessionId) return 'sessions';
  if (!params.messageId) return 'sessionMessages';
  return 'messageDetail';
}

function validatePastChatsParams(params: PastChatsToolParams): void {
  const mode = getPastChatsMode(params);

  if (params.before !== undefined && mode !== 'sessions') {
    throw new Error('before is only valid when sessionId is omitted. Use past_chats() to browse sessions by time range.');
  }

  if (params.after !== undefined && mode !== 'sessions') {
    throw new Error('after is only valid when sessionId is omitted. Use past_chats() to browse sessions by time range.');
  }

  if (params.messageId && !params.sessionId) {
    throw new Error('messageId requires sessionId. Use past_chats() to browse sessions first.');
  }

  if (mode === 'messageDetail' && params.query !== undefined) {
    throw new Error('query is not valid with messageId. First browse user messages, then read one message in detail.');
  }

  if (mode === 'messageDetail' && params.limit !== undefined) {
    throw new Error('limit is not valid with messageId. Level 2 returns a single user message plus assistant reply detail.');
  }

  if (mode === 'messageDetail' && params.offset !== undefined) {
    throw new Error('offset is not valid with messageId. Level 2 reads a single user message plus assistant reply detail.');
  }

  if (params.maxChars !== undefined && mode !== 'messageDetail') {
    throw new Error('maxChars requires messageId. Use past_chats(sessionId: "...", messageId: "...") to read a specific reply.');
  }

  if (params.textOffset !== undefined && mode !== 'messageDetail') {
    throw new Error('textOffset requires messageId. Use past_chats(sessionId: "...", messageId: "...") to read a specific reply.');
  }
}

function toIsoString(timestamp: number | undefined): string {
  return new Date(timestamp ?? 0).toISOString();
}

function getSessionTitle(meta: SessionMeta): string {
  return meta.title?.trim() || '';
}

async function listSessionSummaries(
  params: PastChatsToolParams,
  currentSessionId: string | null,
): Promise<AgentToolResult<unknown>> {
  const after = parseTimeFilter(params.after, 'after');
  const before = parseTimeFilter(params.before, 'before');
  const query = normalizeQuery(params.query);
  const { limit, offset } = getListPagingParams(params);

  const metas = (await listChatSessionMetas())
    .filter((meta) => meta.id !== currentSessionId)
    .filter((meta) => after === null || meta.updatedAt >= after)
    .filter((meta) => before === null || meta.updatedAt <= before);

  const summaries: SessionSummary[] = [];

  for (const meta of metas) {
    if (!matchesQuery(meta.searchText, query)) continue;

    summaries.push({
      id: meta.id,
      title: getSessionTitle(meta),
      updatedAt: new Date(meta.updatedAt).toISOString(),
      userMessageCount: meta.userMessageCount,
    });
  }

  const result = {
    total: summaries.length,
    offset,
    limit,
    sessions: summaries.slice(offset, offset + limit),
    ...(summaries.length > 0
      ? {
        next: 'Choose a session id from sessions and call past_chats(sessionId: "...") to browse its user messages.',
      }
      : {}),
    ...(query && summaries.length === 0
      ? {
        hint: 'No matching past chats. Try broader keywords or browse all sessions.',
      }
      : {}),
  };

  return toToolResult(result);
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
  const { limit, offset } = getListPagingParams(params);
  const query = normalizeQuery(params.query);

  const messages: UserMessageSummary[] = getVisibleUserMessages(session)
    .filter(({ text }) => matchesQuery(text, query))
    .map(({ node, text }) => ({
      id: node.id,
      text: truncatePreview(text, USER_MESSAGE_PREVIEW_CHARS),
      createdAt: toIsoString(node.message?.timestamp),
    }));

  const result = {
    title: session.title?.trim() || '',
    total: messages.length,
    offset,
    limit,
    userMessages: messages.slice(offset, offset + limit),
    ...(messages.length > 0
      ? {
        next: 'Choose a message id from userMessages and call past_chats(sessionId: "...", messageId: "...") to read the full exchange.',
      }
      : {}),
    ...(query && messages.length === 0
      ? {
        hint: 'No matching user messages in this session. Try broader keywords or browse the session without query.',
      }
      : {}),
  };

  return toToolResult(result);
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
  const { maxChars, textOffset } = getDetailPagingParams(params);

  const assistant = assistantText.length === 0
    ? null
    : (() => {
      if (textOffset >= assistantText.length) {
        throw new Error('textOffset is past the end of the assistant response. Use a smaller offset or omit textOffset to start from the beginning.');
      }

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
    ...(assistant?.truncated
      ? {
        next: 'Use textOffset: nextOffset to continue the assistant response.',
      }
      : {}),
    ...(assistant === null
      ? {
        boundary: 'No assistant reply exists after this user message on the active branch.',
      }
      : {}),
  };

  return toToolResult(result);
}

async function executePastChatsTool(
  params: PastChatsToolParams,
  runtime: PastChatsToolRuntime,
): Promise<AgentToolResult<unknown>> {
  validatePastChatsParams(params);

  const currentSessionId = runtime.getCurrentSessionId?.() ?? null;
  const mode = getPastChatsMode(params);

  switch (mode) {
    case 'sessions':
      return listSessionSummaries(params, currentSessionId);
    case 'sessionMessages':
      return listUserMessagesInSession(params.sessionId!, params, currentSessionId);
    case 'messageDetail':
      return readMessageDetail(params.sessionId!, params.messageId!, params, currentSessionId);
  }
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
      '- sessionId only: list userMessages from that session for quick scanning.',
      '- sessionId + messageId: read that user message plus assistant replies until the next user message.',
      '',
      'Defaults and limits:',
      '- limit defaults to 10 and maxes at 20.',
      '- Assistant response pagination uses maxChars (default 2000) and textOffset.',
      '- Invalid parameter combinations fail fast instead of being silently ignored.',
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

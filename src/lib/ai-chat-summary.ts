import type { AgentMessage } from '@mariozechner/pi-agent-core';
import { getLinearPath, type ChatSession, type MessageNode } from './ai-chat-tree.js';

const SYSTEM_REMINDER_PATTERN = /<system-reminder>[\s\S]*?<\/system-reminder>/g;

export function extractTextParts(content: AgentMessage['content']): string {
  if (typeof content === 'string') return content;

  return content
    .filter((part): part is Extract<typeof content[number], { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n\n');
}

export function normalizeExtractedText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function stripSystemReminder(text: string): string {
  return normalizeExtractedText(text.replace(SYSTEM_REMINDER_PATTERN, ''));
}

export function extractUserText(message: AgentMessage): string {
  if (message.role !== 'user') return '';
  return stripSystemReminder(extractTextParts(message.content));
}

export function extractAssistantText(message: AgentMessage): string {
  if (message.role !== 'assistant') return '';
  return normalizeExtractedText(extractTextParts(message.content));
}

export function getActivePath(session: ChatSession): MessageNode[] {
  return getLinearPath(session).filter((node) => node.message !== null);
}

export function getVisibleUserMessages(session: ChatSession): Array<{ node: MessageNode; text: string }> {
  return getActivePath(session)
    .filter((node): node is MessageNode & { message: Extract<AgentMessage, { role: 'user' }> } => node.message?.role === 'user')
    .map((node) => ({
      node,
      text: extractUserText(node.message),
    }))
    .filter((entry) => entry.text.length > 0);
}

export function buildChatSessionContentSearchText(session: ChatSession): string {
  const parts: string[] = [];

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

  return parts.join('\n\n');
}

export function joinChatSessionSearchText(
  title: string | null | undefined,
  contentSearchText: string,
): string {
  const parts: string[] = [];
  const normalizedTitle = title?.trim();

  if (normalizedTitle) {
    parts.push(normalizedTitle);
  }

  if (contentSearchText.trim().length > 0) {
    parts.push(contentSearchText);
  }

  return parts.join('\n\n');
}

export function buildChatSessionSearchText(
  session: ChatSession,
  title: string | null | undefined = session.title,
): string {
  return joinChatSessionSearchText(title, buildChatSessionContentSearchText(session));
}

export function buildChatSessionSearchSummary(
  session: ChatSession,
  title: string | null | undefined = session.title,
): { contentSearchText: string; searchText: string; userMessageCount: number } {
  const contentSearchText = buildChatSessionContentSearchText(session);
  return {
    contentSearchText,
    searchText: joinChatSessionSearchText(title, contentSearchText),
    userMessageCount: getVisibleUserMessages(session).length,
  };
}

export interface ChatSessionUserMessageSummary {
  messageId: string;
  text: string;
  createdAt: number;
  order: number;
}

export function buildChatSessionUserMessageSummaries(session: ChatSession): ChatSessionUserMessageSummary[] {
  return getVisibleUserMessages(session).map(({ node, text }, index) => ({
    messageId: node.id,
    text,
    createdAt: node.message!.timestamp,
    order: index,
  }));
}

import type { AgentMessage } from '@mariozechner/pi-agent-core';
import { IMAGE_PLACEHOLDER, messageHasImage, replaceMessageImages } from './ai-message-images.js';
import * as loroDoc from './loro-doc.js';
import { getAncestorChain } from './tree-utils.js';
import { isOutlinerContentNodeType } from './node-type-utils.js';
import { useUIStore } from '../stores/ui-store.js';
import { isAppPanel, isChatPanel } from '../types/index.js';

const RECENT_IMAGE_MESSAGES = 3;

export interface PreparedAgentContext {
  reminder: string;
  messages: AgentMessage[];
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function padTimePart(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatLocalTimestamp(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absOffsetMinutes = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(absOffsetMinutes / 60);
  const offsetRemainderMinutes = absOffsetMinutes % 60;

  return [
    `${date.getFullYear()}-${padTimePart(date.getMonth() + 1)}-${padTimePart(date.getDate())}`,
    'T',
    `${padTimePart(date.getHours())}:${padTimePart(date.getMinutes())}:${padTimePart(date.getSeconds())}`,
    `${sign}${padTimePart(offsetHours)}:${padTimePart(offsetRemainderMinutes)}`,
  ].join('');
}

function buildPanelContext(): string | null {
  const ui = useUIStore.getState();
  const currentPanelId = ui.panels.find((p) => p.id === ui.activePanelId)?.nodeId ?? null;
  if (!currentPanelId || isAppPanel(currentPanelId) || isChatPanel(currentPanelId)) return null;

  const panelNode = loroDoc.toNodexNode(currentPanelId);
  if (!panelNode) return null;

  const { ancestors, workspaceRootId } = getAncestorChain(currentPanelId);
  const breadcrumb = ancestors
    .filter((ancestor) => ancestor.id !== workspaceRootId)
    .map((ancestor) => ancestor.name);
  const panelPath = [...breadcrumb, panelNode.name ?? currentPanelId].join(' > ');
  const childLines = loroDoc.getChildren(currentPanelId)
    .map((childId) => loroDoc.toNodexNode(childId))
    .filter((node): node is NonNullable<ReturnType<typeof loroDoc.toNodexNode>> => node !== null && isOutlinerContentNodeType(node.type))
    .slice(0, 10)
    .map((child) => {
      const childCount = loroDoc.getChildren(child.id)
        .map((grandId) => loroDoc.toNodexNode(grandId))
        .filter((node): node is NonNullable<ReturnType<typeof loroDoc.toNodexNode>> => node !== null && isOutlinerContentNodeType(node.type))
        .length;
      const checkedState = child.completedAt == null ? '' : (child.completedAt > 0 ? ', checkbox: done' : ', checkbox: undone');
      return `  - "${escapeXml(child.name ?? '')}" (id: ${child.id}, ${childCount} children${checkedState})`;
    });

  return [
    '<panel-context>',
    `Current panel: ${escapeXml(panelPath)} (ID: ${currentPanelId})`,
    `Children (${childLines.length}):`,
    ...(childLines.length > 0 ? childLines : ['  - none']),
    '</panel-context>',
  ].join('\n');
}

async function getActiveTabContext(): Promise<string | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) return null;

  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = tabs[0];
    if (!tab?.url || !tab.title) return null;
    return [
      '<page-context>',
      `User is browsing: ${escapeXml(tab.url)} — "${escapeXml(tab.title)}"`,
      '</page-context>',
    ].join('\n');
  } catch {
    return null;
  }
}

function buildTimeContext(): string {
  const now = new Date();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return [
    '<time-context>',
    `Current time: ${formatLocalTimestamp(now)} (${escapeXml(timezone)})`,
    '</time-context>',
  ].join('\n');
}

export async function buildSystemReminder(): Promise<string> {
  const sections = [
    buildPanelContext(),
    await getActiveTabContext(),
    buildTimeContext(),
  ].filter((section): section is string => !!section);

  if (sections.length === 0) return '';
  return `<system-reminder>\n${sections.join('\n\n')}\n</system-reminder>`;
}

export function stripOldImages(messages: AgentMessage[]): AgentMessage[] {
  let remainingMessages = RECENT_IMAGE_MESSAGES;
  let nextMessages: AgentMessage[] | null = null;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!messageHasImage(message)) continue;

    if (remainingMessages > 0) {
      remainingMessages -= 1;
      continue;
    }

    const strippedMessage = replaceMessageImages(
      message,
      () => IMAGE_PLACEHOLDER,
    );

    if (strippedMessage === message) continue;

    if (!nextMessages) {
      nextMessages = messages.slice();
    }

    nextMessages[index] = strippedMessage;
  }

  return nextMessages ?? messages;
}

export function injectReminder(messages: AgentMessage[], reminder: string): AgentMessage[] {
  const normalizedReminder = reminder.trim();
  if (!normalizedReminder) return messages;

  const userMessageIndex = [...messages]
    .map((message, index) => ({ message, index }))
    .reverse()
    .find(({ message }) => message.role === 'user')
    ?.index;

  if (userMessageIndex == null) return messages;

  const userMessage = messages[userMessageIndex];
  if (userMessage.role !== 'user') return messages;

  const nextMessages = messages.slice();

  if (typeof userMessage.content === 'string') {
    nextMessages[userMessageIndex] = {
      ...userMessage,
      content: `${userMessage.content}\n\n${normalizedReminder}`,
    };
    return nextMessages;
  }

  const nextContent = userMessage.content.slice();
  const lastContent = nextContent[nextContent.length - 1];
  if (lastContent?.type === 'text') {
    nextContent[nextContent.length - 1] = {
      ...lastContent,
      text: `${lastContent.text}\n\n${normalizedReminder}`,
    };
  } else {
    nextContent.push({
      type: 'text',
      text: normalizedReminder,
    });
  }

  nextMessages[userMessageIndex] = {
    ...userMessage,
    content: nextContent,
  };
  return nextMessages;
}

export function transformAgentContext(messages: AgentMessage[], reminder: string): AgentMessage[] {
  return injectReminder(stripOldImages(messages), reminder);
}

export async function prepareAgentContext(messages: AgentMessage[]): Promise<PreparedAgentContext> {
  const reminder = await buildSystemReminder();
  return {
    reminder,
    messages: transformAgentContext(messages, reminder),
  };
}

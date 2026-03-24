import type { AgentMessage } from '@mariozechner/pi-agent-core';
import { IMAGE_PLACEHOLDER, messageHasImage, replaceMessageImages } from './ai-message-images.js';
import * as loroDoc from './loro-doc.js';
import { getAncestorChain } from './tree-utils.js';
import { isOutlinerContentNodeType } from './node-type-utils.js';
import { buildExpandedNodeKey } from './expanded-node-key.js';
import { getTagDisplayNames, toCheckedValue } from './ai-tools/shared.js';
import { useUIStore } from '../stores/ui-store.js';
import { isAppPanel } from '../types/index.js';
import { buildMentionedNodeEditReminder } from './ai-mentioned-nodes.js';

const RECENT_IMAGE_MESSAGES = 3;
const VIEW_MAX_DEPTH = 3;
const VIEW_MAX_CHILDREN = 10;
const MAIN_PANEL_ID = 'node-main';

export interface PreparedAgentContext {
  reminder: string;
  messages: AgentMessage[];
}

interface ViewChildSummary {
  id: string;
  name: string;
  hasChildren: boolean;
  childCount: number;
  tags: string[];
  checked: boolean | null;
  isReference?: boolean;
  targetId?: string;
  children?: {
    total: number;
    items: ViewChildSummary[];
  };
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

function getContentChildIds(nodeId: string): string[] {
  return loroDoc.getChildren(nodeId).filter((childId) => {
    const child = loroDoc.toNodexNode(childId);
    return child != null && isOutlinerContentNodeType(child.type);
  });
}

function summarizeVisibleTree(
  nodeId: string,
  parentId: string,
  expandedNodes: Set<string>,
  depth: number,
): ViewChildSummary {
  const node = loroDoc.toNodexNode(nodeId);
  if (!node) {
    return {
      id: nodeId,
      name: '',
      hasChildren: false,
      childCount: 0,
      tags: [],
      checked: null,
    };
  }

  const isReference = node.type === 'reference' && !!node.targetId;
  const effectiveNodeId = isReference ? node.targetId! : nodeId;
  const effectiveNode = isReference ? loroDoc.toNodexNode(effectiveNodeId) ?? node : node;
  const effectiveChildIds = getContentChildIds(effectiveNodeId);

  const summary: ViewChildSummary = {
    id: nodeId,
    name: effectiveNode?.name ?? '',
    hasChildren: effectiveChildIds.length > 0,
    childCount: effectiveChildIds.length,
    tags: depth <= 1 ? getTagDisplayNames(effectiveNode?.tags ?? []) : [],
    checked: toCheckedValue(nodeId),
  };

  if (isReference) {
    summary.isReference = true;
    summary.targetId = effectiveNodeId;
  }

  const expandKey = buildExpandedNodeKey(MAIN_PANEL_ID, parentId, nodeId);
  if (expandedNodes.has(expandKey) && depth < VIEW_MAX_DEPTH && effectiveChildIds.length > 0) {
    const pagedIds = effectiveChildIds.slice(0, VIEW_MAX_CHILDREN);
    summary.children = {
      total: effectiveChildIds.length,
      items: pagedIds.map((childId) => summarizeVisibleTree(childId, effectiveNodeId, expandedNodes, depth + 1)),
    };
  }

  return summary;
}

export function buildViewContext(): string | null {
  const ui = useUIStore.getState();
  const currentNodeId = ui.currentNodeId;
  if (!currentNodeId || isAppPanel(currentNodeId)) return null;

  const node = loroDoc.toNodexNode(currentNodeId);
  if (!node) return null;

  const { ancestors, workspaceRootId } = getAncestorChain(currentNodeId);
  const breadcrumb = ancestors
    .filter((ancestor) => ancestor.id !== workspaceRootId)
    .map((ancestor) => ancestor.name);
  const contentChildIds = getContentChildIds(currentNodeId);
  const pagedIds = contentChildIds.slice(0, VIEW_MAX_CHILDREN);
  const viewData = {
    id: currentNodeId,
    name: node.name ?? '',
    tags: getTagDisplayNames(node.tags),
    breadcrumb,
    focusedNodeId: ui.focusedNodeId,
    children: {
      total: contentChildIds.length,
      items: pagedIds.map((childId) => summarizeVisibleTree(childId, currentNodeId, ui.expandedNodes, 0)),
    },
  };

  return [
    '<view-context>',
    JSON.stringify(viewData, null, 2),
    '</view-context>',
  ].join('\n');
}

const MAX_BROWSER_TABS = 20;

function isWebUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

function toOriginPath(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname === '/' ? '' : u.pathname;
    return host + path;
  } catch {
    return url;
  }
}

async function getPageContext(): Promise<string | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) return null;

  try {
    const allTabs = await chrome.tabs.query({ currentWindow: true });
    const webTabs = allTabs
      .filter((tab) => tab.url && tab.title && isWebUrl(tab.url))
      .slice(0, MAX_BROWSER_TABS);

    if (webTabs.length === 0) return null;

    const lines = webTabs.map((tab) => {
      const prefix = tab.active ? '[active, ' : '[';
      return `* ${prefix}id:${tab.id}] "${escapeXml(tab.title!)}" — ${escapeXml(toOriginPath(tab.url!))}`;
    });

    return [
      '<page-context>',
      'Tabs:',
      ...lines,
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
    buildViewContext(),
    await getPageContext(),
    buildTimeContext(),
    buildMentionedNodeEditReminder(),
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

  const existingParts: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> =
    typeof userMessage.content === 'string'
      ? [{ type: 'text', text: userMessage.content }]
      : userMessage.content.slice();

  existingParts.push({ type: 'text', text: normalizedReminder });

  nextMessages[userMessageIndex] = {
    ...userMessage,
    content: existingParts,
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

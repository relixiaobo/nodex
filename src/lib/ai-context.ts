import * as loroDoc from './loro-doc.js';
import { getAncestorChain } from './tree-utils.js';
import { isOutlinerContentNodeType } from './node-type-utils.js';
import { useUIStore } from '../stores/ui-store.js';

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
  const currentPanelId = ui.panelHistory[ui.panelIndex] ?? null;
  if (!currentPanelId || currentPanelId.startsWith('app:')) return null;

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

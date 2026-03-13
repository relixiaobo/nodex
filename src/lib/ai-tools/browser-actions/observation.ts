import type { AgentToolResult } from '@mariozechner/pi-agent-core';
import type { PageCaptureResult } from '../../page-capture/models.js';
import {
  BROWSER_FIND,
  BROWSER_GET_PAGE,
  BROWSER_GET_SELECTION,
} from '../browser-messaging.js';
import { assertBrowserResponseOk, requireNonEmptyString, sendBrowserMessage, textResult } from './shared.js';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function handleGetText(
  params: { maxChars?: number; textOffset?: number; tabId?: number },
): Promise<AgentToolResult<unknown>> {
  const result = await sendBrowserMessage<PageCaptureResult>(BROWSER_GET_PAGE, {
    tabId: params.tabId,
  });
  assertBrowserResponseOk(result);

  const text = stripHtml(result.page.contentHtml);
  const offset = params.textOffset ?? 0;
  const limit = params.maxChars ?? 30000;
  const slice = text.slice(offset, offset + limit);
  const truncated = (offset + limit) < text.length;
  const data = { text: slice, totalLength: text.length, offset, truncated };

  return textResult(data);
}

export async function handleGetMetadata(
  params: { tabId?: number } = {},
): Promise<AgentToolResult<unknown>> {
  const result = await sendBrowserMessage<PageCaptureResult>(BROWSER_GET_PAGE, {
    tabId: params.tabId,
  });
  assertBrowserResponseOk(result);

  const page = result.page;
  const data: Record<string, string> = { title: page.title, url: page.url };
  if (page.metadata.author) data.author = page.metadata.author;
  if (page.metadata.published) data.publishDate = page.metadata.published;
  if (page.metadata.description) data.description = page.metadata.description;
  if (page.metadata.siteName) data.siteName = page.metadata.siteName;

  return textResult(data);
}

export async function handleFind(params: { query?: string; tabId?: number }): Promise<AgentToolResult<unknown>> {
  const query = requireNonEmptyString(params.query, 'query', 'find');

  const result = await sendBrowserMessage<{ matches: Array<{ excerpt: string; index: number }>; total: number }>(
    BROWSER_FIND,
    { query, tabId: params.tabId },
  );
  assertBrowserResponseOk(result);

  return textResult(result);
}

export async function handleGetSelection(
  params: { tabId?: number } = {},
): Promise<AgentToolResult<unknown>> {
  const result = await sendBrowserMessage<{ text: string; hasSelection: boolean }>(
    BROWSER_GET_SELECTION,
    { tabId: params.tabId },
  );
  assertBrowserResponseOk(result);

  return textResult(result);
}

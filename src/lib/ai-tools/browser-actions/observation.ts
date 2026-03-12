import type { AgentToolResult } from '@mariozechner/pi-agent-core';
import type { PageCaptureResult } from '../../page-capture/models.js';
import {
  BROWSER_FIND,
  BROWSER_GET_PAGE,
  BROWSER_GET_SELECTION,
} from '../browser-messaging.js';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function sendMessage<T>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: T) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message ?? 'Browser message failed'));
        return;
      }

      resolve(response);
    });
  });
}

function assertBrowserResponseOk(result: unknown): void {
  if (!result || typeof result !== 'object') return;

  if ('ok' in result && result.ok === false) {
    const message = 'error' in result && typeof result.error === 'string'
      ? result.error
      : 'Browser action failed';
    throw new Error(message);
  }
}

export async function handleGetText(
  params: { maxChars?: number; textOffset?: number },
): Promise<AgentToolResult<unknown>> {
  const result = await sendMessage<PageCaptureResult>({ type: BROWSER_GET_PAGE });
  if (!result.ok) throw new Error(`Failed to capture page: ${result.error}`);

  const text = stripHtml(result.page.contentHtml);
  const offset = params.textOffset ?? 0;
  const limit = params.maxChars ?? 30000;
  const slice = text.slice(offset, offset + limit);
  const truncated = (offset + limit) < text.length;
  const data = { text: slice, totalLength: text.length, offset, truncated };

  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    details: data,
  };
}

export async function handleGetMetadata(): Promise<AgentToolResult<unknown>> {
  const result = await sendMessage<PageCaptureResult>({ type: BROWSER_GET_PAGE });
  if (!result.ok) throw new Error(`Failed to capture page: ${result.error}`);

  const page = result.page;
  const data: Record<string, string> = { title: page.title, url: page.url };
  if (page.metadata.author) data.author = page.metadata.author;
  if (page.metadata.published) data.publishDate = page.metadata.published;
  if (page.metadata.description) data.description = page.metadata.description;
  if (page.metadata.siteName) data.siteName = page.metadata.siteName;

  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    details: data,
  };
}

export async function handleFind(params: { query?: string }): Promise<AgentToolResult<unknown>> {
  if (!params.query?.trim()) {
    throw new Error("'find' action requires a non-empty 'query' parameter.");
  }

  const result = await sendMessage<{ matches: Array<{ excerpt: string; index: number }>; total: number } | { ok: false; error: string }>({
    type: BROWSER_FIND,
    payload: { query: params.query },
  });
  assertBrowserResponseOk(result);

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    details: result,
  };
}

export async function handleGetSelection(): Promise<AgentToolResult<unknown>> {
  const result = await sendMessage<{ text: string; hasSelection: boolean } | { ok: false; error: string }>({
    type: BROWSER_GET_SELECTION,
  });
  assertBrowserResponseOk(result);

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    details: result,
  };
}

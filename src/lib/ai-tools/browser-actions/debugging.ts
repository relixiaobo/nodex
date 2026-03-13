import type { AgentToolResult } from '@mariozechner/pi-agent-core';
import {
  BROWSER_READ_CONSOLE,
  BROWSER_READ_NETWORK,
  type BrowserConsoleLevel,
  type BrowserErrorResponse,
} from '../browser-messaging.js';
import { assertBrowserResponseOk, sendBrowserMessage, textResult } from './shared.js';

export async function handleReadNetwork(
  params: { urlPattern?: string; tabId?: number },
): Promise<AgentToolResult<unknown>> {
  const result = await sendBrowserMessage<Record<string, unknown> | BrowserErrorResponse>(BROWSER_READ_NETWORK, {
    urlPattern: params.urlPattern?.trim(),
    tabId: params.tabId,
  });
  assertBrowserResponseOk(result);
  return textResult(result);
}

export async function handleReadConsole(
  params: { logLevel?: BrowserConsoleLevel; tabId?: number },
): Promise<AgentToolResult<unknown>> {
  const result = await sendBrowserMessage<Record<string, unknown> | BrowserErrorResponse>(BROWSER_READ_CONSOLE, {
    logLevel: params.logLevel ?? 'all',
    tabId: params.tabId,
  });
  assertBrowserResponseOk(result);
  return textResult(result);
}

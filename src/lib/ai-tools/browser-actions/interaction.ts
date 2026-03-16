import type { AgentToolResult } from '@mariozechner/pi-agent-core';
import {
  BROWSER_CLICK,
  BROWSER_NAVIGATE,
  BROWSER_SCREENSHOT,
  BROWSER_SCROLL,
  BROWSER_TAB,
  BROWSER_TYPE,
  type BrowserErrorResponse,
  type BrowserScrollDirection,
  type BrowserTabAction,
} from '../browser-messaging.js';
import {
  assertBrowserResponseOk,
  clampAmount,
  imageResult,
  mutationResult,
  requireNonEmptyString,
  requireSelectorOrDescription,
  sendBrowserMessage,
  textResult,
} from './shared.js';

export async function handleScreenshot(
  params: { tabId?: number },
): Promise<AgentToolResult<unknown>> {
  const result = await sendBrowserMessage<
    { imageData: string; width: number; height: number; imageId: string } | BrowserErrorResponse
  >(BROWSER_SCREENSHOT, { tabId: params.tabId });
  assertBrowserResponseOk(result);

  return imageResult({
    imageId: result.imageId,
    width: result.width,
    height: result.height,
  }, result.imageData);
}

export async function handleClick(
  params: { selector?: string; elementDescription?: string; tabId?: number },
): Promise<AgentToolResult<unknown>> {
  const target = requireSelectorOrDescription(params, 'click');
  const result = await sendBrowserMessage<Record<string, unknown> | BrowserErrorResponse>(BROWSER_CLICK, {
    ...target,
    tabId: params.tabId,
  });
  assertBrowserResponseOk(result);
  return mutationResult(result, params.tabId);
}

export async function handleType(
  params: { selector?: string; elementDescription?: string; text?: string; tabId?: number },
): Promise<AgentToolResult<unknown>> {
  const text = requireNonEmptyString(params.text, 'text', 'type');
  const target = params.selector || params.elementDescription
    ? requireSelectorOrDescription(params, 'type')
    : {};

  const result = await sendBrowserMessage<Record<string, unknown> | BrowserErrorResponse>(BROWSER_TYPE, {
    ...target,
    text,
    tabId: params.tabId,
  });
  assertBrowserResponseOk(result);
  return mutationResult(result, params.tabId);
}

export async function handleScroll(
  params: { direction?: BrowserScrollDirection; amount?: number; tabId?: number },
): Promise<AgentToolResult<unknown>> {
  const direction = params.direction ?? 'down';
  const amount = clampAmount(params.amount, 3, 1, 10);

  const result = await sendBrowserMessage<Record<string, unknown> | BrowserErrorResponse>(BROWSER_SCROLL, {
    direction,
    amount,
    tabId: params.tabId,
  });
  assertBrowserResponseOk(result);
  return mutationResult(result, params.tabId);
}

export async function handleNavigate(
  params: { url?: string; tabId?: number },
): Promise<AgentToolResult<unknown>> {
  const url = requireNonEmptyString(params.url, 'url', 'navigate');

  const result = await sendBrowserMessage<Record<string, unknown> | BrowserErrorResponse>(BROWSER_NAVIGATE, {
    url,
    tabId: params.tabId,
  });
  assertBrowserResponseOk(result);
  return mutationResult(result, params.tabId);
}

export async function handleTab(
  params: { tabAction?: BrowserTabAction; tabId?: number; url?: string },
): Promise<AgentToolResult<unknown>> {
  const tabAction = requireNonEmptyString(params.tabAction, 'tabAction', 'tab') as BrowserTabAction;

  if ((tabAction === 'switch' || tabAction === 'close') && !params.tabId) {
    throw new Error(`'tab' action with tabAction='${tabAction}' requires 'tabId'.`);
  }

  if (tabAction === 'create' && params.url !== undefined && !params.url.trim()) {
    throw new Error("'tab' action with tabAction='create' requires a non-empty 'url' when provided.");
  }

  const result = await sendBrowserMessage<Record<string, unknown> | BrowserErrorResponse>(BROWSER_TAB, {
    tabAction,
    tabId: params.tabId,
    url: params.url?.trim(),
  });
  assertBrowserResponseOk(result);
  return mutationResult(result, params.tabId);
}

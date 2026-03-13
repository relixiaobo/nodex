import type { AgentToolResult } from '@mariozechner/pi-agent-core';
import {
  BROWSER_DRAG,
  BROWSER_EXECUTE_JS,
  BROWSER_FILL_FORM,
  BROWSER_KEY,
  BROWSER_WAIT,
  type BrowserErrorResponse,
  type BrowserTargetPosition,
} from '../browser-messaging.js';
import {
  assertBrowserResponseOk,
  requireNonEmptyString,
  requireSelectorOrDescription,
  sendBrowserMessage,
  textResult,
} from './shared.js';

export async function handleKey(
  params: { text?: string; tabId?: number },
): Promise<AgentToolResult<unknown>> {
  const text = requireNonEmptyString(params.text, 'text', 'key');
  const result = await sendBrowserMessage<Record<string, unknown> | BrowserErrorResponse>(BROWSER_KEY, {
    text,
    tabId: params.tabId,
  });
  assertBrowserResponseOk(result);
  return textResult(result);
}

export async function handleFillForm(
  params: { selector?: string; value?: string | number | boolean; tabId?: number },
): Promise<AgentToolResult<unknown>> {
  const selector = requireNonEmptyString(params.selector, 'selector', 'fill_form');
  if (params.value === undefined) {
    throw new Error("'fill_form' action requires a 'value' parameter.");
  }

  const result = await sendBrowserMessage<Record<string, unknown> | BrowserErrorResponse>(BROWSER_FILL_FORM, {
    selector,
    value: params.value,
    tabId: params.tabId,
  });
  assertBrowserResponseOk(result);
  return textResult(result);
}

export async function handleDrag(
  params: {
    selector?: string;
    targetSelector?: string;
    targetPosition?: BrowserTargetPosition;
    tabId?: number;
  },
): Promise<AgentToolResult<unknown>> {
  const selector = requireNonEmptyString(params.selector, 'selector', 'drag');
  const hasTargetSelector = !!params.targetSelector?.trim();
  const hasTargetPosition = params.targetPosition
    && Number.isFinite(params.targetPosition.x)
    && Number.isFinite(params.targetPosition.y);

  if (hasTargetSelector && hasTargetPosition) {
    throw new Error("'drag' action requires either 'targetSelector' or 'targetPosition', not both.");
  }

  if (!hasTargetSelector && !hasTargetPosition) {
    throw new Error("'drag' action requires either 'targetSelector' or 'targetPosition'.");
  }

  const result = await sendBrowserMessage<Record<string, unknown> | BrowserErrorResponse>(BROWSER_DRAG, {
    selector,
    targetSelector: params.targetSelector?.trim(),
    targetPosition: params.targetPosition,
    tabId: params.tabId,
  });
  assertBrowserResponseOk(result);
  return textResult(result);
}

export async function handleWait(
  params: { duration?: number; waitFor?: string; tabId?: number },
): Promise<AgentToolResult<unknown>> {
  const waitFor = params.waitFor?.trim();
  const duration = waitFor
    ? (params.duration !== undefined ? Math.min(10, Math.max(1, params.duration)) : undefined)
    : Math.min(10, Math.max(1, params.duration ?? 2));

  if (!waitFor && duration === undefined) {
    throw new Error("'wait' action requires either 'duration' or 'waitFor'.");
  }

  const result = await sendBrowserMessage<Record<string, unknown> | BrowserErrorResponse>(BROWSER_WAIT, {
    duration,
    waitFor,
    tabId: params.tabId,
  });
  assertBrowserResponseOk(result);
  return textResult(result);
}

export async function handleExecuteJs(
  params: { code?: string; tabId?: number },
): Promise<AgentToolResult<unknown>> {
  const code = requireNonEmptyString(params.code, 'code', 'execute_js');
  if (code.length > 5000) {
    throw new Error("'execute_js' action only supports code up to 5000 characters.");
  }

  const result = await sendBrowserMessage<Record<string, unknown> | BrowserErrorResponse>(BROWSER_EXECUTE_JS, {
    code,
    tabId: params.tabId,
  });
  assertBrowserResponseOk(result);
  return textResult(result);
}

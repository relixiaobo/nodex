import type { AgentToolResult } from '@mariozechner/pi-agent-core';
import type { BrowserErrorResponse } from '../browser-messaging.js';
import { formatResultText } from '../shared.js';

export function sendBrowserMessage<T>(type: string, payload?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (response: T) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message ?? 'Browser message failed'));
        return;
      }

      resolve(response);
    });
  });
}

export function assertBrowserResponseOk<T>(
  result: T | BrowserErrorResponse,
): asserts result is T {
  if (result == null) {
    throw new Error('No response from browser extension. The content script may not be injected on this page — try reloading the page or navigating to a regular http(s) URL.');
  }

  if (typeof result !== 'object') {
    throw new Error(`Unexpected browser response type: ${typeof result}. Expected an object.`);
  }

  if ('ok' in result && result.ok === false) {
    const message = 'error' in result && typeof result.error === 'string'
      ? result.error
      : 'Browser action failed';
    throw new Error(message);
  }
}

export function textResult<T>(details: T): AgentToolResult<T> {
  return {
    content: [{ type: 'text', text: formatResultText(details) }],
    details,
  };
}

export function imageResult<T>(details: T, imageData: string, mimeType = 'image/png'): AgentToolResult<T> {
  return {
    content: [
      { type: 'image', data: imageData, mimeType },
      { type: 'text', text: formatResultText(details) },
    ],
    details,
  };
}

export function requireNonEmptyString(
  value: string | undefined,
  paramName: string,
  actionName: string,
): string {
  const normalized = value?.trim() ?? '';
  if (!normalized) {
    throw new Error(`'${actionName}' action requires a non-empty '${paramName}' parameter.`);
  }
  return normalized;
}

export function requireSelectorOrDescription(
  params: { selector?: string; elementDescription?: string },
  actionName: string,
): { selector?: string; elementDescription?: string } {
  const selector = params.selector?.trim();
  const elementDescription = params.elementDescription?.trim();

  if (selector && elementDescription) {
    throw new Error(`'${actionName}' action requires either 'selector' or 'elementDescription', not both.`);
  }

  if (!selector && !elementDescription) {
    throw new Error(`'${actionName}' action requires either a 'selector' or 'elementDescription'.`);
  }

  return { selector, elementDescription };
}

export function clampAmount(value: number | undefined, defaultValue: number, min: number, max: number): number {
  const candidate = Number.isFinite(value) ? Math.trunc(value as number) : defaultValue;
  return Math.min(max, Math.max(min, candidate));
}

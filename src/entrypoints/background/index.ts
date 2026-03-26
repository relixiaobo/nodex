import {
  WEBCLIP_CAPTURE_ACTIVE_TAB,
  CONTENT_SCRIPT_READY,
  type WebClipCaptureResponse,
} from '../../lib/webclip-messaging.js';
import {
  PAGE_CAPTURE_ACTIVE_TAB,
  PAGE_CAPTURE_FETCH_X_VIDEO,
  capturePageFromTab,
  capturePageFromTabForWebClip,
  createContentScriptReadyTracker,
  ensureTabContentScript,
  fetchXVideoMetadata,
  forwardToTab,
  type PageCaptureResponse,
  type PageCaptureXVideoPayload,
  type PageCaptureXVideoResponse,
} from '../../lib/page-capture/index.js';
import {
  HIGHLIGHT_CREATE,
  HIGHLIGHT_DELETE,
  HIGHLIGHT_NOTES_SAVE,
  HIGHLIGHT_NOTE_GET,
  HIGHLIGHT_UNRESOLVABLE,
  HIGHLIGHT_RESTORE,
  HIGHLIGHT_REMOVE,
  HIGHLIGHT_SCROLL_TO,
  HIGHLIGHT_CHECK_URL,
  HIGHLIGHT_CHECK_URL_REQUEST,
  type HighlightCreatePayload,
  type HighlightCheckUrlPayload,
  type HighlightCheckUrlRequestPayload,
  type HighlightDeletePayload,
  type HighlightNotesSavePayload,
  type HighlightNoteGetPayload,
  type HighlightRestorePayload,
} from '../../lib/highlight-messaging.js';
import {
  enqueuePendingHighlight,
  removePendingHighlight,
  findPendingHighlight,
  updatePendingHighlightNotes,
  getPendingHighlightsForUrl,
} from '../../lib/highlight-pending-queue.js';
import {
  BROWSER_CLICK,
  BROWSER_DRAG,
  BROWSER_EXECUTE_JS,
  BROWSER_FIND,
  BROWSER_FILL_FORM,
  BROWSER_GET_PAGE,
  BROWSER_GET_SELECTION,
  BROWSER_KEY,
  BROWSER_NAVIGATE,
  BROWSER_READ_CONSOLE,
  BROWSER_READ_NETWORK,
  BROWSER_SCREENSHOT,
  BROWSER_SCROLL,
  BROWSER_TAB,
  BROWSER_TYPE,
  BROWSER_WAIT,
  type BrowserClickPayload,
  type BrowserDragPayload,
  type BrowserExecuteJsPayload,
  type BrowserFillFormPayload,
  type BrowserNavigatePayload,
  type BrowserReadConsolePayload,
  type BrowserReadNetworkPayload,
  type BrowserScrollPayload,
  type BrowserTabPayload,
  type BrowserTargetPosition,
  type BrowserTypePayload,
  type BrowserWaitPayload,
} from '../../lib/ai-tools/browser-messaging.js';
import {
  attachToTab,
  detachFromTab,
  enableConsoleTracking,
  enableNetworkTracking,
  evaluateInTab,
  getRecentConsoleMessages,
  getRecentNetworkRequests,
  sendCommand,
} from '../../lib/ai-tools/cdp-manager.js';

const readyTracker = createContentScriptReadyTracker();

function getActiveTabId(): Promise<number> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      const tabId = tabs[0]?.id;
      if (!tabId) {
        reject(new Error('No active tab found'));
        return;
      }

      resolve(tabId);
    });
  });
}

async function resolveTargetTabId(requestedTabId?: number): Promise<number> {
  if (requestedTabId !== undefined) return requestedTabId;
  return getActiveTabId();
}

function sendMessageToTab<T>(tabId: number, message: unknown): Promise<T | null> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (result?: T) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }

      resolve(result ?? null);
    });
  });
}

const pageCaptureTransport = {
  readyTracker,
  executeScript: async (tabId: number): Promise<void> => {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['/content-scripts/content.js'],
    });
  },
  sendMessageToTab,
};

/**
 * Check if a URL is valid for content script injection.
 * chrome://, edge://, about:, etc. cannot be injected.
 */
function isInjectableUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

/**
 * Check if the Side Panel is currently open.
 * Uses chrome.runtime.getContexts (MV3) to detect SIDE_PANEL contexts.
 */
async function isSidePanelOpen(): Promise<boolean> {
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['SIDE_PANEL' as chrome.runtime.ContextType],
    });
    return contexts.length > 0;
  } catch {
    return false;
  }
}

/** Whether an ID is a pending-queue temp ID (not a real node ID). */
function isTempId(id: string): boolean {
  return id.startsWith('temp_');
}

/**
 * Forward a message to the Side Panel via runtime.sendMessage.
 * Resolves with the SP's response, or rejects if SP is unreachable.
 */
function forwardToSidePanel(message: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

async function forwardHighlightCheck(payload: HighlightCheckUrlPayload): Promise<void> {
  const spOpen = await isSidePanelOpen();

  if (spOpen) {
    // Online: forward to SP for LoroDoc lookup + restore
    chrome.runtime.sendMessage({
      type: HIGHLIGHT_CHECK_URL,
      payload,
    }).catch(() => {});
    return;
  }

  // Offline: restore from pending queue
  const pending = await getPendingHighlightsForUrl(payload.url);
  if (pending.length === 0) return;

  const restorePayload: HighlightRestorePayload = {
    highlights: pending.map((e) => ({
      id: e.tempId,
      anchor: e.anchor,
      color: '#9B7C38',
      hasNote: !!(e.noteEntries && e.noteEntries.length > 0),
    })),
  };

  await forwardToTab(payload.tabId, {
    type: HIGHLIGHT_RESTORE,
    payload: restorePayload,
  }, pageCaptureTransport);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBrowserUrl(url: string): string {
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(url)) return url;
  return `https://${url}`;
}

function buildElementLookupExpression(target: { selector?: string; elementDescription?: string }): string {
  const selector = JSON.stringify(target.selector ?? null);
  const elementDescription = JSON.stringify(target.elementDescription ?? null);

  return `(() => {
    const selector = ${selector};
    const elementDescription = ${elementDescription};
    const normalize = (value) => String(value ?? '').toLowerCase().replace(/\\s+/g, ' ').trim();
    const describe = (element) => {
      const parts = [
        element.getAttribute?.('aria-label'),
        element.getAttribute?.('title'),
        element.getAttribute?.('placeholder'),
        'value' in element ? element.value : '',
        'innerText' in element ? element.innerText : '',
        element.textContent ?? '',
      ];
      return parts.filter(Boolean).join(' ').trim();
    };
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = window.getComputedStyle(element);
      return style.visibility !== 'hidden' && style.display !== 'none';
    };
    const toResult = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        found: true,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        element: element.tagName.toLowerCase(),
        label: describe(element).slice(0, 200),
      };
    };

    if (selector) {
      const element = document.querySelector(selector);
      if (!element || !isVisible(element)) {
        return { found: false, error: 'Element not found for selector: ' + selector };
      }
      return toResult(element);
    }

    const query = normalize(elementDescription);
    const tokens = query.split(' ').filter(Boolean);
    const candidates = Array.from(document.querySelectorAll('button, a, input, textarea, select, label, summary, [role="button"], [role="link"], [contenteditable="true"]'));
    let best = null;
    let bestScore = -1;

    for (const candidate of candidates) {
      if (!isVisible(candidate)) continue;
      const text = normalize(describe(candidate));
      if (!text) continue;

      let score = 0;
      if (text === query) {
        score = 100;
      } else if (text.includes(query)) {
        score = 80 + Math.min(20, query.length);
      } else {
        const matched = tokens.filter((token) => text.includes(token));
        score = matched.length * 12;
        if (matched.length === tokens.length && tokens.length > 0) score += 20;
      }

      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    if (!best) {
      return { found: false, error: 'Element not found for description: ' + elementDescription };
    }

    return toResult(best);
  })()`;
}

async function resolveElementTarget(
  tabId: number,
  target: { selector?: string; elementDescription?: string },
): Promise<{ x: number; y: number; element: string; label?: string }> {
  const result = await evaluateInTab<{
    found?: boolean;
    error?: string;
    x?: number;
    y?: number;
    element?: string;
    label?: string;
  }>(tabId, buildElementLookupExpression(target));

  if (!result?.found || !Number.isFinite(result.x) || !Number.isFinite(result.y)) {
    throw new Error(result?.error ?? 'Element not found');
  }

  const x = result.x as number;
  const y = result.y as number;

  return {
    x,
    y,
    element: result.element ?? target.selector ?? target.elementDescription ?? 'element',
    label: result.label,
  };
}

async function dispatchMouseClick(tabId: number, x: number, y: number): Promise<void> {
  await sendCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x,
    y,
    button: 'none',
  });
  await sendCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
  await sendCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
}

const KEY_ALIASES: Record<string, { key: string; code: string; keyCode: number; text?: string }> = {
  enter: { key: 'Enter', code: 'Enter', keyCode: 13 },
  escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  esc: { key: 'Escape', code: 'Escape', keyCode: 27 },
  tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  delete: { key: 'Delete', code: 'Delete', keyCode: 46 },
  space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
  arrowup: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  arrowdown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  arrowright: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
};

function parseKeyToken(token: string): {
  key: string;
  code: string;
  keyCode: number;
  text?: string;
  modifiers: number;
} {
  const parts = token.split('+').map((part) => part.trim()).filter(Boolean);
  const rawKey = (parts.pop() ?? '').trim();
  if (!rawKey) {
    throw new Error(`Invalid key token: "${token}"`);
  }

  let modifiers = 0;
  for (const modifier of parts) {
    switch (modifier.toLowerCase()) {
      case 'alt':
      case 'option':
        modifiers |= 1;
        break;
      case 'ctrl':
      case 'control':
        modifiers |= 2;
        break;
      case 'cmd':
      case 'command':
      case 'meta':
        modifiers |= 4;
        break;
      case 'shift':
        modifiers |= 8;
        break;
      default:
        throw new Error(`Unsupported key modifier: "${modifier}"`);
    }
  }

  const alias = KEY_ALIASES[rawKey.toLowerCase()];
  if (alias) {
    return { ...alias, modifiers };
  }

  if (rawKey.length === 1) {
    const char = rawKey;
    const upper = char.toUpperCase();
    const keyCode = upper.charCodeAt(0);
    const isLetter = /^[a-z]$/i.test(char);
    const isDigit = /^[0-9]$/.test(char);
    return {
      key: modifiers & 8 ? upper : char,
      code: isLetter ? `Key${upper}` : isDigit ? `Digit${char}` : '',
      keyCode,
      text: modifiers === 0 ? char : undefined,
      modifiers,
    };
  }

  throw new Error(`Unsupported key token: "${token}"`);
}

async function dispatchKeySequence(tabId: number, text: string): Promise<void> {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    throw new Error('No key sequence provided');
  }

  for (const token of tokens) {
    const key = parseKeyToken(token);
    const basePayload = {
      key: key.key,
      code: key.code,
      windowsVirtualKeyCode: key.keyCode,
      nativeVirtualKeyCode: key.keyCode,
      modifiers: key.modifiers,
    };

    await sendCommand(tabId, 'Input.dispatchKeyEvent', {
      ...basePayload,
      type: key.text && key.modifiers === 0 ? 'keyDown' : 'rawKeyDown',
      text: key.text,
      unmodifiedText: key.text,
    });

    if (key.text && key.modifiers === 0) {
      await sendCommand(tabId, 'Input.dispatchKeyEvent', {
        ...basePayload,
        type: 'char',
        text: key.text,
        unmodifiedText: key.text,
      });
    }

    await sendCommand(tabId, 'Input.dispatchKeyEvent', {
      ...basePayload,
      type: 'keyUp',
    });
  }
}

async function getTab(tabId: number): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message ?? `Tab not found: ${tabId}`));
        return;
      }

      if (!tab) {
        reject(new Error(`Tab not found: ${tabId}`));
        return;
      }

      resolve(tab);
    });
  });
}

async function updateTab(tabId: number, updateProperties: chrome.tabs.UpdateProperties): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, updateProperties, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message ?? `Failed to update tab ${tabId}`));
        return;
      }

      if (!tab) {
        reject(new Error(`Failed to update tab ${tabId}`));
        return;
      }

      resolve(tab);
    });
  });
}

async function createTab(createProperties: chrome.tabs.CreateProperties): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    chrome.tabs.create(createProperties, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message ?? 'Failed to create tab'));
        return;
      }

      if (!tab) {
        reject(new Error('Failed to create tab'));
        return;
      }

      resolve(tab);
    });
  });
}

async function removeTab(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.tabs.remove(tabId, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message ?? `Failed to close tab ${tabId}`));
        return;
      }

      resolve();
    });
  });
}

async function queryTabs(queryInfo: chrome.tabs.QueryInfo = {}): Promise<chrome.tabs.Tab[]> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message ?? 'Failed to list tabs'));
        return;
      }

      resolve(tabs);
    });
  });
}

async function waitForTabComplete(tabId: number, timeoutMs = 15_000): Promise<chrome.tabs.Tab> {
  const current = await getTab(tabId);
  if (current.status === 'complete') return current;

  return new Promise((resolve) => {
    const timeoutId = setTimeout(async () => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      // Timeout is not an error — page may still be usable (DOM loaded, resources pending).
      // Return current tab state instead of rejecting.
      try {
        resolve(await getTab(tabId));
      } catch {
        resolve(current);
      }
    }, timeoutMs);

    const onUpdated = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (updatedTabId !== tabId) return;
      if (changeInfo.status !== 'complete') return;

      clearTimeout(timeoutId);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve(tab);
    };

    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

async function goBack(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.tabs.goBack(tabId, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message ?? `Failed to go back on tab ${tabId}`));
        return;
      }

      resolve();
    });
  });
}

async function goForward(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.tabs.goForward(tabId, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message ?? `Failed to go forward on tab ${tabId}`));
        return;
      }

      resolve();
    });
  });
}

async function focusWindow(windowId: number | undefined): Promise<void> {
  if (windowId === undefined) return;

  await new Promise<void>((resolve, reject) => {
    chrome.windows.update(windowId, { focused: true }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message ?? `Failed to focus window ${windowId}`));
        return;
      }

      resolve();
    });
  });
}

async function captureActiveTabSilently(): Promise<{ imageData: string; width: number; height: number } | null> {
  try {
    const dataUrl: string = await chrome.tabs.captureVisibleTab({ format: 'png' });
    if (!dataUrl) return null;

    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    // Decode PNG header to read dimensions (bytes 16-23 contain width/height as 4-byte big-endian)
    const raw = atob(base64.slice(0, 48));
    const width = (raw.charCodeAt(16) << 24) | (raw.charCodeAt(17) << 16) | (raw.charCodeAt(18) << 8) | raw.charCodeAt(19);
    const height = (raw.charCodeAt(20) << 24) | (raw.charCodeAt(21) << 16) | (raw.charCodeAt(22) << 8) | raw.charCodeAt(23);

    return { imageData: base64, width, height };
  } catch {
    return null;
  }
}

async function handleBrowserScreenshot(tabId: number): Promise<{ imageData: string; width: number; height: number; imageId: string }> {
  // Use silent captureVisibleTab for the active tab (no debugger bar, no focus switch)
  const activeTabId = await getActiveTabId().catch(() => -1);
  if (tabId === activeTabId) {
    const silent = await captureActiveTabSilently();
    if (silent) {
      return { ...silent, imageId: `screenshot_${Date.now()}` };
    }
  }

  // Fall back to CDP for non-active tabs or if captureVisibleTab failed
  await attachToTab(tabId);
  const metrics = await sendCommand<{
    visualViewport?: { clientWidth?: number; clientHeight?: number };
  }>(tabId, 'Page.getLayoutMetrics');
  const capture = await sendCommand<{ data: string }>(tabId, 'Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
  });

  return {
    imageData: capture.data,
    width: Math.round(metrics.visualViewport?.clientWidth ?? 0),
    height: Math.round(metrics.visualViewport?.clientHeight ?? 0),
    imageId: `screenshot_${Date.now()}`,
  };
}

async function handleBrowserClick(tabId: number, payload: BrowserClickPayload): Promise<{ clicked: true; element: string }> {
  const target = await resolveElementTarget(tabId, payload);
  await dispatchMouseClick(tabId, target.x, target.y);
  return { clicked: true, element: target.label || target.element };
}

async function handleBrowserType(tabId: number, payload: BrowserTypePayload): Promise<{ typed: true }> {
  if (payload.selector || payload.elementDescription) {
    const target = await resolveElementTarget(tabId, payload);
    await dispatchMouseClick(tabId, target.x, target.y);
  }

  await sendCommand(tabId, 'Input.insertText', { text: payload.text });
  return { typed: true };
}

async function handleBrowserKey(tabId: number, text: string): Promise<{ pressed: true }> {
  await dispatchKeySequence(tabId, text);
  return { pressed: true };
}

async function handleBrowserScroll(tabId: number, payload: BrowserScrollPayload): Promise<{ scrolled: true }> {
  const direction = payload.direction ?? 'down';
  const amount = Math.min(10, Math.max(1, Math.trunc(payload.amount ?? 3)));
  const pixels = amount * 100;
  const delta = {
    up: { x: 0, y: -pixels },
    down: { x: 0, y: pixels },
    left: { x: -pixels, y: 0 },
    right: { x: pixels, y: 0 },
  }[direction];

  await evaluateInTab(tabId, `(() => {
    window.scrollBy(${delta.x}, ${delta.y});
    return { scrollX: window.scrollX, scrollY: window.scrollY };
  })()`);

  return { scrolled: true };
}

async function handleBrowserDrag(tabId: number, payload: BrowserDragPayload): Promise<{ dragged: true; from: string; to: string }> {
  const source = await resolveElementTarget(tabId, { selector: payload.selector });
  const target = payload.targetSelector
    ? await resolveElementTarget(tabId, { selector: payload.targetSelector })
    : payload.targetPosition;

  if (!target) {
    throw new Error('Drag target could not be resolved');
  }

  const targetPosition: BrowserTargetPosition = 'x' in target
    ? { x: target.x, y: target.y }
    : target;

  await sendCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: source.x,
    y: source.y,
    button: 'none',
  });
  await sendCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: source.x,
    y: source.y,
    button: 'left',
    clickCount: 1,
  });

  for (let step = 1; step <= 5; step += 1) {
    const progress = step / 5;
    await sendCommand(tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: source.x + ((targetPosition.x - source.x) * progress),
      y: source.y + ((targetPosition.y - source.y) * progress),
      button: 'left',
      buttons: 1,
    });
  }

  await sendCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: targetPosition.x,
    y: targetPosition.y,
    button: 'left',
    clickCount: 1,
  });

  return {
    dragged: true,
    from: payload.selector,
    to: payload.targetSelector ?? `${targetPosition.x},${targetPosition.y}`,
  };
}

async function handleBrowserFillForm(tabId: number, payload: BrowserFillFormPayload): Promise<{ filled: true }> {
  const result = await evaluateInTab<{
    filled?: boolean;
    error?: string;
  }>(tabId, `(() => {
    const selector = ${JSON.stringify(payload.selector)};
    const value = ${JSON.stringify(payload.value)};
    const element = document.querySelector(selector);
    if (!element) {
      return { filled: false, error: 'Element not found for selector: ' + selector };
    }

    const dispatch = () => {
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    };

    if (element instanceof HTMLInputElement) {
      element.focus();
      if (element.type === 'checkbox' || element.type === 'radio') {
        if (typeof value !== 'boolean') {
          return { filled: false, error: 'Checkbox and radio inputs require boolean values' };
        }
        element.checked = value;
      } else {
        element.value = String(value);
      }
      dispatch();
      return { filled: true };
    }

    if (element instanceof HTMLTextAreaElement) {
      element.focus();
      element.value = String(value);
      dispatch();
      return { filled: true };
    }

    if (element instanceof HTMLSelectElement) {
      const match = Array.from(element.options).find((option) => option.value === String(value) || option.text === String(value));
      if (!match) {
        return { filled: false, error: 'Select option not found: ' + value };
      }
      element.value = match.value;
      dispatch();
      return { filled: true };
    }

    if (element instanceof HTMLElement && element.isContentEditable) {
      element.focus();
      element.textContent = String(value);
      dispatch();
      return { filled: true };
    }

    return { filled: false, error: 'Element is not fillable: ' + selector };
  })()`);

  if (!result?.filled) {
    throw new Error(result?.error ?? 'Failed to fill form field');
  }

  return { filled: true };
}

async function handleBrowserNavigate(tabId: number, payload: BrowserNavigatePayload): Promise<{ url: string; title: string }> {
  if (payload.url === 'back') {
    await goBack(tabId);
  } else if (payload.url === 'forward') {
    await goForward(tabId);
  } else {
    await updateTab(tabId, { url: normalizeBrowserUrl(payload.url) });
  }

  const tab = await waitForTabComplete(tabId);
  return {
    url: tab.url ?? payload.url,
    title: tab.title ?? '',
  };
}

async function handleBrowserTab(payload: BrowserTabPayload): Promise<Record<string, unknown>> {
  switch (payload.tabAction) {
    case 'list': {
      const tabs = await queryTabs({});
      return {
        tabs: tabs.map((tab) => ({
          tabId: tab.id,
          title: tab.title ?? '',
          url: tab.url ?? '',
          active: !!tab.active,
        })),
      };
    }
    case 'switch': {
      if (!payload.tabId) throw new Error("'tab' action with tabAction='switch' requires 'tabId'.");
      const tab = await updateTab(payload.tabId, { active: true });
      await focusWindow(tab.windowId);
      return {
        switched: true,
        title: tab.title ?? '',
        url: tab.url ?? '',
      };
    }
    case 'create': {
      const tab = await createTab(payload.url ? { url: normalizeBrowserUrl(payload.url), active: false } : { active: false });
      return {
        created: true,
        tabId: tab.id,
        title: tab.title ?? '',
        url: tab.url ?? '',
      };
    }
    case 'close': {
      if (!payload.tabId) throw new Error("'tab' action with tabAction='close' requires 'tabId'.");
      await removeTab(payload.tabId);
      await detachFromTab(payload.tabId).catch(() => {});
      return { closed: true };
    }
    default:
      throw new Error(`Unsupported tab action: ${payload.tabAction}`);
  }
}

async function handleBrowserWait(tabId: number, payload: BrowserWaitPayload): Promise<{ waited: true; duration: number }> {
  const timeoutSeconds = Math.min(10, Math.max(1, payload.duration ?? (payload.waitFor ? 10 : 2)));

  if (!payload.waitFor) {
    await wait(timeoutSeconds * 1000);
    return { waited: true, duration: timeoutSeconds };
  }

  const selector = payload.waitFor.trim();
  const startedAt = Date.now();
  const timeoutAt = startedAt + (timeoutSeconds * 1000);

  while (Date.now() < timeoutAt) {
    const found = await evaluateInTab<boolean>(tabId, `Boolean(document.querySelector(${JSON.stringify(selector)}))`);
    if (found) {
      return { waited: true, duration: Math.max(1, Math.round((Date.now() - startedAt) / 1000)) };
    }
    await wait(100);
  }

  throw new Error(`Timed out after ${timeoutSeconds}s waiting for selector: ${selector}. Try a different selector or increase duration (max 10s).`);
}

async function handleBrowserExecuteJs(tabId: number, payload: BrowserExecuteJsPayload): Promise<{ result: unknown; type: string }> {
  const result = await evaluateInTab<unknown>(tabId, payload.code);
  const valueType = Array.isArray(result)
    ? 'array'
    : result === null
      ? 'null'
      : typeof result;

  return {
    result,
    type: valueType,
  };
}

async function handleBrowserReadNetwork(tabId: number, payload: BrowserReadNetworkPayload): Promise<ReturnType<typeof getRecentNetworkRequests>> {
  await enableNetworkTracking(tabId);
  await wait(100);
  return getRecentNetworkRequests(tabId, payload.urlPattern);
}

async function handleBrowserReadConsole(tabId: number, payload: BrowserReadConsolePayload): Promise<ReturnType<typeof getRecentConsoleMessages>> {
  await enableConsoleTracking(tabId);
  await wait(50);
  return getRecentConsoleMessages(tabId, payload.logLevel ?? 'all');
}

export default defineBackground(() => {
  // ── Theme-aware icon ──
  // Switch between light/dark icon sets based on system color scheme.
  // Light mode: green bg + paper cat; Dark mode: paper bg + green cat.
  function applyThemeIcon(isDark: boolean): void {
    const suffix = isDark ? '-dark' : '';
    chrome.action.setIcon({
      path: {
        16: `icon${suffix}/16.png`,
        32: `icon${suffix}/32.png`,
        48: `icon${suffix}/48.png`,
        128: `icon${suffix}/128.png`,
      },
    });
  }

  // Detect initial theme + listen for changes (Service Worker has window.matchMedia)
  if (typeof matchMedia !== 'undefined') {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    applyThemeIcon(mq.matches);
    mq.addEventListener('change', (e) => applyThemeIcon(e.matches));
  }

  // Open Side Panel when action button is clicked
  chrome.action.onClicked.addListener(async (tab) => {
    if (tab.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
    }
  });

  // Enable side panel to open on action click
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // ── Message Router ──
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const type = message?.type;

    // ── Content Script Ready: CS -> BG ──
    if (type === CONTENT_SCRIPT_READY) {
      const tabId = sender.tab?.id;
      if (tabId) {
        readyTracker.resolveReady(tabId, true);
      }
      sendResponse({ ok: true });
      return true;
    }

    // ── X Video URL Fetch: Content Script -> BG ──
    if (type === PAGE_CAPTURE_FETCH_X_VIDEO) {
      const payload = message.payload as PageCaptureXVideoPayload | undefined;
      if (!payload?.tweetId) {
        sendResponse({} as PageCaptureXVideoResponse);
        return true;
      }
      fetchXVideoMetadata(payload.tweetId).then((result) => {
        sendResponse(result);
      }).catch(() => {
        sendResponse({} as PageCaptureXVideoResponse);
      });
      return true;
    }

    // ── Page Capture: Side Panel/AI -> BG -> Content Script ──
    if (type === PAGE_CAPTURE_ACTIVE_TAB) {
      (async () => {
        try {
          const tabId = await getActiveTabId();
          const result = await capturePageFromTab(tabId, pageCaptureTransport);
          sendResponse(result);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          sendResponse({ ok: false, error } satisfies PageCaptureResponse);
        }
      })();
      return true;
    }

    // ── WebClip compatibility adapter: Side Panel -> BG -> Content Script ──
    if (type === WEBCLIP_CAPTURE_ACTIVE_TAB) {
      (async () => {
        try {
          const tabId = await getActiveTabId();
          const result = await capturePageFromTabForWebClip(tabId, pageCaptureTransport);
          sendResponse(result);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          sendResponse({ ok: false, error } satisfies WebClipCaptureResponse);
        }
      })();
      return true;
    }

    // ── Browser Tool: Side Panel -> BG -> Content Script ──
    if (type === BROWSER_GET_PAGE) {
      (async () => {
        try {
          const tabId = await resolveTargetTabId(message?.payload?.tabId);
          const result = await capturePageFromTab(tabId, pageCaptureTransport);
          sendResponse(result);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          sendResponse({ ok: false, error });
        }
      })();
      return true;
    }

    if (type === BROWSER_FIND || type === BROWSER_GET_SELECTION) {
      (async () => {
        try {
          const tabId = await resolveTargetTabId(message?.payload?.tabId);
          const result = await forwardToTab(tabId, message, pageCaptureTransport);
          sendResponse(result);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          sendResponse({ ok: false, error });
        }
      })();
      return true;
    }

    if (
      type === BROWSER_SCREENSHOT
      || type === BROWSER_CLICK
      || type === BROWSER_TYPE
      || type === BROWSER_KEY
      || type === BROWSER_SCROLL
      || type === BROWSER_DRAG
      || type === BROWSER_FILL_FORM
      || type === BROWSER_NAVIGATE
      || type === BROWSER_TAB
      || type === BROWSER_WAIT
      || type === BROWSER_EXECUTE_JS
      || type === BROWSER_READ_NETWORK
      || type === BROWSER_READ_CONSOLE
    ) {
      (async () => {
        try {
          switch (type) {
            case BROWSER_SCREENSHOT: {
              const tabId = await resolveTargetTabId(message?.payload?.tabId);
              sendResponse(await handleBrowserScreenshot(tabId));
              return;
            }
            case BROWSER_CLICK: {
              const payload = message.payload as BrowserClickPayload | undefined;
              if (!payload?.selector && !payload?.elementDescription) {
                throw new Error("'click' action requires 'selector' or 'elementDescription'.");
              }
              const tabId = await resolveTargetTabId(payload?.tabId);
              sendResponse(await handleBrowserClick(tabId, payload ?? {}));
              return;
            }
            case BROWSER_TYPE: {
              const payload = message.payload as BrowserTypePayload | undefined;
              if (!payload?.text) throw new Error("'type' action requires 'text'.");
              const tabId = await resolveTargetTabId(payload.tabId);
              sendResponse(await handleBrowserType(tabId, payload));
              return;
            }
            case BROWSER_KEY: {
              const payload = message.payload as { text?: string; tabId?: number } | undefined;
              if (!payload?.text) throw new Error("'key' action requires 'text'.");
              const tabId = await resolveTargetTabId(payload.tabId);
              sendResponse(await handleBrowserKey(tabId, payload.text));
              return;
            }
            case BROWSER_SCROLL: {
              const payload = message.payload as BrowserScrollPayload | undefined;
              const tabId = await resolveTargetTabId(payload?.tabId);
              sendResponse(await handleBrowserScroll(tabId, payload ?? {}));
              return;
            }
            case BROWSER_DRAG: {
              const payload = message.payload as BrowserDragPayload | undefined;
              if (!payload?.selector) throw new Error("'drag' action requires 'selector'.");
              const tabId = await resolveTargetTabId(payload.tabId);
              sendResponse(await handleBrowserDrag(tabId, payload));
              return;
            }
            case BROWSER_FILL_FORM: {
              const payload = message.payload as BrowserFillFormPayload | undefined;
              if (!payload?.selector) throw new Error("'fill_form' action requires 'selector'.");
              const tabId = await resolveTargetTabId(payload.tabId);
              sendResponse(await handleBrowserFillForm(tabId, payload));
              return;
            }
            case BROWSER_NAVIGATE: {
              const payload = message.payload as BrowserNavigatePayload | undefined;
              if (!payload?.url) throw new Error("'navigate' action requires 'url'.");
              const tabId = await resolveTargetTabId(payload.tabId);
              sendResponse(await handleBrowserNavigate(tabId, payload));
              return;
            }
            case BROWSER_TAB: {
              const payload = message.payload as BrowserTabPayload | undefined;
              if (!payload?.tabAction) throw new Error("'tab' action requires 'tabAction'.");
              sendResponse(await handleBrowserTab(payload));
              return;
            }
            case BROWSER_WAIT: {
              const payload = message.payload as BrowserWaitPayload | undefined;
              const tabId = await resolveTargetTabId(payload?.tabId);
              sendResponse(await handleBrowserWait(tabId, payload ?? {}));
              return;
            }
            case BROWSER_EXECUTE_JS: {
              const payload = message.payload as BrowserExecuteJsPayload | undefined;
              if (!payload?.code) throw new Error("'execute_js' action requires 'code'.");
              const tabId = await resolveTargetTabId(payload.tabId);
              sendResponse(await handleBrowserExecuteJs(tabId, payload));
              return;
            }
            case BROWSER_READ_NETWORK: {
              const payload = message.payload as BrowserReadNetworkPayload | undefined;
              const tabId = await resolveTargetTabId(payload?.tabId);
              sendResponse(await handleBrowserReadNetwork(tabId, payload ?? {}));
              return;
            }
            case BROWSER_READ_CONSOLE: {
              const payload = message.payload as BrowserReadConsolePayload | undefined;
              const tabId = await resolveTargetTabId(payload?.tabId);
              sendResponse(await handleBrowserReadConsole(tabId, payload ?? {}));
              return;
            }
          }
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          sendResponse({ ok: false, error });
        }
      })();
      return true;
    }

    // ── Highlight Create: Content Script -> BG -> Side Panel (with offline queue) ──
    if (type === HIGHLIGHT_CREATE) {
      const tabId = sender.tab?.id;
      if (!tabId) return false;

      (async () => {
        const spOpen = await isSidePanelOpen();

        if (spOpen) {
          try {
            const spResponse = await forwardToSidePanel({ ...message, _tabId: tabId });
            sendResponse(spResponse ?? { ok: true });
            return;
          } catch {
            // SP disappeared mid-forward — fall through to queue
          }
        }

        // Offline or forward failed → enqueue
        const payload = message.payload as HighlightCreatePayload | undefined;
        if (!payload) {
          sendResponse({ ok: false, error: 'Missing highlight payload' });
          return;
        }

        await enqueuePendingHighlight({
          tempId: payload.tempId ?? `temp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          anchor: payload.anchor,
          selectedText: payload.selectedText,
          pageUrl: payload.pageUrl,
          pageTitle: payload.pageTitle,
          noteEntries: payload.noteEntries,
          pageMeta: payload.pageMeta,
        });

        sendResponse({ ok: true, queued: true });
      })();
      return true;
    }

    // ── Highlight Delete: CS -> BG (tempId → storage, else → SP) ──
    if (type === HIGHLIGHT_DELETE) {
      const tabId = sender.tab?.id;
      if (!tabId) return false;
      const payload = message.payload as HighlightDeletePayload | undefined;
      if (payload?.id && isTempId(payload.id)) {
        removePendingHighlight(payload.id).then(() => {
          sendResponse({ ok: true, deleted: true });
        });
        return true;
      }
      chrome.runtime.sendMessage(
        { ...message, _tabId: tabId },
        (spResponse) => {
          if (chrome.runtime.lastError) {
            sendResponse({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          sendResponse(spResponse ?? { ok: true });
        },
      );
      return true;
    }

    // ── Highlight Note Get: CS -> BG (tempId → storage, else → SP) ──
    if (type === HIGHLIGHT_NOTE_GET) {
      const tabId = sender.tab?.id;
      if (!tabId) return false;
      const payload = message.payload as HighlightNoteGetPayload | undefined;
      if (payload?.id && isTempId(payload.id)) {
        findPendingHighlight(payload.id).then((entry) => {
          sendResponse({ ok: true, noteEntries: entry?.noteEntries ?? [] });
        });
        return true;
      }
      chrome.runtime.sendMessage(
        { ...message, _tabId: tabId },
        (spResponse) => {
          if (chrome.runtime.lastError) {
            sendResponse({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          sendResponse(spResponse ?? { ok: true });
        },
      );
      return true;
    }

    // ── Highlight Notes Save: CS -> BG (tempId → storage, else → SP) ──
    if (type === HIGHLIGHT_NOTES_SAVE) {
      const tabId = sender.tab?.id;
      if (!tabId) return false;
      const payload = message.payload as HighlightNotesSavePayload | undefined;
      if (payload?.id && isTempId(payload.id)) {
        updatePendingHighlightNotes(payload.id, payload.noteEntries).then(() => {
          sendResponse({ ok: true });
        });
        return true;
      }
      chrome.runtime.sendMessage(
        { ...message, _tabId: tabId },
        (spResponse) => {
          if (chrome.runtime.lastError) {
            sendResponse({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          sendResponse(spResponse ?? { ok: true });
        },
      );
      return true;
    }

    // ── Highlight Unresolvable: Content Script -> BG -> Side Panel ──
    if (type === HIGHLIGHT_UNRESOLVABLE) {
      if (!sender.tab?.id) return false;
      chrome.runtime.sendMessage(message).catch(() => {});
      sendResponse({ ok: true });
      return true;
    }

    // ── Highlight URL Change: Content Script -> BG -> Side Panel ──
    if (type === HIGHLIGHT_CHECK_URL_REQUEST) {
      const tabId = sender.tab?.id;
      const payload = message.payload as HighlightCheckUrlRequestPayload | undefined;
      if (!tabId || !payload?.url) {
        sendResponse({ ok: false, error: 'Invalid check-url-request payload' });
        return true;
      }
      forwardHighlightCheck({ url: payload.url, tabId }).then(() => {
        sendResponse({ ok: true });
      });
      return true;
    }

    // ── Highlight Restore: Side Panel -> BG -> Content Script ──
    if (type === HIGHLIGHT_RESTORE) {
      (async () => {
        try {
          const tabId = await resolveTargetTabId(message._tabId);
          const result = await forwardToTab(tabId, {
            type: HIGHLIGHT_RESTORE,
            payload: message.payload,
          }, pageCaptureTransport);
          sendResponse(result);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          sendResponse({ ok: false, error });
        }
      })();
      return true;
    }

    // ── Highlight Remove: Side Panel -> BG -> Content Script ──
    if (type === HIGHLIGHT_REMOVE) {
      (async () => {
        try {
          const tabId = await resolveTargetTabId(message._tabId);
          const result = await forwardToTab(tabId, {
            type: HIGHLIGHT_REMOVE,
            payload: message.payload,
          }, pageCaptureTransport);
          sendResponse(result);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          sendResponse({ ok: false, error });
        }
      })();
      return true;
    }

    // ── Highlight Scroll To: Side Panel -> BG -> Content Script ──
    if (type === HIGHLIGHT_SCROLL_TO) {
      (async () => {
        try {
          const tabId = await resolveTargetTabId(message._tabId);
          const result = await forwardToTab(tabId, {
            type: HIGHLIGHT_SCROLL_TO,
            payload: message.payload,
          }, pageCaptureTransport);
          sendResponse(result);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          sendResponse({ ok: false, error });
        }
      })();
      return true;
    }
  });

  // ── URL Change Listener — inject content script + trigger highlight echo check ──
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading') {
      readyTracker.resolveReady(tabId, false);
      return;
    }

    // Only react to completed navigation with a valid URL
    if (changeInfo.status !== 'complete') return;
    if (!isInjectableUrl(tab.url)) return;

    // Inject content script so selection toolbar is available immediately
    void ensureTabContentScript(tabId, pageCaptureTransport);

    // Send CHECK_URL to Side Panel (or restore from pending queue if offline)
    void forwardHighlightCheck({
      url: tab.url!,
      tabId,
    });
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    readyTracker.resolveReady(tabId, false);
  });
});

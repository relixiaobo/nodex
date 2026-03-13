import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import { Type } from '@mariozechner/pi-ai';
import {
  handleFind,
  handleGetMetadata,
  handleGetSelection,
  handleGetText,
} from './browser-actions/observation.js';
import {
  handleClick,
  handleNavigate,
  handleScreenshot,
  handleScroll,
  handleTab,
  handleType,
} from './browser-actions/interaction.js';
import {
  handleDrag,
  handleExecuteJs,
  handleFillForm,
  handleKey,
  handleWait,
} from './browser-actions/deep-interaction.js';
import { handleReadConsole, handleReadNetwork } from './browser-actions/debugging.js';

const BROWSER_DESCRIPTION = `Read, interact with, and debug the user's browser tab. All actions target the user's currently active tab unless a tabId is specified.

Observation actions (no side effects):
- "get_text": Extract the main text content of the page. Limited to 30000 characters; use textOffset for pagination on long pages.
- "get_metadata": Get page metadata (title, URL, author, date). Lightweight — call this first to understand what the user is viewing.
- "find": Search for text on the page. Returns up to 20 matching excerpts with context.
- "get_selection": Get the user's currently selected/highlighted text.
- "screenshot": Take a screenshot of the visible viewport. Returns an image.
- "read_network": Read recent network requests (XHR/fetch).
- "read_console": Read console log messages.

Interaction actions (have side effects):
- "click": Click an element by CSS selector or natural language description.
- "type": Type text into the currently focused element or a targeted input.
- "key": Press keyboard keys (e.g. "Enter", "Escape", "cmd+a").
- "scroll": Scroll the page in a direction.
- "drag": Drag an element to a target position or element.
- "fill_form": Set a form field value by selector.

Control actions:
- "navigate": Go to a URL or navigate back/forward in history.
- "tab": Switch, create, close, or list browser tabs.
- "wait": Wait for a duration or until an element appears.
- "execute_js": Execute JavaScript in the page context.

Before interacting with elements, use find or screenshot to locate the target.`;

const browserToolParameters = Type.Object({
  action: Type.Union([
    Type.Literal('get_text'),
    Type.Literal('get_metadata'),
    Type.Literal('find'),
    Type.Literal('get_selection'),
    Type.Literal('screenshot'),
    Type.Literal('read_network'),
    Type.Literal('read_console'),
    Type.Literal('click'),
    Type.Literal('type'),
    Type.Literal('key'),
    Type.Literal('scroll'),
    Type.Literal('drag'),
    Type.Literal('fill_form'),
    Type.Literal('navigate'),
    Type.Literal('tab'),
    Type.Literal('wait'),
    Type.Literal('execute_js'),
  ], { description: 'The browser operation to perform.' }),
  maxChars: Type.Optional(Type.Number({
    description: "For 'get_text': max characters to return (default: 30000).",
    default: 30000,
  })),
  textOffset: Type.Optional(Type.Number({
    description: "For 'get_text': character offset for pagination (default: 0).",
    default: 0,
  })),
  query: Type.Optional(Type.String({
    description: "For 'find': text to search for. Case-insensitive. Returns up to 20 excerpts.",
  })),
  tabId: Type.Optional(Type.Number({
    description: 'Optional target tab ID for any browser action. Defaults to the active tab.',
  })),
  selector: Type.Optional(Type.String({
    description: "For 'click', 'fill_form', 'drag': CSS selector of target element.",
  })),
  elementDescription: Type.Optional(Type.String({
    description: "For 'click': natural language description. Alternative to selector.",
  })),
  text: Type.Optional(Type.String({
    description: "For 'type': text to type. For 'key': keys to press (e.g. 'Enter', 'cmd+a').",
  })),
  direction: Type.Optional(Type.Union([
    Type.Literal('up'),
    Type.Literal('down'),
    Type.Literal('left'),
    Type.Literal('right'),
  ], { description: "For 'scroll': direction." })),
  amount: Type.Optional(Type.Number({
    description: "For 'scroll': ticks (default: 3).",
    default: 3,
  })),
  targetPosition: Type.Optional(Type.Object({
    x: Type.Number(),
    y: Type.Number(),
  }, { description: "For 'drag': target viewport position {x, y}." })),
  url: Type.Optional(Type.String({
    description: "For 'navigate': URL. Use 'back'/'forward' for history.",
  })),
  tabAction: Type.Optional(Type.Union([
    Type.Literal('switch'),
    Type.Literal('create'),
    Type.Literal('close'),
    Type.Literal('list'),
  ], { description: "For 'tab': operation to perform." })),
  duration: Type.Optional(Type.Number({
    description: "For 'wait': seconds (default: 2, max: 10).",
    default: 2,
  })),
  waitFor: Type.Optional(Type.String({ description: "For 'wait': CSS selector to wait for." })),
  urlPattern: Type.Optional(Type.String({ description: "For 'read_network': URL pattern filter." })),
  logLevel: Type.Optional(Type.Union([
    Type.Literal('all'),
    Type.Literal('error'),
    Type.Literal('warn'),
    Type.Literal('log'),
    Type.Literal('info'),
  ], { description: "For 'read_console': log level (default: 'all')." })),
  code: Type.Optional(Type.String({
    description: "For 'execute_js': JS expression to evaluate in page context.",
  })),
  value: Type.Optional(Type.Union([
    Type.String(),
    Type.Number(),
    Type.Boolean(),
  ], { description: "For 'fill_form': value to set." })),
  targetSelector: Type.Optional(Type.String({
    description: "For 'drag': CSS selector of drop target.",
  })),
});

type BrowserToolParams = typeof browserToolParameters.static;

function notImplemented(action: string): AgentToolResult<unknown> {
  const data = {
    error: `Action '${action}' is not yet implemented. Available actions: get_text, get_metadata, find, get_selection.`,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    details: data,
  };
}

async function executeBrowserTool(params: BrowserToolParams): Promise<AgentToolResult<unknown>> {
  switch (params.action) {
    case 'get_text':
      return handleGetText({ maxChars: params.maxChars, textOffset: params.textOffset, tabId: params.tabId });
    case 'get_metadata':
      return handleGetMetadata({ tabId: params.tabId });
    case 'find':
      return handleFind({ query: params.query, tabId: params.tabId });
    case 'get_selection':
      return handleGetSelection({ tabId: params.tabId });
    case 'screenshot':
      return handleScreenshot({ tabId: params.tabId });
    case 'click':
      return handleClick({
        selector: params.selector,
        elementDescription: params.elementDescription,
        tabId: params.tabId,
      });
    case 'type':
      return handleType({
        selector: params.selector,
        elementDescription: params.elementDescription,
        text: params.text,
        tabId: params.tabId,
      });
    case 'key':
      return handleKey({ text: params.text, tabId: params.tabId });
    case 'scroll':
      return handleScroll({ direction: params.direction, amount: params.amount, tabId: params.tabId });
    case 'drag':
      return handleDrag({
        selector: params.selector,
        targetSelector: params.targetSelector,
        targetPosition: params.targetPosition,
        tabId: params.tabId,
      });
    case 'fill_form':
      return handleFillForm({
        selector: params.selector,
        value: params.value,
        tabId: params.tabId,
      });
    case 'navigate':
      return handleNavigate({ url: params.url, tabId: params.tabId });
    case 'tab':
      return handleTab({ tabAction: params.tabAction, tabId: params.tabId, url: params.url });
    case 'wait':
      return handleWait({ duration: params.duration, waitFor: params.waitFor, tabId: params.tabId });
    case 'execute_js':
      return handleExecuteJs({ code: params.code, tabId: params.tabId });
    case 'read_network':
      return handleReadNetwork({ urlPattern: params.urlPattern, tabId: params.tabId });
    case 'read_console':
      return handleReadConsole({ logLevel: params.logLevel, tabId: params.tabId });
  }

  return notImplemented(params.action);
}

export const browserTool: AgentTool<typeof browserToolParameters, unknown> = {
  name: 'browser',
  label: 'Browser',
  description: BROWSER_DESCRIPTION,
  parameters: browserToolParameters,
  execute: async (_toolCallId, params) => executeBrowserTool(params),
};

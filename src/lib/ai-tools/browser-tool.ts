import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import { Type } from '@mariozechner/pi-ai';
import {
  handleFind,
  handleGetMetadata,
  handleGetSelection,
  handleGetText,
} from './browser-actions/observation.js';

const BROWSER_DESCRIPTION = `Read, interact with, and debug the user's browser tab. All actions target the user's currently active tab unless a tabId is specified.

Observation actions (no side effects):
- "get_text": Extract the main text content of the page. Limited to 30000 characters; use textOffset for pagination on long pages.
- "get_metadata": Get page metadata (title, URL, author, date). Lightweight — call this first to understand what the user is viewing.
- "find": Search for text on the page. Returns up to 20 matching excerpts with context.
- "get_selection": Get the user's currently selected/highlighted text.
- "screenshot": Take a screenshot. (Not yet implemented)
- "read_network", "read_console": (Not yet implemented)

Interaction actions (not yet implemented):
- "click", "type", "key", "scroll", "drag", "fill_form"

Control actions (not yet implemented):
- "navigate", "tab", "wait", "execute_js"`;

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
  url: Type.Optional(Type.String({
    description: "For 'navigate': URL. Use 'back'/'forward' for history.",
  })),
  tabAction: Type.Optional(Type.Union([
    Type.Literal('switch'),
    Type.Literal('create'),
    Type.Literal('close'),
    Type.Literal('list'),
  ], { description: "For 'tab': operation to perform." })),
  tabId: Type.Optional(Type.Number({ description: "For 'tab': target tab ID." })),
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
  value: Type.Optional(Type.String({ description: "For 'fill_form': value to set." })),
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
      return handleGetText({ maxChars: params.maxChars, textOffset: params.textOffset });
    case 'get_metadata':
      return handleGetMetadata();
    case 'find':
      return handleFind({ query: params.query });
    case 'get_selection':
      return handleGetSelection();
    default:
      return notImplemented(params.action);
  }
}

export const browserTool: AgentTool<typeof browserToolParameters, unknown> = {
  name: 'browser',
  label: 'Browser',
  description: BROWSER_DESCRIPTION,
  parameters: browserToolParameters,
  execute: async (_toolCallId, params) => executeBrowserTool(params),
};

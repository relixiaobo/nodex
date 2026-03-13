export const BROWSER_GET_PAGE = 'browser:get_page' as const;
export const BROWSER_FIND = 'browser:find' as const;
export const BROWSER_GET_SELECTION = 'browser:get_selection' as const;
export const BROWSER_SCREENSHOT = 'browser:screenshot' as const;
export const BROWSER_CLICK = 'browser:click' as const;
export const BROWSER_TYPE = 'browser:type' as const;
export const BROWSER_KEY = 'browser:key' as const;
export const BROWSER_SCROLL = 'browser:scroll' as const;
export const BROWSER_DRAG = 'browser:drag' as const;
export const BROWSER_FILL_FORM = 'browser:fill_form' as const;
export const BROWSER_NAVIGATE = 'browser:navigate' as const;
export const BROWSER_TAB = 'browser:tab' as const;
export const BROWSER_WAIT = 'browser:wait' as const;
export const BROWSER_EXECUTE_JS = 'browser:execute_js' as const;
export const BROWSER_READ_NETWORK = 'browser:read_network' as const;
export const BROWSER_READ_CONSOLE = 'browser:read_console' as const;

export interface BrowserTargetPosition {
  x: number;
  y: number;
}

export interface BrowserBasePayload {
  tabId?: number;
}

export interface BrowserFindPayload extends BrowserBasePayload {
  query: string;
}

export interface BrowserSelectorPayload extends BrowserBasePayload {
  selector?: string;
  elementDescription?: string;
}

export type BrowserClickPayload = BrowserSelectorPayload;

export interface BrowserTypePayload extends BrowserSelectorPayload {
  text: string;
}

export type BrowserScrollDirection = 'up' | 'down' | 'left' | 'right';

export interface BrowserScrollPayload extends BrowserBasePayload {
  direction?: BrowserScrollDirection;
  amount?: number;
}

export interface BrowserDragPayload extends BrowserBasePayload {
  selector: string;
  targetSelector?: string;
  targetPosition?: BrowserTargetPosition;
}

export interface BrowserFillFormPayload extends BrowserBasePayload {
  selector: string;
  value: string | number | boolean;
}

export interface BrowserNavigatePayload extends BrowserBasePayload {
  url: string;
}

export type BrowserTabAction = 'switch' | 'create' | 'close' | 'list';

export interface BrowserTabPayload extends BrowserBasePayload {
  tabAction: BrowserTabAction;
  url?: string;
}

export interface BrowserWaitPayload extends BrowserBasePayload {
  duration?: number;
  waitFor?: string;
}

export interface BrowserExecuteJsPayload extends BrowserBasePayload {
  code: string;
}

export interface BrowserReadNetworkPayload extends BrowserBasePayload {
  urlPattern?: string;
}

export type BrowserConsoleLevel = 'all' | 'error' | 'warn' | 'log' | 'info';

export interface BrowserReadConsolePayload extends BrowserBasePayload {
  logLevel?: BrowserConsoleLevel;
}

export interface BrowserErrorResponse {
  ok: false;
  error: string;
}

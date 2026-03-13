import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSendMessageFn = vi.fn();

vi.stubGlobal('chrome', {
  runtime: {
    sendMessage(message: unknown, callback: (response: unknown) => void): void {
      Promise.resolve(mockSendMessageFn(message))
        .then((value: unknown) => callback(value))
        .catch(() => callback(null));
    },
    get lastError() {
      return null;
    },
  },
});

let browserTool: typeof import('../../src/lib/ai-tools/browser-tool.js').browserTool;

const noop = () => {};
const signal = new AbortController().signal;

beforeAll(async () => {
  ({ browserTool } = await import('../../src/lib/ai-tools/browser-tool.js'));
});

async function execute(params: Record<string, unknown>) {
  return browserTool.execute('id', params as never, signal, noop);
}

describe('browser tool', () => {
  beforeEach(() => {
    mockSendMessageFn.mockReset();
  });

  describe('tool metadata', () => {
    it('has name browser', () => {
      expect(browserTool.name).toBe('browser');
    });

    it('has label Browser', () => {
      expect(browserTool.label).toBe('Browser');
    });

    it('description mentions get_text', () => {
      expect(browserTool.description).toContain('get_text');
    });

    it('description mentions screenshot and click', () => {
      expect(browserTool.description).toContain('screenshot');
      expect(browserTool.description).toContain('click');
    });
  });

  describe('get_text', () => {
    beforeEach(() => {
      mockSendMessageFn.mockResolvedValue({
        ok: true,
        page: {
          contentHtml: '<p>Hello world. This is a test.</p>',
          title: 'Test',
          url: 'https://example.com',
          metadata: {},
        },
      });
    });

    it('returns text, totalLength, offset, truncated', async () => {
      const result = await execute({ action: 'get_text' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.text).toContain('Hello world');
      expect(typeof parsed.totalLength).toBe('number');
      expect(parsed.offset).toBe(0);
      expect(typeof parsed.truncated).toBe('boolean');
    });

    it('truncates at maxChars and includes pagination hint', async () => {
      mockSendMessageFn.mockResolvedValue({
        ok: true,
        page: {
          contentHtml: `<p>${'A'.repeat(100)}</p>`,
          title: 'T',
          url: 'https://x.com',
          metadata: {},
        },
      });

      const result = await execute({ action: 'get_text', maxChars: 10 });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.text.length).toBeLessThanOrEqual(10);
      expect(parsed.truncated).toBe(true);
      expect(parsed.nextOffset).toBe(10);
      expect(parsed.hint).toContain('textOffset');
    });

    it('applies textOffset', async () => {
      const result = await execute({ action: 'get_text', textOffset: 5, maxChars: 100 });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.offset).toBe(5);
    });

    it('throws on capture failure', async () => {
      mockSendMessageFn.mockResolvedValue({ ok: false, error: 'Tab not found' });

      await expect(execute({ action: 'get_text' })).rejects.toThrow('Tab not found');
    });
  });

  describe('screenshot', () => {
    it('returns image content and details', async () => {
      mockSendMessageFn.mockResolvedValue({
        imageId: 'shot_1',
        imageData: 'base64-image',
        width: 1280,
        height: 720,
      });

      const result = await execute({ action: 'screenshot' });

      expect(result.content[0]).toEqual({
        type: 'image',
        data: 'base64-image',
        mimeType: 'image/png',
      });
      expect(result.details).toEqual({
        imageId: 'shot_1',
        width: 1280,
        height: 720,
      });
      expect(mockSendMessageFn).toHaveBeenCalledWith({
        type: 'browser:screenshot',
        payload: { tabId: undefined },
      });
    });
  });

  describe('get_metadata', () => {
    it('returns title, url, author, publishDate, description, siteName', async () => {
      mockSendMessageFn.mockResolvedValue({
        ok: true,
        page: {
          contentHtml: '<p>x</p>',
          title: 'Paper Title',
          url: 'https://arxiv.org/1',
          metadata: {
            author: 'Alice',
            published: '2026-01-01',
            description: 'Desc',
            siteName: 'arXiv',
          },
        },
      });

      const result = await execute({ action: 'get_metadata' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.title).toBe('Paper Title');
      expect(parsed.url).toBe('https://arxiv.org/1');
      expect(parsed.author).toBe('Alice');
      expect(parsed.publishDate).toBe('2026-01-01');
      expect(parsed.description).toBe('Desc');
      expect(parsed.siteName).toBe('arXiv');
    });
  });

  describe('find', () => {
    it('throws for empty query', async () => {
      await expect(execute({ action: 'find', query: '' })).rejects.toThrow("'find' action requires");
    });

    it('throws for missing query', async () => {
      await expect(execute({ action: 'find' })).rejects.toThrow("'find' action requires");
    });

    it('returns CS matches', async () => {
      mockSendMessageFn.mockResolvedValue({
        matches: [{ excerpt: 'hello world', index: 0 }],
        total: 1,
      });

      const result = await execute({ action: 'find', query: 'hello' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.total).toBe(1);
      expect(parsed.matches[0].index).toBe(0);
      expect(mockSendMessageFn).toHaveBeenCalledWith({
        type: 'browser:find',
        payload: { query: 'hello', tabId: undefined },
      });
    });
  });

  describe('get_selection', () => {
    it('returns selection state from CS', async () => {
      mockSendMessageFn.mockResolvedValue({ text: 'my selection', hasSelection: true });

      const result = await execute({ action: 'get_selection' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.text).toBe('my selection');
      expect(parsed.hasSelection).toBe(true);
    });
  });

  describe('interaction routing', () => {
    it('routes click with selector', async () => {
      mockSendMessageFn.mockResolvedValue({ clicked: true, element: '#submit' });

      const result = await execute({ action: 'click', selector: '#submit' });

      expect(result.details).toEqual({ clicked: true, element: '#submit' });
      expect(mockSendMessageFn).toHaveBeenCalledWith({
        type: 'browser:click',
        payload: { selector: '#submit', elementDescription: undefined, tabId: undefined },
      });
    });

    it('rejects click without target', async () => {
      await expect(execute({ action: 'click' })).rejects.toThrow("'click' action requires either a 'selector' or 'elementDescription'.");
    });

    it('routes type without explicit selector to focused element', async () => {
      mockSendMessageFn.mockResolvedValue({ typed: true });

      const result = await execute({ action: 'type', text: 'hello' });

      expect(result.details).toEqual({ typed: true });
      expect(mockSendMessageFn).toHaveBeenCalledWith({
        type: 'browser:type',
        payload: { text: 'hello', tabId: undefined },
      });
    });

    it('routes scroll with default direction and clamped amount', async () => {
      mockSendMessageFn.mockResolvedValue({ scrolled: true });

      const result = await execute({ action: 'scroll', amount: 99 });

      expect(result.details).toEqual({ scrolled: true });
      expect(mockSendMessageFn).toHaveBeenCalledWith({
        type: 'browser:scroll',
        payload: { direction: 'down', amount: 10, tabId: undefined },
      });
    });

    it('routes navigate to background', async () => {
      mockSendMessageFn.mockResolvedValue({ url: 'https://example.com', title: 'Example' });

      const result = await execute({ action: 'navigate', url: 'example.com' });

      expect(result.details).toEqual({ url: 'https://example.com', title: 'Example' });
      expect(mockSendMessageFn).toHaveBeenCalledWith({
        type: 'browser:navigate',
        payload: { url: 'example.com', tabId: undefined },
      });
    });

    it('routes tab list action', async () => {
      mockSendMessageFn.mockResolvedValue({
        tabs: [{ tabId: 1, title: 'Example', url: 'https://example.com', active: true }],
      });

      const result = await execute({ action: 'tab', tabAction: 'list' });

      expect(result.details).toEqual({
        tabs: [{ tabId: 1, title: 'Example', url: 'https://example.com', active: true }],
      });
      expect(mockSendMessageFn).toHaveBeenCalledWith({
        type: 'browser:tab',
        payload: { tabAction: 'list', tabId: undefined, url: undefined },
      });
    });
  });

  describe('deep interaction routing', () => {
    it('routes key sequences', async () => {
      mockSendMessageFn.mockResolvedValue({ pressed: true });

      const result = await execute({ action: 'key', text: 'cmd+a' });

      expect(result.details).toEqual({ pressed: true });
      expect(mockSendMessageFn).toHaveBeenCalledWith({
        type: 'browser:key',
        payload: { text: 'cmd+a', tabId: undefined },
      });
    });

    it('validates fill_form value', async () => {
      await expect(execute({ action: 'fill_form', selector: '#email' })).rejects.toThrow("'fill_form' action requires a 'value' parameter.");
    });

    it('routes fill_form with boolean values', async () => {
      mockSendMessageFn.mockResolvedValue({ filled: true });

      const result = await execute({ action: 'fill_form', selector: '#remember', value: true });

      expect(result.details).toEqual({ filled: true });
      expect(mockSendMessageFn).toHaveBeenCalledWith({
        type: 'browser:fill_form',
        payload: { selector: '#remember', value: true, tabId: undefined },
      });
    });

    it('validates drag target selection', async () => {
      await expect(execute({ action: 'drag', selector: '#card' })).rejects.toThrow("'drag' action requires either 'targetSelector' or 'targetPosition'.");
    });

    it('routes drag with targetPosition', async () => {
      mockSendMessageFn.mockResolvedValue({ dragged: true, from: '#card', to: '400,200' });

      const result = await execute({
        action: 'drag',
        selector: '#card',
        targetPosition: { x: 400, y: 200 },
      });

      expect(result.details).toEqual({ dragged: true, from: '#card', to: '400,200' });
      expect(mockSendMessageFn).toHaveBeenCalledWith({
        type: 'browser:drag',
        payload: {
          selector: '#card',
          targetSelector: undefined,
          targetPosition: { x: 400, y: 200 },
          tabId: undefined,
        },
      });
    });

    it('routes wait with selector', async () => {
      mockSendMessageFn.mockResolvedValue({ waited: true, duration: 3 });

      const result = await execute({ action: 'wait', waitFor: '#done', duration: 3 });

      expect(result.details).toEqual({ waited: true, duration: 3 });
      expect(mockSendMessageFn).toHaveBeenCalledWith({
        type: 'browser:wait',
        payload: { duration: 3, waitFor: '#done', tabId: undefined },
      });
    });

    it('routes execute_js', async () => {
      mockSendMessageFn.mockResolvedValue({ result: 'Example', type: 'string' });

      const result = await execute({ action: 'execute_js', code: 'document.title' });

      expect(result.details).toEqual({ result: 'Example', type: 'string' });
      expect(mockSendMessageFn).toHaveBeenCalledWith({
        type: 'browser:execute_js',
        payload: { code: 'document.title', tabId: undefined },
      });
    });
  });

  describe('debugging routing', () => {
    it('routes read_network with filters', async () => {
      mockSendMessageFn.mockResolvedValue({ requests: [], total: 0 });

      const result = await execute({ action: 'read_network', urlPattern: 'api.example.com' });

      expect(result.details).toEqual({ requests: [], total: 0 });
      expect(mockSendMessageFn).toHaveBeenCalledWith({
        type: 'browser:read_network',
        payload: { urlPattern: 'api.example.com', tabId: undefined },
      });
    });

    it('routes read_console with log level', async () => {
      mockSendMessageFn.mockResolvedValue({ messages: [], total: 0 });

      const result = await execute({ action: 'read_console', logLevel: 'warn' });

      expect(result.details).toEqual({ messages: [], total: 0 });
      expect(mockSendMessageFn).toHaveBeenCalledWith({
        type: 'browser:read_console',
        payload: { logLevel: 'warn', tabId: undefined },
      });
    });
  });
});

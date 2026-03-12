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
  });

  describe('unimplemented actions', () => {
    for (const action of ['screenshot', 'click', 'navigate', 'execute_js', 'read_network']) {
      it(`returns not-implemented for ${action}`, async () => {
        const result = await execute({ action });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.error).toContain('not yet implemented');
      });
    }
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

    it('truncates at maxChars', async () => {
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
});

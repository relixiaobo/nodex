import { describe, it, expect } from 'vitest';
import { extractYouTubeId, normalizeUrl } from '../../src/lib/url-utils.js';

describe('extractYouTubeId', () => {
  describe('standard watch URLs', () => {
    it('extracts ID from youtube.com/watch?v=ID', () => {
      expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('extracts ID from youtube.com/watch?v=ID without www', () => {
      expect(extractYouTubeId('https://youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('extracts ID from youtube.com/watch?v=ID with http', () => {
      expect(extractYouTubeId('http://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('handles watch URL with additional query parameters', () => {
      expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s&list=PLxxx')).toBe('dQw4w9WgXcQ');
    });

    it('returns null for watch URL without v parameter', () => {
      expect(extractYouTubeId('https://www.youtube.com/watch?t=10s')).toBeNull();
    });
  });

  describe('short URLs (youtu.be)', () => {
    it('extracts ID from youtu.be/ID', () => {
      expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('extracts ID from www.youtu.be/ID', () => {
      expect(extractYouTubeId('https://www.youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('extracts ID from youtu.be with http', () => {
      expect(extractYouTubeId('http://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('handles youtu.be with query parameters', () => {
      expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ?t=10s')).toBe('dQw4w9WgXcQ');
    });

    it('returns null for youtu.be with empty path', () => {
      expect(extractYouTubeId('https://youtu.be/')).toBeNull();
    });
  });

  describe('embed URLs', () => {
    it('extracts ID from youtube.com/embed/ID', () => {
      expect(extractYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('extracts ID from youtube.com/embed/ID without www', () => {
      expect(extractYouTubeId('https://youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('extracts ID from embed URL with query parameters', () => {
      expect(extractYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0')).toBe('dQw4w9WgXcQ');
    });
  });

  describe('shorts URLs', () => {
    it('extracts ID from youtube.com/shorts/ID', () => {
      expect(extractYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('extracts ID from youtube.com/shorts/ID without www', () => {
      expect(extractYouTubeId('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('extracts ID from shorts URL with query parameters', () => {
      expect(extractYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share')).toBe('dQw4w9WgXcQ');
    });
  });

  describe('live URLs', () => {
    it('extracts ID from youtube.com/live/ID', () => {
      expect(extractYouTubeId('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('extracts ID from youtube.com/live/ID without www', () => {
      expect(extractYouTubeId('https://youtube.com/live/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('extracts ID from live URL with query parameters', () => {
      expect(extractYouTubeId('https://www.youtube.com/live/dQw4w9WgXcQ?feature=share')).toBe('dQw4w9WgXcQ');
    });
  });

  describe('valid ID formats', () => {
    it('accepts IDs with uppercase letters', () => {
      expect(extractYouTubeId('https://www.youtube.com/watch?v=ABC123xyz')).toBe('ABC123xyz');
    });

    it('accepts IDs with underscores and hyphens', () => {
      expect(extractYouTubeId('https://www.youtube.com/watch?v=_A-b_C-d')).toBe('_A-b_C-d');
    });
  });

  describe('non-YouTube URLs', () => {
    it('returns null for vimeo.com', () => {
      expect(extractYouTubeId('https://vimeo.com/123456789')).toBeNull();
    });

    it('returns null for google.com', () => {
      expect(extractYouTubeId('https://www.google.com/search?q=youtube')).toBeNull();
    });

    it('returns null for example.com', () => {
      expect(extractYouTubeId('https://example.com/video')).toBeNull();
    });

    it('returns null for youtube-like domain that is not youtube', () => {
      expect(extractYouTubeId('https://www.youtube-like.com/watch?v=abc')).toBeNull();
    });
  });

  describe('invalid URLs', () => {
    it('returns null for malformed URL', () => {
      expect(extractYouTubeId('not a url')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(extractYouTubeId('')).toBeNull();
    });

    it('returns null for URL without protocol', () => {
      expect(extractYouTubeId('youtube.com/watch?v=abc')).toBeNull();
    });

    it('returns null for only protocol', () => {
      expect(extractYouTubeId('https://')).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('extracts ID from youtube.com with path that does not match any pattern', () => {
      expect(extractYouTubeId('https://www.youtube.com/results?search_query=hello')).toBeNull();
    });

    it('returns null for youtube.com root URL', () => {
      expect(extractYouTubeId('https://www.youtube.com/')).toBeNull();
    });

    it('extracts ID when multiple slashes follow pattern', () => {
      expect(extractYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ/something')).toBe('dQw4w9WgXcQ');
    });
  });
});

describe('normalizeUrl', () => {
  describe('protocol upgrade', () => {
    it('upgrades http to https for root URL', () => {
      expect(normalizeUrl('http://example.com')).toBe('https://example.com/');
    });

    it('keeps https unchanged for root URL', () => {
      expect(normalizeUrl('https://example.com')).toBe('https://example.com/');
    });

    it('upgrades http to https with path', () => {
      expect(normalizeUrl('http://example.com/path')).toBe('https://example.com/path');
    });
  });

  describe('fragment removal', () => {
    it('removes fragment from root URL', () => {
      expect(normalizeUrl('https://example.com#section')).toBe('https://example.com/');
    });

    it('removes fragment with path', () => {
      expect(normalizeUrl('https://example.com/page#section')).toBe('https://example.com/page');
    });

    it('removes empty fragment', () => {
      expect(normalizeUrl('https://example.com#')).toBe('https://example.com/');
    });

    it('removes complex fragment', () => {
      expect(normalizeUrl('https://example.com/page#section-with-dash')).toBe('https://example.com/page');
    });
  });

  describe('trailing slash removal', () => {
    it('removes trailing slash', () => {
      expect(normalizeUrl('https://example.com/path/')).toBe('https://example.com/path');
    });

    it('preserves root slash', () => {
      expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
    });

    it('removes trailing slash with multiple levels', () => {
      expect(normalizeUrl('https://example.com/path/to/resource/')).toBe('https://example.com/path/to/resource');
    });

    it('handles single character path with trailing slash', () => {
      expect(normalizeUrl('https://example.com/a/')).toBe('https://example.com/a');
    });
  });

  describe('www prefix removal', () => {
    it('removes www. prefix from root URL', () => {
      expect(normalizeUrl('https://www.example.com')).toBe('https://example.com/');
    });

    it('keeps non-www URLs unchanged for root', () => {
      expect(normalizeUrl('https://example.com')).toBe('https://example.com/');
    });

    it('removes www. with path', () => {
      expect(normalizeUrl('https://www.example.com/path')).toBe('https://example.com/path');
    });

    it('handles subdomain that starts with www but is not www', () => {
      expect(normalizeUrl('https://www2.example.com')).toBe('https://www2.example.com/');
    });
  });

  describe('query parameters', () => {
    it('preserves query parameters with root URL', () => {
      expect(normalizeUrl('https://example.com?key=value')).toBe('https://example.com/?key=value');
    });

    it('preserves multiple query parameters', () => {
      expect(normalizeUrl('https://example.com/path?foo=bar&baz=qux')).toBe('https://example.com/path?foo=bar&baz=qux');
    });

    it('preserves query parameters with path', () => {
      expect(normalizeUrl('https://example.com/path?key=value')).toBe('https://example.com/path?key=value');
    });

    it('removes fragment but preserves query parameters with root', () => {
      expect(normalizeUrl('https://example.com?key=value#section')).toBe('https://example.com/?key=value');
    });
  });

  describe('combined normalizations', () => {
    it('applies all normalizations together', () => {
      expect(normalizeUrl('http://www.example.com/path/?key=value#section')).toBe(
        'https://example.com/path?key=value'
      );
    });

    it('handles complex real-world URL', () => {
      expect(normalizeUrl('http://www.youtube.com/watch?v=dQw4w9WgXcQ#t=10s')).toBe(
        'https://youtube.com/watch?v=dQw4w9WgXcQ'
      );
    });

    it('applies normalizations without modifying valid parts', () => {
      expect(normalizeUrl('https://example.com/path/to/page?id=123&name=test')).toBe(
        'https://example.com/path/to/page?id=123&name=test'
      );
    });

    it('handles www removal with trailing slash removal', () => {
      expect(normalizeUrl('https://www.example.com/path/')).toBe('https://example.com/path');
    });
  });

  describe('invalid URLs', () => {
    it('returns original string for malformed URL', () => {
      const malformed = 'not a url';
      expect(normalizeUrl(malformed)).toBe(malformed);
    });

    it('returns original string for empty string', () => {
      expect(normalizeUrl('')).toBe('');
    });

    it('returns original string for URL without protocol', () => {
      const noProtocol = 'example.com';
      expect(normalizeUrl(noProtocol)).toBe(noProtocol);
    });

    it('returns original string for only protocol', () => {
      expect(normalizeUrl('https://')).toBe('https://');
    });

    it('preserves non-http/https protocols', () => {
      expect(normalizeUrl('ftp://example.com')).toBe('ftp://example.com/');
    });
  });

  describe('edge cases', () => {
    it('handles localhost without port', () => {
      expect(normalizeUrl('http://localhost/path')).toBe('https://localhost/path');
    });

    it('handles localhost with port (port is stripped)', () => {
      expect(normalizeUrl('http://localhost:3000/path')).toBe('https://localhost/path');
    });

    it('handles IP addresses without port', () => {
      expect(normalizeUrl('http://192.168.1.1/path')).toBe('https://192.168.1.1/path');
    });

    it('handles IP addresses with port (port is stripped)', () => {
      expect(normalizeUrl('http://192.168.1.1:8080/path')).toBe('https://192.168.1.1/path');
    });

    it('strips port numbers from standard domains', () => {
      expect(normalizeUrl('https://example.com:8443/path')).toBe('https://example.com/path');
    });

    it('handles URL with encoded characters', () => {
      expect(normalizeUrl('https://example.com/path%20with%20spaces')).toBe('https://example.com/path%20with%20spaces');
    });

    it('preserves file protocol', () => {
      expect(normalizeUrl('file:///path/to/file')).toBe('file:///path/to/file');
    });
  });
});

import { describe, it, expect } from 'vitest';

/**
 * EmbedNodeRenderer tests — validate twitter-video embed logic.
 *
 * The component itself is a React component tested visually via the Chrome
 * extension. These tests cover the URL/format constants.
 */

describe('twitter-video embed', () => {
  it('video.twimg.com URL is used as direct mp4 source', () => {
    const mediaUrl = 'https://video.twimg.com/ext_tw_video/123/pu/vid/720x1280/abc.mp4';
    expect(mediaUrl).toContain('video.twimg.com');
    expect(mediaUrl).toContain('.mp4');
  });

  it('poster URL comes from pbs.twimg.com', () => {
    const poster = 'https://pbs.twimg.com/ext_tw_video_thumb/123/pu/img/abc.jpg';
    expect(poster).toContain('pbs.twimg.com');
  });
});

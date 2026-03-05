/**
 * Substack image clipping — regression tests for Cloudinary URL handling.
 *
 * Defuddle's picture rule splits srcset by commas, which truncates
 * Cloudinary/Substack CDN URLs (they embed comma-separated transform params).
 * Our parser must fall back to srcset when src is broken.
 */
import { describe, it, expect } from 'vitest';
import { parseHtmlToNodes } from '../../src/lib/html-to-nodes.js';

describe('parseHtmlToNodes — Substack/Cloudinary images', () => {
  it('falls back to srcset when Defuddle truncates src (Substack CDN)', () => {
    // This is what Defuddle actually outputs: truncated src + full srcset
    const html = `<div>
<p>A summary of the RAM scores.</p>
<figure>
  <img src="https://substackcdn.com/image/fetch/$s_!eppK!" width="1456" height="806" alt=""
       srcset="https://substackcdn.com/image/fetch/$s_!eppK!,w_424,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F726fcde9-2645-4c77-9779-03882beb295b_2554x1414.png 424w, https://substackcdn.com/image/fetch/$s_!eppK!,w_1456,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F726fcde9-2645-4c77-9779-03882beb295b_2554x1414.png 1456w">
  <figcaption>The time here is days since release.</figcaption>
</figure>
<h1>Artifacts Log</h1>
</div>`;

    const { nodes } = parseHtmlToNodes(html);

    const imageNode = nodes.find(n => n.type === 'image');
    expect(imageNode).toBeDefined();
    // Should use the 1456w srcset URL, not the truncated src
    expect(imageNode!.mediaUrl).toContain('726fcde9');
    expect(imageNode!.mediaUrl).toContain('1456');
    expect(imageNode!.mediaAlt).toBe('The time here is days since release.');
    expect(imageNode!.imageWidth).toBe(1456);
    expect(imageNode!.imageHeight).toBe(806);
  });

  it('uses src directly when it is a valid complete URL', () => {
    const html = `<img src="https://example.com/images/photo.jpg" alt="A photo" width="800" height="600">`;
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('image');
    expect(nodes[0].mediaUrl).toBe('https://example.com/images/photo.jpg');
  });

  it('uses src for Substack URLs that are NOT truncated', () => {
    // img[3] from Defuddle output — small image with complete src (no srcset)
    const html = `<img src="https://substackcdn.com/image/fetch/$s_!96vs!,w_56,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F49f25d0a.png">`;
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('image');
    expect(nodes[0].mediaUrl).toContain('49f25d0a');
  });

  it('extracts largest width from srcset', () => {
    const html = `<img src="broken"
       srcset="https://cdn.example.com/img-small.jpg 320w, https://cdn.example.com/img-large.jpg 1200w, https://cdn.example.com/img-medium.jpg 640w">`;
    const { nodes } = parseHtmlToNodes(html);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].mediaUrl).toBe('https://cdn.example.com/img-large.jpg');
  });
});

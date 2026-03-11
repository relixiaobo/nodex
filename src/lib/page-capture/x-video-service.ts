import type { XVideoAsset } from './models.js';

export function generateSyndicationToken(tweetId: string): string {
  return ((Number(tweetId) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

export async function fetchXVideoMetadata(
  tweetId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<XVideoAsset> {
  const token = generateSyndicationToken(tweetId);
  const url = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=en&token=${token}`;

  const response = await fetchImpl(url);
  if (!response.ok) return {};

  const data = await response.json();
  const mediaDetails = data?.mediaDetails;
  if (!Array.isArray(mediaDetails)) return {};

  for (const media of mediaDetails) {
    if (media.type !== 'video' && media.type !== 'animated_gif') continue;
    const variants = media.video_info?.variants;
    if (!Array.isArray(variants)) continue;

    let bestMp4: { url: string; bitrate: number } | undefined;
    for (const variant of variants) {
      if (variant.content_type !== 'video/mp4') continue;
      const bitrate = variant.bitrate ?? 0;
      if (!bestMp4 || bitrate > bestMp4.bitrate) {
        bestMp4 = { url: variant.url, bitrate };
      }
    }

    if (bestMp4) {
      return {
        mp4Url: bestMp4.url,
        posterUrl: media.media_url_https,
      };
    }
  }

  return {};
}

/**
 * Renders an embed node (twitter-video, etc.) inline in the outliner.
 * twitter-video → native <video> player (or poster with play overlay if no direct link).
 * Unknown type → link fallback.
 */
import { PlayCircle } from 'lucide-react';

interface EmbedNodeRendererProps {
  embedType?: string;
  mediaUrl?: string;
  mediaAlt?: string;
}

export function EmbedNodeRenderer({ embedType, mediaUrl, mediaAlt }: EmbedNodeRendererProps) {
  if (embedType === 'twitter-video') {
    return <TwitterVideoEmbed mediaUrl={mediaUrl} poster={mediaAlt} />;
  }

  // Unknown embed type — link fallback
  if (mediaUrl) {
    return (
      <a
        href={mediaUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-primary underline"
      >
        {mediaUrl}
      </a>
    );
  }

  return null;
}

/**
 * Twitter video embed:
 * - With mediaUrl (direct mp4): native <video> player
 * - Without mediaUrl (poster only): poster image with play overlay
 */
function TwitterVideoEmbed({ mediaUrl, poster }: { mediaUrl?: string; poster?: string }) {
  // Playable video: native <video> element
  if (mediaUrl) {
    return (
      <div className="w-full overflow-hidden rounded" style={{ aspectRatio: '16 / 9' }}>
        <video
          src={mediaUrl}
          poster={poster}
          controls
          preload="metadata"
          className="w-full h-full object-contain bg-black"
        >
          <track kind="captions" />
        </video>
      </div>
    );
  }

  // Poster only (no direct video link): show poster with play overlay
  if (poster) {
    return (
      <div
        className="relative w-full overflow-hidden rounded bg-black"
        style={{ aspectRatio: '16 / 9' }}
      >
        <img
          src={poster}
          alt="Video thumbnail"
          loading="lazy"
          className="w-full h-full object-contain"
        />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <PlayCircle className="h-12 w-12 text-white/70 drop-shadow-lg" strokeWidth={1.5} />
        </div>
      </div>
    );
  }

  return null;
}

/**
 * Renders an image node inline in the outliner.
 * Displays the image with lazy loading. Shows a placeholder on error.
 */
import { useState, useCallback } from 'react';
import { ImageIcon } from 'lucide-react';

interface ImageNodeRendererProps {
  mediaUrl: string;
  mediaAlt?: string;
  imageWidth?: number;
  imageHeight?: number;
}

export function ImageNodeRenderer({ mediaUrl, mediaAlt, imageWidth, imageHeight }: ImageNodeRendererProps) {
  const [error, setError] = useState(false);
  const handleError = useCallback(() => setError(true), []);

  if (error) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded border border-border bg-background-secondary text-foreground-tertiary text-xs">
        <ImageIcon className="h-4 w-4 shrink-0" />
        <span className="truncate">{mediaAlt || 'Image failed to load'}</span>
      </div>
    );
  }

  const aspectRatio = imageWidth && imageHeight ? `${imageWidth} / ${imageHeight}` : undefined;

  return (
    <img
      src={mediaUrl}
      alt={mediaAlt ?? ''}
      loading="lazy"
      onError={handleError}
      className="max-w-full rounded"
      style={{ aspectRatio }}
    />
  );
}

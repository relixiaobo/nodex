/**
 * UrlCitePopover — popover showing a URL with an "Open in new tab" button.
 *
 * Used by CitationBadge (type="url") to preview and open web resources.
 */
import { useCallback } from 'react';
import { ExternalLink } from '../../lib/icons.js';
import { PopoverShell } from './PopoverShell.js';

const URL_DISPLAY_MAX = 60;

interface UrlCitePopoverProps {
  url: string;
  anchorRect: DOMRect;
  onClose: () => void;
}

function truncateUrl(url: string): string {
  if (url.length <= URL_DISPLAY_MAX) return url;
  return `${url.slice(0, URL_DISPLAY_MAX - 3)}...`;
}

export function UrlCitePopover({ url, anchorRect, onClose }: UrlCitePopoverProps) {
  const handleOpen = useCallback(() => {
    window.open(url, '_blank', 'noopener');
    onClose();
  }, [url, onClose]);

  return (
    <PopoverShell anchorRect={anchorRect} onClose={onClose} width={300}>
      <div className="px-3 py-2">
        <p className="text-xs text-foreground-secondary break-all" title={url}>
          {truncateUrl(url)}
        </p>
      </div>
      <div className="flex items-center justify-end border-t border-border px-2 py-1">
        <button
          type="button"
          onClick={handleOpen}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-foreground-secondary transition-colors hover:bg-surface hover:text-foreground"
        >
          <ExternalLink size={12} />
          Open in new tab
        </button>
      </div>
    </PopoverShell>
  );
}

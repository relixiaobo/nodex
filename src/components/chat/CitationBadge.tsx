import { useCallback, useRef, useState } from 'react';
import { useNode } from '../../hooks/use-node.js';
import { NodePopover } from './NodePopover.js';
import { ChatCitePopover } from './ChatCitePopover.js';
import { UrlCitePopover } from './UrlCitePopover.js';

interface CitationBadgeProps {
  id: string;
  label: string;
  type?: 'node' | 'chat' | 'url';
}

export function CitationBadge({ id, label, type = 'node' }: CitationBadgeProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  // Only load node data for node-type citations
  const node = useNode(type === 'node' ? id : null);

  const open = useCallback(() => {
    if (type === 'node' && !node) return;
    if (!triggerRef.current) return;
    setAnchorRect(triggerRef.current.getBoundingClientRect());
  }, [type, node]);

  const close = useCallback(() => {
    setAnchorRect(null);
  }, []);

  const isDisabled = type === 'node' && !node;

  const title = type === 'node'
    ? (node ? [node.name ?? id, node.description ?? ''].filter(Boolean).join('\n') : 'Deleted node')
    : type === 'chat'
      ? 'Past conversation'
      : id; // url — show the URL itself

  return (
    <>
      <span
        ref={triggerRef}
        role="button"
        tabIndex={isDisabled ? undefined : 0}
        onClick={isDisabled ? undefined : open}
        onKeyDown={isDisabled ? undefined : (e) => { if (e.key === 'Enter') open(); }}
        title={title}
        className={[
          'mx-0.5 rounded bg-foreground/[0.06] px-1 text-[11px]',
          isDisabled
            ? 'cursor-default text-foreground-tertiary line-through'
            : 'cursor-pointer text-foreground-secondary transition-colors hover:bg-foreground/[0.1] hover:text-foreground',
        ].join(' ')}
      >
        {label}
      </span>
      {anchorRect && (
        type === 'node' ? <NodePopover nodeId={id} anchorRect={anchorRect} onClose={close} />
        : type === 'chat' ? <ChatCitePopover sessionId={id} anchorRect={anchorRect} onClose={close} />
        : <UrlCitePopover url={id} anchorRect={anchorRect} onClose={close} />
      )}
    </>
  );
}

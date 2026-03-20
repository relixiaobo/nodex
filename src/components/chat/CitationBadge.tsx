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
  const triggerRef = useRef<HTMLButtonElement>(null);
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

  const typeColor = type === 'chat'
    ? 'border-secondary/40 hover:border-secondary/60 hover:text-secondary-foreground'
    : type === 'url'
      ? 'border-primary/30 hover:border-primary/50 hover:text-primary'
      : 'border-border hover:border-primary/30 hover:text-foreground';

  return (
    <>
      <sup className="mx-px align-[0.4em]">
        <button
          ref={triggerRef}
          type="button"
          onClick={open}
          disabled={isDisabled}
          title={title}
          className={[
            'inline-flex min-w-3 items-center justify-center rounded-full border px-0.5 text-[9px] leading-3',
            isDisabled
              ? 'cursor-default border-border bg-background text-foreground-tertiary line-through'
              : `bg-background text-foreground-tertiary transition-colors ${typeColor}`,
          ].join(' ')}
        >
          {label}
        </button>
      </sup>
      {anchorRect && (
        type === 'node' ? <NodePopover nodeId={id} anchorRect={anchorRect} onClose={close} />
        : type === 'chat' ? <ChatCitePopover sessionId={id} anchorRect={anchorRect} onClose={close} />
        : <UrlCitePopover url={id} anchorRect={anchorRect} onClose={close} />
      )}
    </>
  );
}

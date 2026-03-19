import { useCallback, useRef, useState } from 'react';
import { useNode } from '../../hooks/use-node.js';
import { NodePopover } from './NodePopover.js';

interface CitationBadgeProps {
  nodeId: string;
  label: string;
}

export function CitationBadge({ nodeId, label }: CitationBadgeProps) {
  const node = useNode(nodeId);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [popoverRect, setPopoverRect] = useState<DOMRect | null>(null);

  const title = node
    ? [node.name ?? nodeId, node.description ?? ''].filter(Boolean).join('\n')
    : 'Deleted node';

  const handleClick = useCallback(() => {
    if (!node || !triggerRef.current) return;
    setPopoverRect(triggerRef.current.getBoundingClientRect());
  }, [node]);

  const handleClose = useCallback(() => {
    setPopoverRect(null);
  }, []);

  return (
    <>
      <sup className="mx-0.5 align-[0.3em]">
        <button
          ref={triggerRef}
          type="button"
          onClick={handleClick}
          disabled={!node}
          title={title}
          className={[
            'inline-flex min-w-4 items-center justify-center rounded-full border px-1 text-[10px] leading-4',
            node
              ? 'border-border bg-background text-foreground-secondary transition-colors hover:border-primary/30 hover:text-foreground'
              : 'cursor-default border-border bg-background text-foreground-tertiary line-through',
          ].join(' ')}
        >
          {label}
        </button>
      </sup>
      {popoverRect && (
        <NodePopover nodeId={nodeId} anchorRect={popoverRect} onClose={handleClose} />
      )}
    </>
  );
}

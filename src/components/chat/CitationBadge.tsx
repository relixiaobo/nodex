import { useRef } from 'react';
import { useNode } from '../../hooks/use-node.js';
import { NodePopover, useNodePopover } from './NodePopover.js';

interface CitationBadgeProps {
  nodeId: string;
  label: string;
}

export function CitationBadge({ nodeId, label }: CitationBadgeProps) {
  const node = useNode(nodeId);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { anchorRect, open, close } = useNodePopover(node, triggerRef);

  const title = node
    ? [node.name ?? nodeId, node.description ?? ''].filter(Boolean).join('\n')
    : 'Deleted node';

  return (
    <>
      <sup className="mx-0.5 align-[0.3em]">
        <button
          ref={triggerRef}
          type="button"
          onClick={open}
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
      {anchorRect && (
        <NodePopover nodeId={nodeId} anchorRect={anchorRect} onClose={close} />
      )}
    </>
  );
}

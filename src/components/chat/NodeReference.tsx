import { useRef, type ReactNode } from 'react';
import { useNode } from '../../hooks/use-node.js';
import { NodePopover, useNodePopover } from './NodePopover.js';

interface NodeReferenceProps {
  nodeId: string;
  children: ReactNode;
}

export function NodeReference({ nodeId, children }: NodeReferenceProps) {
  const node = useNode(nodeId);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const { anchorRect, open, close } = useNodePopover(node, triggerRef);

  if (!node) {
    return (
      <span className="text-foreground-tertiary line-through">
        {children}
      </span>
    );
  }

  return (
    <>
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
        className="cursor-pointer text-primary underline decoration-primary/30 underline-offset-[3px] transition-colors hover:text-primary/80"
        title={node.name ?? nodeId}
      >
        {children}
      </span>
      {anchorRect && (
        <NodePopover nodeId={nodeId} anchorRect={anchorRect} onClose={close} />
      )}
    </>
  );
}

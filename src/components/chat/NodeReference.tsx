import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useNode } from '../../hooks/use-node.js';
import { NodePopover } from './NodePopover.js';

interface NodeReferenceProps {
  nodeId: string;
  children: ReactNode;
}

export function NodeReference({ nodeId, children }: NodeReferenceProps) {
  const node = useNode(nodeId);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [popoverRect, setPopoverRect] = useState<DOMRect | null>(null);

  const handleClick = useCallback(() => {
    if (!node || !triggerRef.current) return;
    setPopoverRect(triggerRef.current.getBoundingClientRect());
  }, [node]);

  const handleClose = useCallback(() => {
    setPopoverRect(null);
  }, []);

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
        onClick={handleClick}
        onKeyDown={(e) => { if (e.key === 'Enter') handleClick(); }}
        className="cursor-pointer text-primary underline decoration-primary/30 underline-offset-[3px] transition-colors hover:text-primary/80"
        title={node.name ?? nodeId}
      >
        {children}
      </span>
      {popoverRect && (
        <NodePopover nodeId={nodeId} anchorRect={popoverRect} onClose={handleClose} />
      )}
    </>
  );
}

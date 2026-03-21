import type { ReactNode } from 'react';
import { useNode } from '../../hooks/use-node.js';
import { useUIStore } from '../../stores/ui-store.js';

interface NodeReferenceProps {
  nodeId: string;
  children: ReactNode;
}

export function NodeReference({ nodeId, children }: NodeReferenceProps) {
  const node = useNode(nodeId);
  const switchToNode = useUIStore((s) => s.switchToNode);

  if (!node) {
    return (
      <span className="text-foreground-tertiary line-through">
        {children}
      </span>
    );
  }

  const handleOpen = () => {
    switchToNode(nodeId);
  };

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleOpen();
        }
      }}
      className="cursor-pointer text-primary underline decoration-primary/30 underline-offset-[3px] transition-colors hover:text-primary/80"
      title={node.name ?? nodeId}
    >
      {children}
    </span>
  );
}

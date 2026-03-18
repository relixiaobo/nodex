import type { ReactNode } from 'react';
import { useNode } from '../../hooks/use-node.js';
import { useUIStore } from '../../stores/ui-store.js';

interface NodeReferenceProps {
  nodeId: string;
  children: ReactNode;
}

export function NodeReference({ nodeId, children }: NodeReferenceProps) {
  const node = useNode(nodeId);
  const navigateTo = useUIStore((s) => s.navigateTo);

  if (!node) {
    return (
      <span className="text-foreground-tertiary line-through">
        {children}
      </span>
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => navigateTo(nodeId)}
      onKeyDown={(e) => { if (e.key === 'Enter') navigateTo(nodeId); }}
      className="cursor-pointer text-primary underline decoration-primary/30 underline-offset-[3px] transition-colors hover:text-primary/80"
      title={node.name ?? nodeId}
    >
      {children}
    </span>
  );
}

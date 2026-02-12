/**
 * Node panel header — thin wrapper around Breadcrumb.
 *
 * Fixed at top of NodePanel. Title and TagBar have moved to PanelTitle
 * in the scrollable content area.
 */
import { Breadcrumb } from './Breadcrumb';

interface NodePanelHeaderProps {
  nodeId: string;
  showCurrentName?: boolean;
}

export function NodePanelHeader({ nodeId, showCurrentName }: NodePanelHeaderProps) {
  return (
    <div className="shrink-0 border-b border-border">
      <Breadcrumb nodeId={nodeId} showCurrentName={showCurrentName} />
    </div>
  );
}

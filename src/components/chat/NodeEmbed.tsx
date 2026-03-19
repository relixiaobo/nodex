/**
 * NodeEmbed — inline outliner for `<node id="xxx" />` markup in chat messages.
 *
 * Renders a full OutlinerView for the given node, embedded in the chat message flow.
 * Supports expand, edit, drag — same as the panel outliner.
 */
import { useNode } from '../../hooks/use-node.js';
import { OutlinerView } from '../outliner/OutlinerView.js';
import { CHAT_OUTLINER_PANEL_ID } from './NodePopover.js';

interface NodeEmbedProps {
  nodeId: string;
}

export function NodeEmbed({ nodeId }: NodeEmbedProps) {
  const node = useNode(nodeId);

  if (!node) {
    return (
      <div className="chat-node-embed my-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground-tertiary">
        Node not found
      </div>
    );
  }

  return (
    <div className="chat-node-embed my-1 rounded-md border border-border bg-background">
      <OutlinerView rootNodeId={nodeId} panelId={CHAT_OUTLINER_PANEL_ID} />
    </div>
  );
}

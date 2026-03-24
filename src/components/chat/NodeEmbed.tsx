/**
 * NodeEmbed — inline outliner for `<node id="xxx" />` markup in chat messages.
 *
 * Layout:
 * - Bordered panel (bg-background warm paper) with header + children
 * - Header: node name + ↗ open-in-outliner icon, separated by border-b
 * - Children: OutlinerItems at depth=0 with chevrons aligned on left border
 * - Empty state: "Empty" placeholder when node has no children
 * - Max height 40vh with scroll
 */
import { useEffect } from 'react';
import { ExternalLink } from '../../lib/icons.js';
import { buildExpandedNodeKey } from '../../lib/expanded-node-key.js';
import { useNode } from '../../hooks/use-node.js';
import { useUIStore } from '../../stores/ui-store.js';
import * as loroDoc from '../../lib/loro-doc.js';
import { OutlinerItem } from '../outliner/OutlinerItem.js';
import { CHAT_OUTLINER_PANEL_ID } from './NodePopover.js';
import { marksToHtml } from '../../lib/editor-marks.js';

interface NodeEmbedProps {
  nodeId: string;
}

export function NodeEmbed({ nodeId }: NodeEmbedProps) {
  const node = useNode(nodeId);
  const childIds = node?.children ?? [];
  const setExpanded = useUIStore((s) => s.setExpanded);
  const navigateToNode = useUIStore((s) => s.navigateToNode);
  const closeChatDrawer = useUIStore((s) => s.closeChatDrawer);
  const hasChildren = childIds.length > 0;

  // Auto-expand children on mount so they're visible
  useEffect(() => {
    const n = loroDoc.toNodexNode(nodeId);
    for (const cid of n?.children ?? []) {
      const child = loroDoc.toNodexNode(cid);
      if ((child?.children?.length ?? 0) > 0) {
        setExpanded(buildExpandedNodeKey(CHAT_OUTLINER_PANEL_ID, nodeId, cid), true, true);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, [nodeId]);

  if (!node) {
    return (
      <div className="chat-node-embed my-2 pl-3 text-sm text-foreground-tertiary">
        Node not found
      </div>
    );
  }

  const displayName = node.name ?? '';
  const displayHtml = marksToHtml(displayName, node.marks ?? [], node.inlineRefs ?? []);

  const handleOpenInOutliner = () => {
    closeChatDrawer();
    navigateToNode(nodeId);
  };

  return (
    <div className="chat-node-embed my-2" data-chat-embed>
      {/* Bordered panel: header + children together for visual cohesion */}
      <div className="rounded-lg border border-border bg-background">
        {/* Header: node name + open-in-outliner */}
        <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5">
          {displayHtml ? (
            <span
              className="min-w-0 flex-1 truncate text-sm font-medium text-foreground node-content"
              dangerouslySetInnerHTML={{ __html: displayHtml }}
            />
          ) : (
            <span className="min-w-0 flex-1 text-sm text-foreground-tertiary">Untitled</span>
          )}
          <button
            type="button"
            onClick={handleOpenInOutliner}
            className="flex shrink-0 items-center justify-center rounded p-1 text-foreground-tertiary transition-colors hover:bg-foreground/4 hover:text-foreground-secondary"
            title="Open in outliner"
          >
            <ExternalLink size={12} />
          </button>
        </div>
        <div className="-ml-[14px] max-h-[40vh] overflow-y-auto py-1">
          {hasChildren ? (
            childIds.map((childId) => (
              <OutlinerItem
                key={childId}
                nodeId={childId}
                depth={0}
                rootChildIds={childIds}
                parentId={nodeId}
                rootNodeId={nodeId}
                panelId={CHAT_OUTLINER_PANEL_ID}
              />
            ))
          ) : (
            /* Empty state: placeholder node so the embed is visually recognizable
               and the user can add children via the outliner */
            <div
              className="flex min-h-6 items-center py-px text-sm text-foreground-tertiary/40"
              style={{ paddingLeft: 6 + 15 + 15 + 4 }}
            >
              Empty
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

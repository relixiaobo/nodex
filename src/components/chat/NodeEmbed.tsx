/**
 * NodeEmbed — inline outliner for `<node id="xxx" />` markup in chat messages.
 *
 * Layout:
 * - Header (outside panel): node bullet + name + ↗ open-in-outliner icon
 * - Bordered panel: children of the node rendered as OutlinerItems
 * - No drill-down: bullet click in the panel = default outliner behavior (navigate to node panel)
 * - No children: show bordered panel with an empty trailing-input-like placeholder
 * - Max height with scroll
 */
import { useEffect } from 'react';
import { ExternalLink } from '../../lib/icons.js';
import { buildExpandedNodeKey } from '../../lib/expanded-node-key.js';
import { useNode } from '../../hooks/use-node.js';
import { useUIStore } from '../../stores/ui-store.js';
import * as loroDoc from '../../lib/loro-doc.js';
import { OutlinerItem } from '../outliner/OutlinerItem.js';
import { BulletChevron } from '../outliner/BulletChevron.js';
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
      {/* Header: node identity + open button — outside the bordered panel */}
      <div className="flex items-center gap-1 py-0.5">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <BulletChevron
            hasChildren={hasChildren}
            isExpanded={hasChildren}
            onBulletClick={handleOpenInOutliner}
            tooltipLabel="Open in outliner"
          />
          {displayHtml ? (
            <span
              className="min-w-0 flex-1 truncate text-sm font-medium text-foreground node-content"
              dangerouslySetInnerHTML={{ __html: displayHtml }}
            />
          ) : (
            <span className="text-sm text-foreground-tertiary">Untitled</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleOpenInOutliner}
          className="flex shrink-0 items-center justify-center rounded p-1 text-foreground-tertiary transition-colors hover:bg-foreground/4 hover:text-foreground-secondary"
          title="Open in outliner"
        >
          <ExternalLink size={12} />
        </button>
      </div>

      {/* Bordered panel: children of the node.
           Scroll container shifts left (-ml-[14px]) so the depth-0 chevron
           center aligns with the border line. The chevron's opaque outline
           covers the border line behind it. */}
      <div className="rounded-lg border border-border bg-background py-1">
        <div className="-ml-[14px] max-h-[40vh] overflow-y-auto">
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

/**
 * NodeEmbed — inline outliner for `<node id="xxx" />` markup in chat messages.
 *
 * Layout:
 * - Header (outside panel): node bullet + name + ↗ open-in-outliner icon
 * - Bordered panel: children of the node rendered as OutlinerItems
 * - Internal navigation: bullet click drills into child, header shows new root
 * - Max height with scroll
 */
import { useCallback, useEffect, useState } from 'react';
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
  const [displayNodeId, setDisplayNodeId] = useState(nodeId);
  const node = useNode(displayNodeId);
  const childIds = node?.children ?? [];
  const setExpanded = useUIStore((s) => s.setExpanded);
  const navigateToNode = useUIStore((s) => s.navigateToNode);
  const closeChatDrawer = useUIStore((s) => s.closeChatDrawer);
  const hasChildren = childIds.length > 0;

  // Auto-expand children on mount / navigation so they're visible
  useEffect(() => {
    for (const childId of childIds) {
      const child = loroDoc.toNodexNode(childId);
      if ((child?.children?.length ?? 0) > 0) {
        setExpanded(buildExpandedNodeKey(CHAT_OUTLINER_PANEL_ID, displayNodeId, childId), true, true);
      }
    }
  }, [displayNodeId, childIds, setExpanded]);

  // Bullet click → drill into node within the embed
  const handleBulletNavigate = useCallback((targetNodeId: string) => {
    setDisplayNodeId(targetNodeId);
  }, []);

  // Header bullet click → drill into the displayed node itself (navigate to it in outliner)
  const handleHeaderBulletClick = useCallback(() => {
    closeChatDrawer();
    navigateToNode(displayNodeId);
  }, [displayNodeId, closeChatDrawer, navigateToNode]);

  if (!node) {
    return (
      <div className="chat-node-embed my-2 pl-3 text-sm text-foreground-tertiary">
        Node not found
      </div>
    );
  }

  const displayName = node.name ?? '';
  const displayHtml = marksToHtml(displayName, node.marks ?? [], node.inlineRefs ?? []);

  return (
    <div className="chat-node-embed my-2" data-chat-embed>
      {/* Header: node identity + open button — outside the bordered panel */}
      <div className="flex items-center gap-1 py-0.5">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <BulletChevron
            hasChildren={hasChildren}
            isExpanded={hasChildren}
            onBulletClick={handleHeaderBulletClick}
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
          onClick={() => {
            closeChatDrawer();
            navigateToNode(displayNodeId);
          }}
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
      {hasChildren && (
        <div className="rounded-lg border border-border py-1">
          <div className="-ml-[14px] max-h-[calc(60vh-8px)] overflow-y-auto">
            {childIds.map((childId) => (
              <OutlinerItem
                key={childId}
                nodeId={childId}
                depth={0}
                rootChildIds={childIds}
                parentId={displayNodeId}
                rootNodeId={displayNodeId}
                panelId={CHAT_OUTLINER_PANEL_ID}
                onBulletNavigate={handleBulletNavigate}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

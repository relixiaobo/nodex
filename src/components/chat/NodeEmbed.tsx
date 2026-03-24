/**
 * NodeEmbed — inline outliner for `<node id="xxx" />` markup in chat messages.
 *
 * Renders as an inset panel (subtle bg fill, no border) with:
 * - Sticky header: breadcrumb (🏠 / ⋯ / Parent) + open-in-outliner icon
 * - OutlinerItem tree with full interaction
 * - Internal navigation: bullet click drills into node, breadcrumb navigates back
 * - Max height with scroll
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Home, MoreHorizontal } from '../../lib/icons.js';
import { buildExpandedNodeKey } from '../../lib/expanded-node-key.js';
import { useNode } from '../../hooks/use-node.js';
import { useAncestors } from '../../hooks/use-ancestors.js';
import { useUIStore } from '../../stores/ui-store.js';
import * as loroDoc from '../../lib/loro-doc.js';
import { OutlinerItem } from '../outliner/OutlinerItem.js';
import { CHAT_OUTLINER_PANEL_ID } from './NodePopover.js';

interface NodeEmbedProps {
  nodeId: string;
}

export function NodeEmbed({ nodeId }: NodeEmbedProps) {
  const [displayNodeId, setDisplayNodeId] = useState(nodeId);
  const node = useNode(displayNodeId);
  const setExpanded = useUIStore((s) => s.setExpanded);
  const navigateToNode = useUIStore((s) => s.navigateToNode);
  const closeChatDrawer = useUIStore((s) => s.closeChatDrawer);
  const realParentId = loroDoc.getParentId(displayNodeId) ?? displayNodeId;
  const hasChildren = (node?.children?.length ?? 0) > 0;
  const { ancestors, workspaceRootId } = useAncestors(displayNodeId);

  // Breadcrumb: 🏠 / ⋯ / immediateParent
  const breadcrumb = useMemo(() => {
    if (ancestors.length === 0) return { home: workspaceRootId, middle: null, last: null };
    if (ancestors.length === 1) return { home: workspaceRootId, middle: null, last: ancestors[0] };
    return { home: workspaceRootId, middle: ancestors.slice(0, -1), last: ancestors[ancestors.length - 1] };
  }, [ancestors, workspaceRootId]);

  // Auto-expand on mount (and when displayNodeId changes) so children are visible
  useEffect(() => {
    if (hasChildren) {
      setExpanded(buildExpandedNodeKey(CHAT_OUTLINER_PANEL_ID, realParentId, displayNodeId), true, true);
    }
  }, [displayNodeId, realParentId, hasChildren, setExpanded]);

  // Bullet click → drill into node within the embed
  const handleBulletNavigate = useCallback((targetNodeId: string) => {
    setDisplayNodeId(targetNodeId);
  }, []);

  if (!node) {
    return (
      <div className="chat-node-embed my-2 rounded-lg bg-foreground/[0.03] px-3 py-2 text-sm text-foreground-tertiary">
        Node not found
      </div>
    );
  }

  return (
    <div className="chat-node-embed my-2 rounded-lg bg-foreground/[0.03]" data-chat-embed>
      <div className="max-h-[60vh] overflow-y-auto">
        {/* Sticky header: breadcrumb + open button */}
        <div className="sticky top-0 z-10 flex items-center gap-1 rounded-t-lg bg-foreground/[0.03] px-2 py-1">
          <div className="flex min-w-0 flex-1 items-center gap-1 text-xs text-foreground-tertiary">
            {breadcrumb.home && (
              <button
                type="button"
                onClick={() => setDisplayNodeId(breadcrumb.home!)}
                className="flex shrink-0 items-center justify-center rounded-md px-0.5 py-0.5 transition-colors hover:text-foreground"
              >
                <Home size={12} strokeWidth={1.7} />
              </button>
            )}
            {breadcrumb.home && (breadcrumb.middle || breadcrumb.last) && (
              <span className="shrink-0 text-foreground-tertiary/50 mx-0.5">/</span>
            )}
            {breadcrumb.middle && (
              <>
                <span className="flex shrink-0 items-center rounded-md px-0.5 py-0.5 text-foreground-tertiary/50">
                  <MoreHorizontal size={12} />
                </span>
                <span className="shrink-0 text-foreground-tertiary/50 mx-0.5">/</span>
              </>
            )}
            {breadcrumb.last && (
              <button
                type="button"
                onClick={() => setDisplayNodeId(breadcrumb.last!.id)}
                className="min-w-0 max-w-[120px] truncate rounded px-0.5 transition-colors hover:text-foreground"
              >
                {breadcrumb.last.name}
              </button>
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

        {/* Outliner content — pull left 6px so chevron aligns with container edge */}
        <div className="-ml-1.5">
          <OutlinerItem
            nodeId={displayNodeId}
            depth={0}
            rootChildIds={[displayNodeId]}
            parentId={realParentId}
            rootNodeId={realParentId}
            panelId={CHAT_OUTLINER_PANEL_ID}
            onBulletNavigate={handleBulletNavigate}
          />
        </div>
      </div>
    </div>
  );
}

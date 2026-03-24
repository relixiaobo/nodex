/**
 * NodeEmbed — inline outliner for `<node id="xxx" />` markup in chat messages.
 *
 * Renders as a blockquote-style embed (left border, no box) with:
 * - Sticky header: breadcrumb (🏠 / ⋯ / Parent) + open-in-outliner icon
 * - OutlinerItem tree with full interaction
 * - Max height with scroll
 */
import { useEffect, useMemo } from 'react';
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
  const node = useNode(nodeId);
  const setExpanded = useUIStore((s) => s.setExpanded);
  const navigateToNode = useUIStore((s) => s.navigateToNode);
  const closeChatDrawer = useUIStore((s) => s.closeChatDrawer);
  const realParentId = loroDoc.getParentId(nodeId) ?? nodeId;
  const hasChildren = (node?.children?.length ?? 0) > 0;
  const { ancestors, workspaceRootId } = useAncestors(nodeId);

  // Breadcrumb: 🏠 / ⋯ / immediateParent
  const breadcrumb = useMemo(() => {
    if (ancestors.length === 0) return { home: workspaceRootId, middle: null, last: null };
    if (ancestors.length === 1) return { home: workspaceRootId, middle: null, last: ancestors[0] };
    // 2+: show home, ellipsis for middle, last ancestor
    return { home: workspaceRootId, middle: ancestors.slice(0, -1), last: ancestors[ancestors.length - 1] };
  }, [ancestors, workspaceRootId]);

  // Auto-expand on mount so children are visible
  useEffect(() => {
    if (hasChildren) {
      setExpanded(buildExpandedNodeKey(CHAT_OUTLINER_PANEL_ID, realParentId, nodeId), true, true);
    }
  }, [nodeId, realParentId, hasChildren, setExpanded]);

  if (!node) {
    return (
      <div className="chat-node-embed my-2 border-l-3 border-border-emphasis pl-3 text-sm text-foreground-tertiary">
        Node not found
      </div>
    );
  }

  return (
    <div className="chat-node-embed my-2 border-l-3 border-border-emphasis" data-chat-embed>
      <div className="max-h-[60vh] overflow-y-auto">
        {/* Sticky header: breadcrumb + open button */}
        <div className="sticky top-0 z-10 flex items-center gap-1 bg-background px-3 py-1">
          <div className="flex min-w-0 flex-1 items-center gap-0.5 text-xs text-foreground-tertiary">
            {breadcrumb.home && (
              <button
                type="button"
                onClick={() => navigateToNode(breadcrumb.home!)}
                className="flex shrink-0 items-center rounded px-0.5 py-0.5 transition-colors hover:bg-foreground/4 hover:text-foreground-secondary"
              >
                <Home size={12} />
              </button>
            )}
            {breadcrumb.home && (breadcrumb.middle || breadcrumb.last) && (
              <span className="text-foreground-tertiary/60">/</span>
            )}
            {breadcrumb.middle && (
              <>
                <span className="flex shrink-0 items-center rounded px-0.5 py-0.5 text-foreground-tertiary/60">
                  <MoreHorizontal size={12} />
                </span>
                <span className="text-foreground-tertiary/60">/</span>
              </>
            )}
            {breadcrumb.last && (
              <button
                type="button"
                onClick={() => navigateToNode(breadcrumb.last!.id)}
                className="min-w-0 truncate rounded px-0.5 py-0.5 transition-colors hover:bg-foreground/4 hover:text-foreground-secondary"
              >
                {breadcrumb.last.name}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              closeChatDrawer();
              navigateToNode(nodeId);
            }}
            className="flex shrink-0 items-center justify-center rounded p-1 text-foreground-tertiary transition-colors hover:bg-foreground/4 hover:text-foreground-secondary"
            title="Open in outliner"
          >
            <ExternalLink size={12} />
          </button>
        </div>

        {/* Outliner content */}
        <OutlinerItem
          nodeId={nodeId}
          depth={0}
          rootChildIds={[nodeId]}
          parentId={realParentId}
          rootNodeId={realParentId}
          panelId={CHAT_OUTLINER_PANEL_ID}
          bulletToggleExpand
        />
      </div>
    </div>
  );
}

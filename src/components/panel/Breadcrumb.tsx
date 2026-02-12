/**
 * Breadcrumb navigation bar for zoomed-in node pages.
 *
 * Layout: [SidebarToggle] [← Parent] [W avatar] › ancestor1 › ancestor2 › ... › [currentName?] [Search]
 *
 * - Workspace root is represented by a circular avatar (first char of workspace name)
 * - ← button navigates to parent node (not history back)
 * - Containers appear as normal ancestors in the chain
 * - At workspace root view, breadcrumb content is hidden (toolbar only)
 *
 * Folding rules (applied to ancestor chain):
 * - 0 ancestors: [←] [W]
 * - 1 ancestor: [←] [W] › parent
 * - 2 ancestors: [←] [W] › grandparent › parent
 * - 3+ ancestors: [←] [W] › [...] › parent
 *
 * [...] expands in-place (no navigation). Resets when nodeId changes.
 */
import { useState, useEffect, useCallback } from 'react';
import { PanelLeft, ChevronLeft, ChevronRight, Search, MoreHorizontal } from 'lucide-react';
import { useUIStore } from '../../stores/ui-store';
import { useNodeStore } from '../../stores/node-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { useAncestors } from '../../hooks/use-ancestors';

interface BreadcrumbProps {
  nodeId: string;
  showCurrentName?: boolean;
}

export function Breadcrumb({ nodeId, showCurrentName }: BreadcrumbProps) {
  const navigateTo = useUIStore((s) => s.navigateTo);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const openSearch = useUIStore((s) => s.openSearch);

  const { ancestors, workspaceRootId } = useAncestors(nodeId);
  const isRootView = !!workspaceRootId && nodeId === workspaceRootId;

  // Get parent ID for ← button (navigate to parent)
  const parentId = useNodeStore((s) => s.entities[nodeId]?.props._ownerId ?? null);

  // Workspace name for avatar
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const wsInitial = useNodeStore((s) => {
    if (!wsId) return 'W';
    const wsNode = s.entities[wsId];
    const raw = wsNode?.props.name ?? '';
    const clean = raw.replace(/<[^>]+>/g, '').trim();
    return clean.charAt(0).toUpperCase() || 'W';
  });

  // Show ← when current node has a parent (not at workspace root)
  const canGoUp = !!parentId;

  // Ellipsis expansion state — reset when nodeId changes
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [nodeId]);

  const handleGoUp = useCallback(() => {
    if (parentId) navigateTo(parentId);
  }, [parentId, navigateTo]);

  const handleAvatarClick = useCallback(() => {
    if (workspaceRootId) navigateTo(workspaceRootId);
  }, [workspaceRootId, navigateTo]);

  // Determine which ancestors to show
  const needsFolding = ancestors.length >= 3 && !expanded;
  const visibleAncestors = needsFolding
    ? [ancestors[ancestors.length - 1]] // only the immediate parent
    : ancestors;
  const hiddenAncestors = needsFolding
    ? ancestors.slice(0, -1)
    : [];

  return (
    <div className="flex h-8 items-center gap-0.5 px-1.5 text-xs text-muted-foreground overflow-hidden">
      {/* Sidebar toggle */}
      <button
        onClick={toggleSidebar}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-muted hover:text-foreground"
        title="Toggle sidebar"
      >
        <PanelLeft size={15} strokeWidth={1.75} />
      </button>

      {/* ← button: navigate to parent (hidden at root view) */}
      {canGoUp && (
        <button
          onClick={handleGoUp}
          className="flex h-7 w-6 shrink-0 items-center justify-center rounded-md hover:bg-muted hover:text-foreground"
          title="Go to parent"
        >
          <ChevronLeft size={15} strokeWidth={1.75} />
        </button>
      )}

      {/* Root view: only show toolbar (sidebar toggle + search), no breadcrumb content */}
      {!isRootView && (
        <>
          {/* Workspace avatar */}
          {workspaceRootId && (
            <button
              onClick={handleAvatarClick}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary hover:bg-primary/25"
              title="Go to workspace root"
            >
              {wsInitial}
            </button>
          )}

          {/* Ellipsis for folded ancestors */}
          {needsFolding && (
            <>
              <ChevronRight size={10} className="shrink-0 text-muted-foreground/40" />
              <button
                onClick={() => setExpanded(true)}
                className="flex h-7 shrink-0 items-center justify-center rounded-md px-1 hover:bg-muted hover:text-foreground"
                title={hiddenAncestors.map(a => a.name).join(' › ')}
              >
                <MoreHorizontal size={14} />
              </button>
            </>
          )}

          {/* Visible ancestors */}
          {visibleAncestors.map((ancestor) => (
            <span key={ancestor.id} className="flex items-center shrink-0 min-w-0">
              <ChevronRight size={10} className="shrink-0 text-muted-foreground/40 mx-0.5" />
              <button
                onClick={() => navigateTo(ancestor.id)}
                className="truncate max-w-[120px] rounded px-0.5 hover:bg-muted hover:text-foreground"
              >
                {ancestor.name}
              </button>
            </span>
          ))}

          {/* Conditional current node name (when title scrolled out of view) */}
          {showCurrentName && (
            <span className="flex items-center shrink min-w-0 text-foreground/60">
              <ChevronRight size={10} className="shrink-0 text-muted-foreground/40 mx-0.5" />
              <BreadcrumbCurrentName nodeId={nodeId} />
            </span>
          )}
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search button */}
      <button
        onClick={openSearch}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-muted hover:text-foreground"
        title="Search (Cmd+K)"
      >
        <Search size={15} strokeWidth={1.75} />
      </button>
    </div>
  );
}

/** Subscribes to node name for the conditional breadcrumb display. */
function BreadcrumbCurrentName({ nodeId }: { nodeId: string }) {
  const name = useNodeStore((s) => {
    const node = s.entities[nodeId];
    const raw = node?.props.name ?? '';
    return raw.replace(/<[^>]+>/g, '') || 'Untitled';
  });

  return <span className="truncate max-w-[100px] text-xs font-medium">{name}</span>;
}

/**
 * Breadcrumb navigation bar for zoomed-in node pages.
 *
 * Layout: [SidebarToggle] [← Back] [ContainerIcon] › ancestor1 › ancestor2 › ... › [currentName?] [Search]
 *
 * Folding rules:
 * - 0 ancestors: [←] [Container]
 * - 1 ancestor: [←] [Container] › parent
 * - 2 ancestors: [←] [Container] › grandparent › parent
 * - 3+ ancestors: [←] [Container] › [...] › parent
 *
 * [...] expands in-place (no navigation). Resets when nodeId changes.
 */
import { useState, useEffect, useCallback } from 'react';
import { PanelLeft, ChevronLeft, ChevronRight, Search, Library, Inbox, CalendarDays, Trash2, MoreHorizontal } from 'lucide-react';
import { useUIStore } from '../../stores/ui-store';
import { useNodeStore } from '../../stores/node-store';
import { useAncestors } from '../../hooks/use-ancestors';
import { WORKSPACE_CONTAINERS } from '../../types/index.js';

interface BreadcrumbProps {
  nodeId: string;
  showCurrentName?: boolean;
}

/** Map container suffix → icon + label */
const CONTAINER_INFO: Record<string, { icon: typeof Library; label: string }> = {
  [WORKSPACE_CONTAINERS.LIBRARY]: { icon: Library, label: 'Library' },
  [WORKSPACE_CONTAINERS.INBOX]: { icon: Inbox, label: 'Inbox' },
  [WORKSPACE_CONTAINERS.JOURNAL]: { icon: CalendarDays, label: 'Journal' },
  [WORKSPACE_CONTAINERS.SEARCHES]: { icon: Search, label: 'Searches' },
  [WORKSPACE_CONTAINERS.TRASH]: { icon: Trash2, label: 'Trash' },
};

function getContainerInfo(containerId: string | null) {
  if (!containerId) return null;
  for (const [suffix, info] of Object.entries(CONTAINER_INFO)) {
    if (containerId.endsWith(`_${suffix}`)) return info;
  }
  return null;
}

export function Breadcrumb({ nodeId, showCurrentName }: BreadcrumbProps) {
  const goBack = useUIStore((s) => s.goBack);
  const navigateTo = useUIStore((s) => s.navigateTo);
  const panelIndex = useUIStore((s) => s.panelIndex);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const openSearch = useUIStore((s) => s.openSearch);
  const canGoBack = panelIndex > 0;

  const { ancestors, rootContainerId } = useAncestors(nodeId);
  const containerInfo = getContainerInfo(rootContainerId);

  // Ellipsis expansion state — reset when nodeId changes
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [nodeId]);

  const handleContainerClick = useCallback(() => {
    if (rootContainerId) navigateTo(rootContainerId);
  }, [rootContainerId, navigateTo]);

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

      {/* Back button */}
      {canGoBack && (
        <button
          onClick={goBack}
          className="flex h-7 w-6 shrink-0 items-center justify-center rounded-md hover:bg-muted hover:text-foreground"
          title="Go back"
        >
          <ChevronLeft size={15} strokeWidth={1.75} />
        </button>
      )}

      {/* Container icon */}
      {containerInfo && (
        <>
          <button
            onClick={handleContainerClick}
            className="flex h-7 shrink-0 items-center justify-center rounded-md px-1 hover:bg-muted hover:text-foreground"
            title={containerInfo.label}
          >
            <containerInfo.icon size={14} strokeWidth={1.75} />
          </button>
        </>
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

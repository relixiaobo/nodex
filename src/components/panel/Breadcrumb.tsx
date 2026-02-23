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
import { ChevronLeft, MoreHorizontal } from '../../lib/icons.js';
import { useUIStore } from '../../stores/ui-store';
import { useNodeStore } from '../../stores/node-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { useAncestors } from '../../hooks/use-ancestors';
import { getNavigableParentId } from '../../lib/tree-utils';
import { CONTAINER_IDS } from '../../types/index.js';
import { ensureWorkspaceHomeNode } from '../../lib/workspace-root.js';
import * as loroDoc from '../../lib/loro-doc.js';
import { isDayNode } from '../../lib/journal.js';
import { parseDayNodeName, parseYearNodeName, isToday } from '../../lib/date-utils.js';
import { t } from '../../i18n/strings.js';

interface BreadcrumbProps {
  nodeId: string;
  showCurrentName?: boolean;
}

export function resolveWorkspaceRootTargetId(params: {
  workspaceId: string | null;
  workspaceRootId: string | null;
}): string {
  const { workspaceId, workspaceRootId } = params;
  if (workspaceId) return workspaceId;
  if (workspaceRootId) return workspaceRootId;
  return CONTAINER_IDS.LIBRARY;
}

export function Breadcrumb({ nodeId, showCurrentName }: BreadcrumbProps) {
  const navigateTo = useUIStore((s) => s.navigateTo);

  const { ancestors, workspaceRootId } = useAncestors(nodeId);
  // isRootView: only true if there is an explicit workspace root node AND we're viewing it.
  // Container nodes (Library, Inbox, etc.) are NOT treated as root view — they still show
  // the workspace [W] avatar, just with no ancestor chain.
  const isRootView = !!workspaceRootId && nodeId === workspaceRootId;

  // Get parent ID for ← button (navigate to first non-structural parent)
  const parentId = useNodeStore((s) => { void s._version; return getNavigableParentId(nodeId); });

  // Workspace name for avatar
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const workspaceRootTargetId = resolveWorkspaceRootTargetId({
    workspaceId: wsId,
    workspaceRootId,
  });
  const wsInitial = useNodeStore((s) => {
    void s._version;
    if (!wsId) return 'W';
    const wsNode = loroDoc.toNodexNode(wsId);
    const raw = wsNode?.name ?? '';
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

  const handleNavigateToWorkspaceRoot = useCallback(() => {
    if (wsId && workspaceRootTargetId === wsId) {
      ensureWorkspaceHomeNode(wsId);
    }
    navigateTo(workspaceRootTargetId);
  }, [workspaceRootTargetId, navigateTo, wsId]);

  // Determine which ancestors to show
  const needsFolding = ancestors.length >= 3 && !expanded;
  const visibleAncestors = needsFolding
    ? [ancestors[ancestors.length - 1]] // only the immediate parent
    : ancestors;
  const hiddenAncestors = needsFolding
    ? ancestors.slice(0, -1)
    : [];

  return (
    <div className="flex h-8 items-center gap-0.5 px-3 text-xs text-foreground-secondary overflow-hidden">
      {/* ← button: navigate to parent (hidden at root view) */}
      {canGoUp && (
        <button
          onClick={handleGoUp}
          className="flex h-7 w-[15px] shrink-0 items-center justify-center rounded-md hover:bg-foreground/5 hover:text-foreground"
          title={t('breadcrumb.goToParent')}
        >
          <ChevronLeft size={14} strokeWidth={1.5} />
        </button>
      )}

      {/* Root view: only show toolbar (sidebar toggle + search), no breadcrumb content */}
      {!isRootView && (
        <>
          {/* Workspace avatar — shown whenever workspace is initialized.
              For container nodes (Library, Inbox…) workspaceRootId is null because they
              have no parent; we still show [W] to indicate workspace context. */}
          {!!wsId && (
            <button
              onClick={handleNavigateToWorkspaceRoot}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary hover:bg-primary/25"
              title={t('breadcrumb.goToWorkspaceRoot')}
            >
              {wsInitial}
            </button>
          )}

          {/* Ellipsis for folded ancestors */}
          {needsFolding && (
            <>
              <span className="shrink-0 text-foreground-tertiary mx-0.5">/</span>
              <button
                onClick={() => setExpanded(true)}
                className="flex h-7 shrink-0 items-center justify-center rounded-md px-1 hover:bg-foreground/5 hover:text-foreground"
                title={hiddenAncestors.map(a => a.name).join(' › ')}
              >
                <MoreHorizontal size={14} />
              </button>
            </>
          )}

          {/* Visible ancestors */}
          {visibleAncestors.map((ancestor) => (
            <span key={ancestor.id} className="flex items-center shrink-0 min-w-0">
              <span className="shrink-0 text-foreground-tertiary mx-0.5">/</span>
              <button
                onClick={() => {
                  if (ancestor.id === workspaceRootId) {
                    handleNavigateToWorkspaceRoot();
                    return;
                  }
                  navigateTo(ancestor.id);
                }}
                className="truncate max-w-[120px] rounded px-0.5 hover:bg-foreground/5 hover:text-foreground"
              >
                {resolveBreadcrumbLabel(ancestor.id, ancestor.name)}
              </button>
            </span>
          ))}

          {/* Conditional current node name (when title scrolled out of view) */}
          {showCurrentName && (
            <span className="flex items-center shrink min-w-0 text-foreground-secondary">
              <span className="shrink-0 text-foreground-tertiary mx-0.5">/</span>
              <BreadcrumbCurrentName nodeId={nodeId} />
            </span>
          )}
        </>
      )}

    </div>
  );
}

/**
 * Resolve display label for a breadcrumb segment.
 * If the node is today's day node, prefix with "Today, ".
 */
function resolveBreadcrumbLabel(nodeId: string, name: string): string {
  if (!isDayNode(nodeId)) return name;
  // Find year from ancestor chain: day → week → year
  const weekId = loroDoc.getParentId(nodeId);
  if (!weekId) return name;
  const yearId = loroDoc.getParentId(weekId);
  if (!yearId) return name;
  const yearNode = loroDoc.toNodexNode(yearId);
  const year = yearNode?.name ? parseYearNodeName(yearNode.name) : null;
  if (year === null) return name;
  const date = parseDayNodeName(name, year);
  if (date && isToday(date)) return t('common.todayPrefix', { name });
  return name;
}

/** Subscribes to node name for the conditional breadcrumb display. */
function BreadcrumbCurrentName({ nodeId }: { nodeId: string }) {
  const name = useNodeStore((s) => {
    void s._version;
    const node = s.getNode(nodeId);
    const raw = node?.name ?? '';
    const clean = raw.replace(/<[^>]+>/g, '') || t('common.untitled');
    return resolveBreadcrumbLabel(nodeId, clean);
  });

  return <span className="truncate max-w-[100px] text-xs font-medium">{name}</span>;
}

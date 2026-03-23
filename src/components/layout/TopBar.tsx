import { isAppPanel, type AppPanelId } from '../../types/index.js';
import { Breadcrumb } from '../panel/Breadcrumb.js';
import { ToolbarUserMenu } from '../toolbar/ToolbarUserMenu.js';
import { NavButtons } from './NavButtons.js';

interface TopBarProps {
  nodeId: string | null;
}

function resolveAppPanelTitle(panelId: AppPanelId): string {
  return panelId.replace(/^app:/, '').replace(/^./, (char) => char.toUpperCase());
}

function AppPanelTitle({ panelId }: { panelId: AppPanelId }) {
  const title = resolveAppPanelTitle(panelId);

  return (
    <div className="flex h-8 min-w-0 flex-1 items-center px-4 text-[13px] text-foreground-secondary">
      <span className="truncate">{title}</span>
    </div>
  );
}

export function TopBar({ nodeId }: TopBarProps) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 bg-background px-2" data-testid="top-bar">
      <NavButtons />
      {nodeId && !isAppPanel(nodeId) ? (
        <Breadcrumb nodeId={nodeId} />
      ) : (
        <AppPanelTitle panelId={(nodeId ?? 'app:outliner') as AppPanelId} />
      )}
      <ToolbarUserMenu />
    </div>
  );
}

import { useEffect } from 'react';
import { ensureChatSession } from '../../lib/chat-panel-actions.js';
import { useNodeStore } from '../../stores/node-store.js';
import { useUIStore } from '../../stores/ui-store.js';
import { isAppPanel, type AppPanelId } from '../../types/index.js';
import { AppPanel } from '../panel/AppPanel.js';
import { NodePanel } from '../panel/NodePanel.js';
import { ChatDrawer } from './ChatDrawer.js';
import { FloatingChatBar } from './FloatingChatBar.js';
import { TopBar } from './TopBar.js';

const NODE_PANEL_ID = 'node-main';

function useRenderableNodeId(currentNodeId: string | null): string | null {
  return useNodeStore((s) => {
    void s._version;
    if (currentNodeId && (isAppPanel(currentNodeId) || s.getNode(currentNodeId))) {
      return currentNodeId;
    }
    return null;
  });
}

export function DrawerLayout() {
  const currentNodeId = useUIStore((s) => s.currentNodeId);
  const currentChatSessionId = useUIStore((s) => s.currentChatSessionId);
  const renderableNodeId = useRenderableNodeId(currentNodeId);

  useEffect(() => {
    if (!currentChatSessionId) {
      void ensureChatSession();
    }
  }, [currentChatSessionId]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background pt-1">
      <TopBar nodeId={renderableNodeId} />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {renderableNodeId === null ? (
          <div className="flex flex-1 items-center justify-center text-sm text-foreground-tertiary">
            Open the outliner to start.
          </div>
        ) : isAppPanel(renderableNodeId) ? (
          <AppPanel panelId={renderableNodeId as AppPanelId} />
        ) : (
          <NodePanel nodeId={renderableNodeId} panelId={NODE_PANEL_ID} />
        )}

        <FloatingChatBar />
        <ChatDrawer />
      </div>
    </div>
  );
}

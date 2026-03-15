import { createSession } from './ai-chat-tree.js';
import { saveChatSession } from './ai-persistence.js';
import { useUIStore } from '../stores/ui-store.js';
import { CHAT_PANEL_PREFIX, isChatPanel } from '../types/index.js';

export async function openChatPanel(insertIndex?: number): Promise<void> {
  const session = createSession();
  const persisted = await saveChatSession(session);
  useUIStore.getState().openPanel(`${CHAT_PANEL_PREFIX}${persisted.id}`, insertIndex);
}

export async function focusOrOpenChat(): Promise<void> {
  const { panels, activePanelId, setActivePanel } = useUIStore.getState();
  const activePanel = panels.find((panel) => panel.id === activePanelId);
  if (activePanel && isChatPanel(activePanel.nodeId)) {
    return;
  }

  const existingChatPanel = panels.find((panel) => isChatPanel(panel.nodeId));
  if (existingChatPanel) {
    setActivePanel(existingChatPanel.id);
    return;
  }

  await openChatPanel();
}

export async function openChatWithPrompt(prompt: string): Promise<void> {
  const { panels, activePanelId, setActivePanel, setPendingChatPrompt } = useUIStore.getState();
  const activeChatPanel = panels.find(
    (panel) => panel.id === activePanelId && isChatPanel(panel.nodeId),
  );
  const targetPanel = activeChatPanel ?? panels.find((panel) => isChatPanel(panel.nodeId));

  if (targetPanel) {
    setActivePanel(targetPanel.id);
  } else {
    await openChatPanel();
  }

  setPendingChatPrompt(prompt);
}

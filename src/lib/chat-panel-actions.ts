import { createSession } from './ai-chat-tree.js';
import { saveChatSession } from './ai-persistence.js';
import { useUIStore } from '../stores/ui-store.js';

let pendingEnsureChatSession: Promise<string> | null = null;

async function createChatSession(): Promise<string> {
  const session = createSession();
  try {
    await saveChatSession(session);
  } catch {
    // Fail open: the in-memory session is still usable even if persistence fails.
  }

  return session.id;
}

function selectChatSession(sessionId: string, switchView: boolean): void {
  const ui = useUIStore.getState();
  ui.setCurrentChatSessionId(sessionId);
  if (switchView) {
    ui.switchToChat();
  }
}

export async function ensureChatSession(): Promise<string> {
  const existingSessionId = useUIStore.getState().currentChatSessionId;
  if (existingSessionId) {
    return existingSessionId;
  }

  if (!pendingEnsureChatSession) {
    pendingEnsureChatSession = createChatSession()
      .then((sessionId) => {
        const currentSessionId = useUIStore.getState().currentChatSessionId;
        if (!currentSessionId) {
          selectChatSession(sessionId, false);
          return sessionId;
        }
        return currentSessionId;
      })
      .finally(() => {
        pendingEnsureChatSession = null;
      });
  }

  return pendingEnsureChatSession;
}

export async function openChatPanel(): Promise<string> {
  const sessionId = await createChatSession();
  selectChatSession(sessionId, true);
  return sessionId;
}

export async function focusOrOpenChat(): Promise<void> {
  const { currentChatSessionId, switchToChat } = useUIStore.getState();
  if (currentChatSessionId) {
    switchToChat();
    return;
  }

  await openChatPanel();
}

export function switchToChatSession(sessionId: string): void {
  selectChatSession(sessionId, true);
}

export async function openChatWithPrompt(prompt: string): Promise<void> {
  const ui = useUIStore.getState();
  let sessionId = ui.currentChatSessionId;

  if (!sessionId) {
    sessionId = await createChatSession();
    selectChatSession(sessionId, true);
  } else {
    ui.switchToChat();
  }

  ui.setPendingChatPrompt({ sessionId, prompt });
}

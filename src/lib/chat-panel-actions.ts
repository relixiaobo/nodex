import { createSession } from './ai-chat-tree.js';
import { saveChatSession } from './ai-persistence.js';
import { useUIStore } from '../stores/ui-store.js';

async function createChatSession(): Promise<string> {
  const session = createSession();
  try {
    await saveChatSession(session);
  } catch {
    // Fail open: the in-memory session is still usable even if persistence fails.
  }

  return session.id;
}

export async function ensureChatSession(): Promise<string> {
  const existingSessionId = useUIStore.getState().currentChatSessionId;
  if (existingSessionId) {
    return existingSessionId;
  }

  const sessionId = await createChatSession();
  useUIStore.getState().setCurrentChatSessionId(sessionId);
  return sessionId;
}

export async function openChatPanel(): Promise<string> {
  const sessionId = await createChatSession();
  const ui = useUIStore.getState();
  ui.setCurrentChatSessionId(sessionId);
  ui.switchToChat();
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
  const ui = useUIStore.getState();
  ui.setCurrentChatSessionId(sessionId);
  ui.switchToChat();
}

export async function openChatWithPrompt(prompt: string): Promise<void> {
  const ui = useUIStore.getState();
  let sessionId = ui.currentChatSessionId;

  if (!sessionId) {
    sessionId = await createChatSession();
    ui.setCurrentChatSessionId(sessionId);
    ui.switchToChat();
  } else {
    ui.switchToChat();
  }

  ui.setPendingChatPrompt({ sessionId, prompt });
}

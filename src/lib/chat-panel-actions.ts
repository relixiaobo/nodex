import { createSession } from './ai-chat-tree.js';
import { saveChatSession } from './ai-persistence.js';
import { useUIStore } from '../stores/ui-store.js';

let pendingEnsureChatSession: Promise<string> | null = null;
const FLOATING_CHAT_INPUT_SELECTOR = '[data-floating-chat-input="true"]';
const CHAT_DRAWER_TEXTAREA_SELECTOR = '[data-chat-drawer="true"] textarea';

async function createChatSession(): Promise<string> {
  const session = createSession();
  try {
    await saveChatSession(session);
  } catch {
    // Fail open: the in-memory session is still usable even if persistence fails.
  }

  return session.id;
}

function selectChatSession(sessionId: string, openDrawer: boolean): void {
  const ui = useUIStore.getState();
  ui.setCurrentChatSessionId(sessionId);
  if (openDrawer) {
    ui.openChatDrawer();
  }
}

function focusFloatingChatInput(): boolean {
  const input = document.querySelector<HTMLInputElement>(FLOATING_CHAT_INPUT_SELECTOR);
  if (!input) return false;
  input.focus();
  input.select();
  return true;
}

function focusDrawerChatInput(): boolean {
  const textarea = document.querySelector<HTMLTextAreaElement>(CHAT_DRAWER_TEXTAREA_SELECTOR);
  if (!textarea) return false;
  textarea.focus();
  const end = textarea.value.length;
  textarea.setSelectionRange(end, end);
  return true;
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

export async function openNewChatDrawer(): Promise<string> {
  const sessionId = await createChatSession();
  selectChatSession(sessionId, true);
  return sessionId;
}

export async function focusOrOpenChat(): Promise<void> {
  const { chatDrawerOpen, currentChatSessionId, openChatDrawer } = useUIStore.getState();
  if (chatDrawerOpen) {
    if (!focusDrawerChatInput()) {
      requestAnimationFrame(() => {
        void focusDrawerChatInput();
      });
    }
    return;
  }

  if (focusFloatingChatInput()) {
    return;
  }

  if (currentChatSessionId) {
    openChatDrawer();
    requestAnimationFrame(() => {
      void focusDrawerChatInput();
    });
    return;
  }

  await openNewChatDrawer();
  requestAnimationFrame(() => {
    void focusDrawerChatInput();
  });
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
    ui.openChatDrawer();
  }

  ui.setPendingChatPrompt({ sessionId, prompt });
}

import 'fake-indexeddb/auto';
import { deleteDB } from 'idb';
import * as aiPersistence from '../../src/lib/ai-persistence.js';
import { getChatSession, resetChatPersistenceForTests } from '../../src/lib/ai-persistence.js';
import { useUIStore } from '../../src/stores/ui-store.js';
import {
  ensureChatSession,
  focusOrOpenChat,
  openNewChatDrawer,
  openChatWithPrompt,
} from '../../src/lib/chat-panel-actions.js';
import { resetAndSeed } from './helpers/test-state.js';

const DB_NAME = 'soma-ai-chat';

describe('chat-panel-actions', () => {
  beforeEach(async () => {
    resetAndSeed();
    useUIStore.getState().replaceCurrentNode('proj_1');
    resetChatPersistenceForTests();
    await deleteDB(DB_NAME);
    resetChatPersistenceForTests();
  });

  it('ensureChatSession creates a persisted session without switching away from node view', async () => {
    const sessionId = await ensureChatSession();

    const state = useUIStore.getState();
    expect(state.chatDrawerOpen).toBe(false);
    expect(state.currentNodeId).toBe('proj_1');
    expect(state.currentChatSessionId).toBe(sessionId);

    const persisted = await getChatSession(sessionId);
    expect(persisted?.id).toBe(sessionId);
  });

  it('dedupes concurrent ensureChatSession calls into one persisted session', async () => {
    const saveChatSessionSpy = vi.spyOn(aiPersistence, 'saveChatSession');

    const [firstSessionId, secondSessionId] = await Promise.all([
      ensureChatSession(),
      ensureChatSession(),
    ]);

    expect(firstSessionId).toBe(secondSessionId);
    expect(saveChatSessionSpy).toHaveBeenCalledTimes(1);
    expect(useUIStore.getState().currentChatSessionId).toBe(firstSessionId);
  });

  it('openNewChatDrawer creates a new persisted session and opens the drawer', async () => {
    const sessionId = await openNewChatDrawer();

    const state = useUIStore.getState();
    expect(state.chatDrawerOpen).toBe(true);
    expect(state.currentChatSessionId).toBe(sessionId);
    expect(state.currentNodeId).toBe('proj_1');

    const persisted = await getChatSession(sessionId);
    expect(persisted?.id).toBe(sessionId);
  });

  it('focusOrOpenChat focuses an existing session instead of creating another one', async () => {
    const existingSessionId = await ensureChatSession();

    useUIStore.getState().closeChatDrawer();
    await focusOrOpenChat();

    const state = useUIStore.getState();
    expect(state.chatDrawerOpen).toBe(true);
    expect(state.currentChatSessionId).toBe(existingSessionId);
  });

  it('openChatWithPrompt reuses the existing chat session and queues the prompt', async () => {
    const existingSessionId = await ensureChatSession();

    useUIStore.getState().closeChatDrawer();
    await openChatWithPrompt('Explain this page');

    const state = useUIStore.getState();
    expect(state.chatDrawerOpen).toBe(true);
    expect(state.currentChatSessionId).toBe(existingSessionId);
    expect(state.pendingChatPrompt).toEqual({
      sessionId: existingSessionId,
      prompt: 'Explain this page',
    });
  });

  it('openChatWithPrompt creates a new chat session when none exists', async () => {
    await openChatWithPrompt('Start fresh');

    const state = useUIStore.getState();
    expect(state.chatDrawerOpen).toBe(true);
    expect(state.currentChatSessionId).toBeTruthy();
    expect(state.pendingChatPrompt).toEqual({
      sessionId: state.currentChatSessionId!,
      prompt: 'Start fresh',
    });
  });
});

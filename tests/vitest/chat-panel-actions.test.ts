import 'fake-indexeddb/auto';
import { deleteDB } from 'idb';
import { getChatSession, resetChatPersistenceForTests } from '../../src/lib/ai-persistence.js';
import { useUIStore } from '../../src/stores/ui-store.js';
import {
  ensureChatSession,
  focusOrOpenChat,
  openChatPanel,
  openChatWithPrompt,
} from '../../src/lib/chat-panel-actions.js';
import { resetAndSeed } from './helpers/test-state.js';

const DB_NAME = 'soma-ai-chat';

describe('chat-panel-actions', () => {
  beforeEach(async () => {
    resetAndSeed();
    useUIStore.getState().replacePanel('proj_1');
    resetChatPersistenceForTests();
    await deleteDB(DB_NAME);
    resetChatPersistenceForTests();
  });

  it('ensureChatSession creates a persisted session without switching away from node view', async () => {
    const sessionId = await ensureChatSession();

    const state = useUIStore.getState();
    expect(state.activeView).toBe('node');
    expect(state.currentNodeId).toBe('proj_1');
    expect(state.currentChatSessionId).toBe(sessionId);

    const persisted = await getChatSession(sessionId);
    expect(persisted?.id).toBe(sessionId);
  });

  it('openChatPanel creates a new persisted session and switches to chat view', async () => {
    const sessionId = await openChatPanel();

    const state = useUIStore.getState();
    expect(state.activeView).toBe('chat');
    expect(state.currentChatSessionId).toBe(sessionId);
    expect(state.currentNodeId).toBe('proj_1');

    const persisted = await getChatSession(sessionId);
    expect(persisted?.id).toBe(sessionId);
  });

  it('focusOrOpenChat focuses an existing session instead of creating another one', async () => {
    const existingSessionId = await ensureChatSession();

    useUIStore.getState().switchToNode('proj_1');
    await focusOrOpenChat();

    const state = useUIStore.getState();
    expect(state.activeView).toBe('chat');
    expect(state.currentChatSessionId).toBe(existingSessionId);
  });

  it('openChatWithPrompt reuses the existing chat session and queues the prompt', async () => {
    const existingSessionId = await ensureChatSession();

    useUIStore.getState().switchToNode('proj_1');
    await openChatWithPrompt('Explain this page');

    const state = useUIStore.getState();
    expect(state.activeView).toBe('chat');
    expect(state.currentChatSessionId).toBe(existingSessionId);
    expect(state.pendingChatPrompt).toEqual({
      sessionId: existingSessionId,
      prompt: 'Explain this page',
    });
  });

  it('openChatWithPrompt creates a new chat session when none exists', async () => {
    await openChatWithPrompt('Start fresh');

    const state = useUIStore.getState();
    expect(state.activeView).toBe('chat');
    expect(state.currentChatSessionId).toBeTruthy();
    expect(state.pendingChatPrompt).toEqual({
      sessionId: state.currentChatSessionId!,
      prompt: 'Start fresh',
    });
  });
});

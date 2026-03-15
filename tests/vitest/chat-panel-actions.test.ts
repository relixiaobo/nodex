import 'fake-indexeddb/auto';
import { deleteDB } from 'idb';
import { getChatSession, resetChatPersistenceForTests } from '../../src/lib/ai-persistence.js';
import { chatPanelSessionId, isChatPanel } from '../../src/types/index.js';
import { useUIStore } from '../../src/stores/ui-store.js';
import { focusOrOpenChat, openChatPanel, openChatWithPrompt } from '../../src/lib/chat-panel-actions.js';
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

  it('openChatPanel creates a persisted session and opens a chat panel', async () => {
    await openChatPanel();

    const state = useUIStore.getState();
    expect(state.panels).toHaveLength(2);

    const chatPanel = state.panels[1];
    expect(chatPanel).toBeDefined();
    expect(isChatPanel(chatPanel!.nodeId)).toBe(true);
    expect(state.activePanelId).toBe(chatPanel!.id);

    const persisted = await getChatSession(chatPanelSessionId(chatPanel!.nodeId));
    expect(persisted?.id).toBe(chatPanelSessionId(chatPanel!.nodeId));
  });

  it('focusOrOpenChat focuses an existing chat panel instead of creating another one', async () => {
    await openChatPanel();
    const existingChatPanel = useUIStore.getState().panels[1]!;

    useUIStore.getState().setActivePanel('main');
    await focusOrOpenChat();

    const state = useUIStore.getState();
    expect(state.panels).toHaveLength(2);
    expect(state.activePanelId).toBe(existingChatPanel.id);
  });

  it('openChatWithPrompt reuses an existing chat panel and queues the prompt', async () => {
    await openChatPanel();
    const existingChatPanel = useUIStore.getState().panels[1]!;

    useUIStore.getState().setActivePanel('main');
    await openChatWithPrompt('Explain this page');

    const state = useUIStore.getState();
    expect(state.panels).toHaveLength(2);
    expect(state.activePanelId).toBe(existingChatPanel.id);
    expect(state.pendingChatPrompt).toEqual({
      panelId: existingChatPanel.id,
      prompt: 'Explain this page',
    });
  });

  it('openChatWithPrompt opens a new chat panel and targets that panel when none exists', async () => {
    await openChatWithPrompt('Start fresh');

    const state = useUIStore.getState();
    const createdChatPanel = state.panels[1];

    expect(createdChatPanel).toBeDefined();
    expect(isChatPanel(createdChatPanel!.nodeId)).toBe(true);
    expect(state.activePanelId).toBe(createdChatPanel!.id);
    expect(state.pendingChatPrompt).toEqual({
      panelId: createdChatPanel!.id,
      prompt: 'Start fresh',
    });
  });
});

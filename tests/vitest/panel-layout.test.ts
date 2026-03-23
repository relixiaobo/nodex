import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEnsureChatSession } = vi.hoisted(() => ({
  mockEnsureChatSession: vi.fn<() => Promise<string>>(),
}));

vi.mock('../../src/lib/chat-panel-actions.js', () => ({
  ensureChatSession: mockEnsureChatSession,
  openChatDrawer: vi.fn(),
  openChatWithPrompt: vi.fn(),
}));

vi.mock('../../src/lib/ai-service.js', () => ({
  getAgentForSession: vi.fn(),
  getChatTitle: (sessionId: string) => sessionId === 'session_1' ? 'Session One' : 'Chat',
  subscribeChatTitles: () => () => {},
  updateSessionTitle: vi.fn(),
}));

vi.mock('../../src/components/chat/ChatPanel.js', () => ({
  ChatPanel: ({ sessionId, hideHeader }: { sessionId: string; hideHeader?: boolean }) =>
    React.createElement('div', {
      'data-testid': 'chat-panel',
      'data-session-id': sessionId,
      'data-hide-header': String(Boolean(hideHeader)),
    }),
}));

vi.mock('../../src/components/panel/NodePanel.js', () => ({
  NodePanel: ({ nodeId, panelId }: { nodeId: string; panelId: string }) =>
    React.createElement('div', {
      'data-testid': 'node-panel',
      'data-node-id': nodeId,
      'data-panel-id': panelId,
    }),
}));

vi.mock('../../src/components/panel/AppPanel.js', () => ({
  AppPanel: ({ panelId }: { panelId: string }) =>
    React.createElement('div', {
      'data-testid': 'app-panel',
      'data-panel-id': panelId,
    }),
}));

vi.mock('../../src/components/panel/Breadcrumb.js', () => ({
  Breadcrumb: ({ nodeId }: { nodeId: string }) =>
    React.createElement('div', { 'data-testid': 'breadcrumb', 'data-node-id': nodeId }),
}));

vi.mock('../../src/components/toolbar/ToolbarUserMenu.js', () => ({
  ToolbarUserMenu: () => React.createElement('div', { 'data-testid': 'user-menu' }),
}));

import { DrawerLayout } from '../../src/components/layout/DrawerLayout.js';
import { useUIStore } from '../../src/stores/ui-store.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('DrawerLayout', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetAndSeed();
    mockEnsureChatSession.mockReset();
    mockEnsureChatSession.mockImplementation(async () => {
      useUIStore.getState().setCurrentChatSessionId('session_auto');
      return 'session_auto';
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    flushSync(() => {
      root.unmount();
    });
    container.remove();
  });

  async function tick(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('renders the outliner base layer with top bar and floating chat bar', async () => {
    useUIStore.setState({
      currentChatSessionId: 'session_1',
      currentNodeId: 'proj_1',
      nodeHistory: ['proj_1'],
      nodeHistoryIndex: 0,
    });

    flushSync(() => {
      root.render(React.createElement(DrawerLayout));
    });
    await tick();

    expect(container.querySelector('[data-testid="top-bar"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="breadcrumb"][data-node-id="proj_1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="user-menu"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="node-panel"][data-node-id="proj_1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="floating-chat-bar"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="chat-drawer"]')).toBeNull();
  });

  it('ensures a hidden chat session exists without changing the current node', async () => {
    useUIStore.setState({
      currentChatSessionId: null,
      currentNodeId: 'proj_1',
      nodeHistory: ['proj_1'],
      nodeHistoryIndex: 0,
    });

    flushSync(() => {
      root.render(React.createElement(DrawerLayout));
    });

    await vi.waitFor(() => {
      expect(mockEnsureChatSession).toHaveBeenCalledTimes(1);
      expect(useUIStore.getState().currentChatSessionId).toBe('session_auto');
    });

    expect(useUIStore.getState().chatDrawerOpen).toBe(false);
    expect(useUIStore.getState().currentNodeId).toBe('proj_1');
  });

  it('renders app panels in the base layer and closes the drawer from the backdrop', async () => {
    useUIStore.setState({
      chatDrawerOpen: true,
      currentChatSessionId: 'session_1',
      currentNodeId: 'app:about',
      nodeHistory: ['app:about'],
      nodeHistoryIndex: 0,
    });

    flushSync(() => {
      root.render(React.createElement(DrawerLayout));
    });
    await tick();

    expect(container.querySelector('[data-testid="app-panel"][data-panel-id="app:about"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="chat-drawer"]')).not.toBeNull();
    expect(
      container
        .querySelector('[data-testid="chat-panel"][data-session-id="session_1"]')
        ?.getAttribute('data-hide-header'),
    ).toBe('true');

    const appPanel = container.querySelector('[data-testid="app-panel"][data-panel-id="app:about"]');
    flushSync(() => {
      appPanel?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });
    await tick();

    expect(useUIStore.getState().chatDrawerOpen).toBe(false);
  });
});

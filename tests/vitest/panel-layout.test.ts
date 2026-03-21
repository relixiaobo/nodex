import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEnsureChatSession } = vi.hoisted(() => ({
  mockEnsureChatSession: vi.fn<() => Promise<string>>(),
}));

vi.mock('../../src/lib/chat-panel-actions.js', () => ({
  ensureChatSession: mockEnsureChatSession,
}));

vi.mock('../../src/lib/ai-service.js', () => ({
  getChatTitle: (sessionId: string) => sessionId === 'session_1' ? 'Session One' : 'Chat',
  subscribeChatTitles: () => () => {},
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

vi.mock('../../src/components/toolbar/ToolbarUserMenu.js', () => ({
  ToolbarUserMenu: () => React.createElement('div', { 'data-testid': 'user-menu' }),
}));

import { ToggleLayout } from '../../src/components/layout/ToggleLayout.js';
import { useUIStore } from '../../src/stores/ui-store.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('ToggleLayout', () => {
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

  function getViewWrappers(): HTMLElement[] {
    const layout = container.firstElementChild as HTMLDivElement | null;
    const viewContainer = layout?.children[1] as HTMLDivElement | undefined;
    return Array.from(viewContainer?.children ?? []) as HTMLElement[];
  }

  it('keeps both views mounted and switches visibility through the top-bar toggles', async () => {
    useUIStore.setState({
      activeView: 'chat',
      currentChatSessionId: 'session_1',
      currentNodeId: 'proj_1',
      nodeHistory: ['proj_1'],
      nodeHistoryIndex: 0,
    });

    flushSync(() => {
      root.render(React.createElement(ToggleLayout));
    });
    await tick();

    const wrappers = getViewWrappers();
    expect(container.querySelector('[data-testid="chat-panel"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="node-panel"]')).not.toBeNull();
    expect(wrappers).toHaveLength(2);
    expect(wrappers[0]?.getAttribute('aria-hidden')).toBe('false');
    expect(wrappers[1]?.getAttribute('aria-hidden')).toBe('true');
    expect(container.textContent).toContain('Session One');

    const buttons = container.querySelectorAll('button');
    flushSync(() => {
      buttons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await tick();

    const nextWrappers = getViewWrappers();
    expect(useUIStore.getState().activeView).toBe('node');
    expect(nextWrappers[0]?.getAttribute('aria-hidden')).toBe('true');
    expect(nextWrappers[1]?.getAttribute('aria-hidden')).toBe('false');
    expect(container.textContent).toContain('My Project');
  });

  it('ensures a hidden chat session exists without stealing node focus', async () => {
    useUIStore.setState({
      activeView: 'node',
      currentChatSessionId: null,
      currentNodeId: 'proj_1',
      nodeHistory: ['proj_1'],
      nodeHistoryIndex: 0,
    });

    flushSync(() => {
      root.render(React.createElement(ToggleLayout));
    });

    await vi.waitFor(() => {
      expect(mockEnsureChatSession).toHaveBeenCalledTimes(1);
      expect(useUIStore.getState().currentChatSessionId).toBe('session_auto');
    });

    expect(useUIStore.getState().activeView).toBe('node');
    expect(useUIStore.getState().currentNodeId).toBe('proj_1');
  });

  it('renders app panels inside the node view', async () => {
    useUIStore.setState({
      activeView: 'node',
      currentChatSessionId: 'session_1',
      currentNodeId: 'app:about',
      nodeHistory: ['app:about'],
      nodeHistoryIndex: 0,
    });

    flushSync(() => {
      root.render(React.createElement(ToggleLayout));
    });
    await tick();

    expect(container.querySelector('[data-testid="app-panel"][data-panel-id="app:about"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="node-panel"]')).toBeNull();
  });
});

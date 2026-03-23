import 'fake-indexeddb/auto';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const { mockGetCurrentUser, mockGetStartupPagePreference } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockGetStartupPagePreference: vi.fn(),
}));

vi.mock('../../src/lib/auth.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/auth.js')>('../../src/lib/auth.js');
  return {
    ...actual,
    getCurrentUser: mockGetCurrentUser,
    getStoredToken: vi.fn().mockResolvedValue(null),
  };
});

vi.mock('../../src/lib/startup-page-preference.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/startup-page-preference.js')>('../../src/lib/startup-page-preference.js');
  return {
    ...actual,
    getStartupPagePreference: mockGetStartupPagePreference,
  };
});

vi.mock('../../src/hooks/use-nav-undo-keyboard', () => ({
  useNavUndoKeyboard: vi.fn(),
}));

vi.mock('../../src/hooks/use-chat-shortcut.js', () => ({
  useChatShortcut: vi.fn(),
}));

vi.mock('../../src/hooks/use-today-shortcut', () => ({
  useTodayShortcut: vi.fn(),
}));

vi.mock('../../src/hooks/use-global-selection-dismiss.js', () => ({
  useGlobalSelectionDismiss: () => ({
    onPointerDownCapture: undefined,
    onFocusCapture: undefined,
  }),
}));

vi.mock('../../src/components/layout/DrawerLayout.js', () => ({
  DrawerLayout: () => React.createElement('div', { 'data-testid': 'drawer-layout' }),
}));

vi.mock('../../src/components/search/CommandPalette', () => ({
  CommandPalette: () => null,
}));

vi.mock('../../src/components/tags/BatchTagSelector', () => ({
  BatchTagSelector: () => null,
}));

vi.mock('../../src/components/ui/Tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  Tooltip: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));

import { App } from '../../src/entrypoints/sidepanel/App.js';
import { ensureTodayNode } from '../../src/lib/journal.js';
import { STARTUP_PAGE } from '../../src/lib/startup-page-preference.js';
import { useUIStore } from '../../src/stores/ui-store.js';
import { useWorkspaceStore } from '../../src/stores/workspace-store.js';
import { resetStores } from './helpers/test-state.js';

describe('App bootstrap', () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalChrome: typeof globalThis.chrome | undefined;

  beforeEach(async () => {
    resetStores();
    await useWorkspaceStore.persist.rehydrate();
    await useUIStore.persist.rehydrate();
    mockGetCurrentUser.mockReset();
    mockGetStartupPagePreference.mockReset();
    mockGetStartupPagePreference.mockReturnValue(STARTUP_PAGE.CHAT);

    originalChrome = globalThis.chrome;
    vi.stubGlobal('chrome', {
      runtime: {
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        sendMessage: vi.fn().mockResolvedValue(undefined),
      },
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
    if (originalChrome) {
      globalThis.chrome = originalChrome;
    } else {
      vi.unstubAllGlobals();
    }
  });

  it('renders the login screen when no authenticated session is restored', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    flushSync(() => {
      root.render(React.createElement(App));
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Sign in with Google');
      expect(container.textContent).toContain('Sign in to continue');
    });
  });

  it('opens Today on bootstrap when startup preference is Today while keeping node view active', async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: 'user_app_bootstrap',
      email: 'app@example.com',
      name: 'App User',
    });
    mockGetStartupPagePreference.mockReturnValue(STARTUP_PAGE.TODAY);

    flushSync(() => {
      root.render(React.createElement(App));
    });

    await vi.waitFor(() => {
      const state = useUIStore.getState();
      expect(state.currentNodeId).toBe(ensureTodayNode());
      expect(container.querySelector('[data-testid="drawer-layout"]')).not.toBeNull();
    });

    expect(useUIStore.getState().currentChatSessionId).toBeNull();
  });
});

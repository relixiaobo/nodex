/**
 * Tests for the palette command registry (src/lib/palette-commands.ts).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  getContainerCommands,
  getSystemCommands,
  getAllCommands,
  getActionLabel,
  type CommandContext,
} from '../../src/lib/palette-commands';

function mockContext(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    navigateTo: vi.fn(),
    closeSearch: vi.fn(),
    isSignedIn: false,
    signInWithGoogle: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('getContainerCommands', () => {
  it('returns at least Library, Inbox, Journal, Trash', () => {
    const cmds = getContainerCommands();
    const ids = cmds.map((c) => c.id);
    expect(ids).toContain('nav:LIBRARY');
    expect(ids).toContain('nav:INBOX');
    expect(ids).toContain('nav:JOURNAL');
    expect(ids).toContain('nav:TRASH');
  });

  it('all have type "container"', () => {
    const cmds = getContainerCommands();
    for (const cmd of cmds) {
      expect(cmd.type).toBe('container');
    }
  });

  it('action calls navigateTo + closeSearch', () => {
    const ctx = mockContext();
    const cmds = getContainerCommands();
    cmds[0].action(ctx);
    expect(ctx.navigateTo).toHaveBeenCalled();
    expect(ctx.closeSearch).toHaveBeenCalled();
  });
});

describe('getSystemCommands', () => {
  it('includes Go to Today', () => {
    const cmds = getSystemCommands();
    const today = cmds.find((c) => c.id === 'cmd:today');
    expect(today).toBeDefined();
    expect(today!.type).toBe('command');
    expect(today!.shortcut).toBeTruthy();
  });

  it('does not include Sign in/out (handled by ToolbarUserMenu)', () => {
    const cmds = getSystemCommands();
    const ids = cmds.map((c) => c.id);
    expect(ids).not.toContain('cmd:signin');
    expect(ids).not.toContain('cmd:signout');
  });
});

describe('getAllCommands', () => {
  it('includes containers and system commands', () => {
    const ctx = mockContext();
    const all = getAllCommands(ctx);
    const ids = all.map((c) => c.id);
    expect(ids).toContain('nav:LIBRARY');
    expect(ids).toContain('cmd:today');
  });

  it('includes both containers and system commands', () => {
    const ctx = mockContext();
    const all = getAllCommands(ctx);
    const types = new Set(all.map((c) => c.type));
    expect(types.has('container')).toBe(true);
    expect(types.has('command')).toBe(true);
  });
});

describe('getActionLabel', () => {
  it('returns correct labels for each type', () => {
    expect(getActionLabel('node')).toBe('Open');
    expect(getActionLabel('container')).toBe('Open');
    expect(getActionLabel('command')).toBe('Run');
    expect(getActionLabel('create')).toBe('Create');
  });
});

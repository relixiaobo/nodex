import { useEffect } from 'react';
import { useUIStore } from '../stores/ui-store';
import { getShortcutKeys, matchesShortcutEvent } from '../lib/shortcut-registry.js';

function shouldHandleChatShortcut(): boolean {
  const activeElement = document.activeElement;
  if (!activeElement) return true;
  if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
    return false;
  }
  if (activeElement instanceof HTMLElement && activeElement.isContentEditable) {
    return false;
  }
  return true;
}

export function useChatShortcut(): void {
  useEffect(() => {
    const bindings = getShortcutKeys('global.toggle_chat', ['Mod-l', 'Mod-Shift-l']);

    function handleKeyDown(event: KeyboardEvent) {
      const matches = bindings.some((binding) => matchesShortcutEvent(event, binding));
      if (!matches || !shouldHandleChatShortcut()) return;

      event.preventDefault();
      event.stopPropagation();
      useUIStore.getState().toggleChat();
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, []);
}

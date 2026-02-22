import { useEffect, useMemo } from 'react';
import type { FocusEvent as ReactFocusEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useUIStore } from '../stores/ui-store';
import {
  shouldClearSelectionOnFocusIn,
  shouldClearSelectionOnPointerDown,
} from '../lib/row-pointer-selection.js';

function shouldPreserveForModifierGesture(event: Pick<MouseEvent, 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function clearSelectionForPointerTarget(event: Pick<MouseEvent, 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'target'>) {
  const state = useUIStore.getState();
  if (state.selectedNodeIds.size === 0) return;
  if (shouldPreserveForModifierGesture(event)) return;

  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!shouldClearSelectionOnPointerDown(target)) return;
  state.clearSelection();
}

function clearSelectionForFocusTarget(targetLike: EventTarget | null) {
  const state = useUIStore.getState();
  if (state.selectedNodeIds.size === 0) return;

  const target = targetLike instanceof HTMLElement ? targetLike : null;
  if (!shouldClearSelectionOnFocusIn(target)) return;
  state.clearSelection();
}

export function useGlobalSelectionDismiss() {
  useEffect(() => {
    const handleGlobalPointerOrMouseDown = (event: PointerEvent | MouseEvent) => {
      clearSelectionForPointerTarget(event);
    };

    const handleFocusIn = (event: FocusEvent) => {
      clearSelectionForFocusTarget(event.target);
    };

    window.addEventListener('pointerdown', handleGlobalPointerOrMouseDown, true);
    window.addEventListener('mousedown', handleGlobalPointerOrMouseDown, true);
    document.addEventListener('focusin', handleFocusIn, true);
    return () => {
      window.removeEventListener('pointerdown', handleGlobalPointerOrMouseDown, true);
      window.removeEventListener('mousedown', handleGlobalPointerOrMouseDown, true);
      document.removeEventListener('focusin', handleFocusIn, true);
    };
  }, []);

  return useMemo(() => ({
    onPointerDownCapture: (event: ReactPointerEvent<HTMLElement>) => {
      clearSelectionForPointerTarget(event.nativeEvent);
    },
    onFocusCapture: (event: ReactFocusEvent<HTMLElement>) => {
      clearSelectionForFocusTarget(event.target);
    },
  }), []);
}


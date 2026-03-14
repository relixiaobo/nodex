import { useCallback, useEffect, useRef, useState } from 'react';

const WIDE_LAYOUT_MIN_WIDTH = 500;

const CHAT_WIDTH_DEFAULT_RATIO = 0.4;
const CHAT_WIDTH_DEFAULT_MAX = 420;
const CHAT_WIDTH_MIN = 240;
const CHAT_WIDTH_MAX_RATIO = 0.7;

const CHAT_HEIGHT_DEFAULT_RATIO = 0.6;
const CHAT_HEIGHT_DEFAULT_MAX = 480;
const CHAT_HEIGHT_MIN = 120;
const CHAT_HEIGHT_MAX_RATIO = 0.85;

export interface ChatResizeResult {
  /** Current chat column width (wide mode), px. */
  chatWidth: number;
  /** Current chat area height (narrow mode), px. */
  chatHeight: number;
  /** Attach to the resize handle's onPointerDown. */
  handlePointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
}

function defaultWidth() {
  return Math.min(window.innerWidth * CHAT_WIDTH_DEFAULT_RATIO, CHAT_WIDTH_DEFAULT_MAX);
}

function defaultHeight() {
  return Math.min(window.innerHeight * CHAT_HEIGHT_DEFAULT_RATIO, CHAT_HEIGHT_DEFAULT_MAX);
}

/**
 * Manages drag-to-resize for the Chat area.
 *
 * - Wide layout → horizontal resize (width)
 * - Narrow layout → vertical resize (height)
 *
 * Returns current sizes (always a number, never null) and a pointerDown handler.
 */
export function useChatResize(): ChatResizeResult {
  const [chatWidth, setChatWidth] = useState<number | null>(null);
  const [chatHeight, setChatHeight] = useState<number | null>(null);

  // Keep a ref so the drag closure always reads the latest value
  const widthRef = useRef(chatWidth);
  const heightRef = useRef(chatHeight);
  useEffect(() => { widthRef.current = chatWidth; }, [chatWidth]);
  useEffect(() => { heightRef.current = chatHeight; }, [chatHeight]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();

    const isHorizontal = window.innerWidth > WIDE_LAYOUT_MIN_WIDTH;
    const startPos = isHorizontal ? e.clientX : e.clientY;
    const startSize = isHorizontal
      ? (widthRef.current ?? defaultWidth())
      : (heightRef.current ?? defaultHeight());

    document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize';

    function onMove(me: PointerEvent) {
      me.preventDefault();
      const delta = startPos - (isHorizontal ? me.clientX : me.clientY);
      if (isHorizontal) {
        setChatWidth(Math.max(CHAT_WIDTH_MIN, Math.min(window.innerWidth * CHAT_WIDTH_MAX_RATIO, startSize + delta)));
      } else {
        setChatHeight(Math.max(CHAT_HEIGHT_MIN, Math.min(window.innerHeight * CHAT_HEIGHT_MAX_RATIO, startSize + delta)));
      }
    }

    function onUp() {
      document.body.style.cursor = '';
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, []); // stable — reads refs, not state

  return {
    chatWidth: chatWidth ?? defaultWidth(),
    chatHeight: chatHeight ?? defaultHeight(),
    handlePointerDown,
  };
}

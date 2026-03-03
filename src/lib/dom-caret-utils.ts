/**
 * DOM caret/text-offset utilities shared between OutlinerItem and NodeHeader.
 */

/**
 * Compute the text offset (character index) at the given client coordinates
 * within a container element, using the browser's caret-from-point API.
 */
export function getTextOffsetFromPoint(container: HTMLElement, clientX: number, clientY: number): number | null {
  const doc = container.ownerDocument;
  const docWithCaret = doc as Document & {
    caretPositionFromPoint?: (x: number, y: number) => CaretPosition | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };

  let startContainer: Node | null = null;
  let startOffset = 0;

  try {
    const pos = docWithCaret.caretPositionFromPoint?.(clientX, clientY);
    if (pos) {
      startContainer = pos.offsetNode;
      startOffset = pos.offset;
    } else {
      const range = docWithCaret.caretRangeFromPoint?.(clientX, clientY);
      if (range) {
        startContainer = range.startContainer;
        startOffset = range.startOffset;
      }
    }
  } catch {
    return null;
  }

  if (!startContainer || !container.contains(startContainer)) {
    return null;
  }

  try {
    const preRange = doc.createRange();
    preRange.setStart(container, 0);
    preRange.setEnd(startContainer, startOffset);
    return preRange.toString().length;
  } catch {
    return null;
  }
}

/**
 * Walk the container's text nodes and inline-reference elements to find the
 * rightmost rendered pixel edge. Returns `null` if the container is empty.
 */
export function getRenderedTextRightEdge(container: HTMLElement): number | null {
  const doc = container.ownerDocument;
  try {
    let maxRight = -Infinity;
    const walker = doc.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            return (node.textContent ?? '').length > 0
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT;
          }
          const el = node as HTMLElement;
          if (el === container) return NodeFilter.FILTER_SKIP;
          // Inline reference chips should count as visible text width.
          if (el.matches('[data-inlineref-node], .inline-ref, .inline-reference')) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_SKIP;
        },
      },
    );

    let node: Node | null = walker.nextNode();
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const range = doc.createRange();
        range.selectNodeContents(node);
        const rects = Array.from(range.getClientRects());
        for (const rect of rects) {
          if (rect.width > 0 || rect.height > 0) {
            maxRight = Math.max(maxRight, rect.right);
          }
        }
      } else if (node instanceof HTMLElement) {
        const rect = node.getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0) {
          maxRight = Math.max(maxRight, rect.right);
        }
      }
      node = walker.nextNode();
    }

    return Number.isFinite(maxRight) ? maxRight : null;
  } catch {
    return null;
  }
}

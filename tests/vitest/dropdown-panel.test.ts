import React, { useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DropdownPanel } from '../../src/components/ui/DropdownPanel.js';

function Harness({ onClose }: { onClose: () => void }) {
  const anchorRef = useRef<HTMLButtonElement>(null);

  return React.createElement(
    React.Fragment,
    null,
    React.createElement('button', { ref: anchorRef, type: 'button' }, 'Anchor'),
    React.createElement(
      DropdownPanel,
      { anchorRef, onClose },
      React.createElement('div', null, 'Menu'),
    ),
  );
}

describe('DropdownPanel', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    flushSync(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = '';
  });

  it('consumes Escape before outer document handlers can close the drawer', () => {
    const onClose = vi.fn();
    const outerHandler = vi.fn();
    document.addEventListener('keydown', outerHandler);

    flushSync(() => {
      root.render(React.createElement(Harness, { onClose }));
    });

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(outerHandler).not.toHaveBeenCalled();

    document.removeEventListener('keydown', outerHandler);
  });
});

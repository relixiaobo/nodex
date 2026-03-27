import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Check, Copy } from '../../lib/icons.js';

interface CopyIconButtonProps {
  text: string;
  ariaLabel: string;
  className?: string;
  iconSize?: number;
  strokeWidth?: number;
  onCopy?: (text: string) => void | Promise<void>;
}

export function CopyIconButton({
  text,
  ariaLabel,
  className = '',
  iconSize = 14,
  strokeWidth = 1.8,
  onCopy,
}: CopyIconButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (resetRef.current !== null) {
      window.clearTimeout(resetRef.current);
    }
  }, []);

  async function handleCopy(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (!text) return;

    try {
      if (onCopy) {
        await onCopy(text);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopied(true);
      if (resetRef.current !== null) {
        window.clearTimeout(resetRef.current);
      }
      resetRef.current = window.setTimeout(() => {
        setCopied(false);
        resetRef.current = null;
      }, 1500);
    } catch {
      // Clipboard access can fail in extension contexts; keep the action silent.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={ariaLabel}
      disabled={!text}
      className={className}
    >
      {copied ? <Check size={iconSize} strokeWidth={2} /> : <Copy size={iconSize} strokeWidth={strokeWidth} />}
    </button>
  );
}

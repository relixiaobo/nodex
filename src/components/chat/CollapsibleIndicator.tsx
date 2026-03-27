import type { ReactNode } from 'react';
import { ChevronDown } from '../../lib/icons.js';

interface CollapsibleIndicatorProps {
  expanded: boolean;
  icon: ReactNode;
  hoverScopeClass: string;
  sizeClassName?: string;
}

/**
 * Stable disclosure affordance for compact collapsible chat rows.
 * Both icons are absolutely overlaid so hover/state changes never reflow text.
 */
export function CollapsibleIndicator({
  expanded,
  icon,
  hoverScopeClass,
  sizeClassName = 'h-4 w-3.5',
}: CollapsibleIndicatorProps) {
  return (
    <span className={`relative flex shrink-0 items-center justify-center ${sizeClassName}`}>
      <span
        className={`absolute inset-0 flex items-center justify-center transition-opacity ${
          expanded ? 'opacity-0' : `opacity-100 ${hoverScopeClass}:opacity-0`
        }`}
      >
        {icon}
      </span>
      <span
        className={`absolute inset-0 flex items-center justify-center transition-opacity ${
          expanded ? 'opacity-100' : `opacity-0 ${hoverScopeClass}:opacity-100`
        }`}
      >
        <ChevronDown size={14} strokeWidth={1.8} className={expanded ? 'rotate-180' : ''} />
      </span>
    </span>
  );
}

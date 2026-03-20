import type { AppIcon } from '../../lib/icons.js';
import { ChevronDown } from '../../lib/icons.js';

/**
 * Collapsible-header icon: shows `icon` by default, chevron on hover,
 * rotated chevron when expanded. Parent button must use `group/disc`.
 */
export function DisclosureIcon({ expanded, icon: Icon, iconClass }: {
  expanded: boolean;
  icon: AppIcon;
  iconClass?: string;
}) {
  return (
    <span className="flex h-4 w-3.5 shrink-0 items-center justify-center">
      {expanded ? (
        <ChevronDown size={14} strokeWidth={1.8} className="rotate-180" />
      ) : (
        <>
          <Icon size={14} strokeWidth={1.6} className={`group-hover/disc:hidden${iconClass ? ` ${iconClass}` : ''}`} />
          <ChevronDown size={14} strokeWidth={1.8} className="hidden group-hover/disc:block" />
        </>
      )}
    </span>
  );
}

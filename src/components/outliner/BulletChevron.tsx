import type { ReactNode } from 'react';
import type { AppIcon } from '../../lib/icons.js';
import { t } from '../../i18n/strings.js';
import { Tooltip } from '../ui/Tooltip';

/** Build inline style for a multi-color conic-gradient or solid bullet. */
function buildBulletStyle(colors: string[]): React.CSSProperties {
  if (colors.length === 0) return {};
  if (colors.length === 1) return { backgroundColor: colors[0] };
  const seg = 100 / colors.length;
  const stops = colors.map((c, i) => `${c} ${i * seg}% ${(i + 1) * seg}%`).join(', ');
  return { background: `conic-gradient(${stops})` };
}

interface BulletChevronProps {
  hasChildren: boolean;
  isExpanded: boolean;
  onBulletClick: (e: React.MouseEvent) => void;
  /** Dimmed style for trailing input placeholder bullets */
  dimmed?: boolean;
  /** Reference node: show concentric circles (bullseye) bullet */
  isReference?: boolean;
  /** TagDef color: renders colored circle with white # instead of plain dot */
  tagDefColor?: string;
  /** Supertag colors: tints/multi-colors the bullet dot based on applied supertags */
  bulletColors?: string[];
  /** Structural icon: renders a small icon instead of the dot (e.g. for fieldDef nodes) */
  icon?: AppIcon | null;
  /** Loading state: pulse animation while content is being fetched */
  isLoading?: boolean;
  /** Loading spinner variant: 'pulse' (default pulsing dot) or 'spin' (spinning arc) */
  spinnerStyle?: 'pulse' | 'spin';
  /** Disable button semantics/cursor for purely decorative bullets */
  interactive?: boolean;
  /** Override tooltip label; defaults to "Zoom in" for interactive bullets */
  tooltipLabel?: string;
}

function maybeWrapWithTooltip({
  interactive,
  tooltipLabel,
  content,
}: {
  interactive: boolean;
  tooltipLabel?: string;
  content: ReactNode;
}) {
  const label = tooltipLabel ?? (interactive ? t('outliner.zoomIn') : undefined);
  if (!label) return content;
  return <Tooltip label={label}>{content}</Tooltip>;
}

/**
 * Bullet component (15px zone).
 *
 * Renders the bullet dot with optional outer ring (collapsed-with-children)
 * and reference dashed border. Used everywhere a bullet is needed.
 *
 * In OutlinerItem, a separate ChevronButton sits to the left of this bullet
 * to form the side-by-side layout: [Chevron 15px][Bullet 15px][gap 7.5px][text].
 * The selection ring wraps Bullet + text, not the chevron.
 */
export function BulletChevron({
  hasChildren,
  isExpanded,
  onBulletClick,
  dimmed,
  isReference,
  tagDefColor,
  bulletColors,
  icon: Icon,
  isLoading,
  spinnerStyle,
  interactive = true,
  tooltipLabel,
}: BulletChevronProps) {
  const showOuterRing = hasChildren && !isExpanded;
  const wrapperClass = `flex shrink-0 h-6 w-[15px] items-center justify-center group/bullet ${interactive ? 'cursor-pointer' : 'cursor-default'}`;

  // Loading state: spinning arc or pulsing dot
  if (isLoading) {
    const spinner = spinnerStyle === 'spin' ? (
      // Spinning arc variant
      <svg className="animate-spin h-3 w-3" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" opacity="0.15" />
        <path d="M10.5 6a4.5 4.5 0 0 0-4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ) : (
      // Generic loading: pulsing dot
      <div className="h-[5px] w-[5px] rounded-full bg-foreground/40 animate-pulse" />
    );
    return (
      maybeWrapWithTooltip({
        interactive,
        tooltipLabel,
        content: (
          <span
            role={interactive ? 'button' : undefined}
            className={`${wrapperClass} text-foreground/40`}
            onClick={interactive ? onBulletClick : undefined}
          >
            {spinner}
          </span>
        ),
      })
    );
  }

  // TagDef bullet: colored circle with white #
  if (tagDefColor) {
    return (
      maybeWrapWithTooltip({
        interactive,
        tooltipLabel,
        content: (
          <span
            role={interactive ? 'button' : undefined}
            className={wrapperClass}
            onClick={interactive ? onBulletClick : undefined}
          >
            <div
              className="flex h-[15px] w-[15px] items-center justify-center rounded-full transition-transform group-hover/bullet:scale-110 group-active/bullet:scale-90"
              style={{ backgroundColor: tagDefColor }}
            >
              <span className="text-[9px] font-bold leading-none text-white select-none">#</span>
            </div>
          </span>
        ),
      })
    );
  }

  // FieldDef bullet: structural icon (field type) with optional supertag color
  if (Icon) {
    const iconColor = bulletColors?.[0] ?? 'var(--color-foreground-secondary)';
    return (
      maybeWrapWithTooltip({
        interactive,
        tooltipLabel,
        content: (
          <span
            role={interactive ? 'button' : undefined}
            className={wrapperClass}
            onClick={interactive ? onBulletClick : undefined}
          >
            <Icon
              size={12}
              className="transition-transform group-hover/bullet:scale-110 group-active/bullet:scale-90"
              style={{ color: iconColor }}
            />
          </span>
        ),
      })
    );
  }

  // Plain bullet: solid dot or multi-color conic-gradient pie
  const hasColors = bulletColors && bulletColors.length > 0;
  const bulletStyle = hasColors ? buildBulletStyle(bulletColors!) : undefined;

  return (
    maybeWrapWithTooltip({
      interactive,
      tooltipLabel,
      content: (
        <span
          role={interactive ? 'button' : undefined}
          className={wrapperClass}
          onClick={interactive ? onBulletClick : undefined}
        >
          <div
            className={`flex h-[15px] w-[15px] items-center justify-center rounded-full transition-colors group-active/bullet:scale-90 ${isReference ? 'border border-dashed border-foreground/40' : ''
              } ${showOuterRing ? 'bg-foreground/[0.08]' : ''}`}
          >
            <div
              className={`h-[5px] w-[5px] rounded-full transition-transform group-hover/bullet:scale-[1.375] ${!hasColors ? (dimmed ? 'bg-foreground/15' : 'bg-foreground/40') : ''}`}
              style={bulletStyle}
            />
          </div>
        </span>
      ),
    })
  );
}

interface ChevronButtonProps {
  isExpanded: boolean;
  onToggle: () => void;
  onDrillDown: () => void;
  onTogglePointerDown?: () => void;
}

/**
 * Chevron expand/collapse button (15px zone).
 *
 * Sits to the LEFT of the Bullet in OutlinerItem, forming:
 *   [Chevron 15px][Bullet 15px][gap 7.5px][text]
 *
 * Hidden by default, appears on row hover via group-hover/row.
 * pointer-events-none when hidden to prevent invisible click interception.
 */
export function ChevronButton({
  isExpanded,
  onToggle,
  onDrillDown,
  onTogglePointerDown,
}: ChevronButtonProps) {
  return (
    <Tooltip label={isExpanded ? 'Collapse' : 'Expand'}>
      <button
        className="flex shrink-0 h-6 w-[15px] items-center justify-center opacity-0 group-hover/row:opacity-100 pointer-events-none group-hover/row:pointer-events-auto transition-opacity focus:outline-none"
        tabIndex={-1}
        onPointerDown={(e) => {
          onTogglePointerDown?.();
          // Pointer events fire before mousedown; prevent focus theft here.
          e.preventDefault();
        }}
        onMouseDown={(e) => {
          // Prevent focus from moving onto the button; otherwise Cmd+Z can be swallowed
          // by the browser/native control path instead of reaching unified undo handlers.
          e.preventDefault();
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggle();
        }}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDrillDown();
        }}
      >
        <div
          className={`flex h-[15px] w-[15px] items-center justify-center rounded-full bg-background-recessed outline outline-2 outline-background transition-colors ${isExpanded ? '[&>svg]:rotate-90' : ''
            }`}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 12 12"
            className="text-foreground-secondary/60 hover:text-foreground transition-transform"
          >
            <path
              d="M4.5 2.5L8 6L4.5 9.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </button>
    </Tooltip>
  );
}

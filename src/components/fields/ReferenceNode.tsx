/**
 * Reference-style node display for OPTIONS field values.
 * Shows as: [colored bullet] [blue-link-text]
 * Pure display component — click handling by parent.
 */
interface ReferenceNodeProps {
  name: string;
}

export function ReferenceNode({ name }: ReferenceNodeProps) {
  return (
    <span className="inline-flex items-center gap-1 h-[22px]">
      <span className="shrink-0 w-[14px] h-[14px] flex items-center justify-center">
        <span className="w-[4px] h-[4px] rounded-full bg-primary/60" />
      </span>
      <span className="text-[12px] leading-[22px] text-primary truncate">
        {name}
      </span>
    </span>
  );
}

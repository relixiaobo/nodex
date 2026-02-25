import { GripVertical } from '../../lib/icons.js';

interface DragHandleProps {
  onDragStart: () => void;
}

export function DragHandle({ onDragStart }: DragHandleProps) {
  return (
    <span
      className="flex h-6 w-5 shrink-0 cursor-grab items-center justify-center opacity-0 group-hover/row:opacity-40 hover:!opacity-100 active:cursor-grabbing transition-opacity"
      draggable
      onDragStart={onDragStart}
    >
      <GripVertical size={12} className="text-ink-tertiary" />
    </span>
  );
}

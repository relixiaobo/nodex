import type { DragEvent } from 'react';
import { GripVertical } from '../../lib/icons.js';
import { Tooltip } from '../ui/Tooltip';
import { t } from '../../i18n/strings.js';

interface DragHandleProps {
  onDragStart: (e: DragEvent) => void;
}

export function DragHandle({ onDragStart }: DragHandleProps) {
  return (
    <Tooltip label={t('toolbar.dragToMove')} side="top">
      <span
        className="flex h-6 w-5 shrink-0 cursor-grab items-center justify-center opacity-0 group-hover/row:opacity-40 hover:!opacity-100 active:cursor-grabbing transition-opacity"
        draggable
        onDragStart={onDragStart}
      >
        <GripVertical size={12} className="text-foreground-tertiary" />
      </span>
    </Tooltip>
  );
}

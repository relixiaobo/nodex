/**
 * Date navigation bar — shown below NodePanelHeader when viewing a day node.
 *
 * Layout: [<] [>]  Today  [Calendar icon for date picker]
 *
 * - < > buttons: navigate to previous/next day
 * - Today button: jump to today's day node
 * - Calendar icon: placeholder for future DatePicker integration
 */
import { useCallback, useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from '../../lib/icons.js';
import { useUIStore } from '../../stores/ui-store';
import { ensureTodayNode, getAdjacentDayNodeId } from '../../lib/journal.js';

interface DateNavigationBarProps {
  dayNodeId: string;
}

export function DateNavigationBar({ dayNodeId }: DateNavigationBarProps) {
  const navigateTo = useUIStore((s) => s.navigateTo);

  const handlePrevDay = useCallback(() => {
    const prevId = getAdjacentDayNodeId(dayNodeId, -1);
    if (prevId) navigateTo(prevId);
  }, [dayNodeId, navigateTo]);

  const handleNextDay = useCallback(() => {
    const nextId = getAdjacentDayNodeId(dayNodeId, 1);
    if (nextId) navigateTo(nextId);
  }, [dayNodeId, navigateTo]);

  const handleToday = useCallback(() => {
    const todayId = ensureTodayNode();
    navigateTo(todayId);
  }, [navigateTo]);

  return (
    <div className="flex items-center gap-1 px-6 py-1.5 text-sm text-foreground-secondary">
      {/* Previous day */}
      <button
        onClick={handlePrevDay}
        className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-foreground/5 hover:text-foreground transition-colors"
        title="Previous day"
      >
        <ChevronLeft size={16} strokeWidth={1.5} />
      </button>

      {/* Next day */}
      <button
        onClick={handleNextDay}
        className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-foreground/5 hover:text-foreground transition-colors"
        title="Next day"
      >
        <ChevronRight size={16} strokeWidth={1.5} />
      </button>

      {/* Today button */}
      <button
        onClick={handleToday}
        className="flex h-7 items-center rounded-md px-2 text-sm hover:bg-foreground/5 hover:text-foreground transition-colors"
        title="Go to today"
      >
        Today
      </button>

      {/* Calendar icon (placeholder for future date picker) */}
      <button
        className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-foreground/5 hover:text-foreground transition-colors"
        title="Pick a date"
        onClick={handleToday}
      >
        <Calendar size={14} />
      </button>
    </div>
  );
}

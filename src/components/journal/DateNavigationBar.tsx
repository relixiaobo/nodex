/**
 * Date navigation bar — shown below NodePanelHeader when viewing a day node.
 *
 * Layout: [<] [>] Today [Calendar icon → date picker popover]
 *
 * - < > buttons: navigate to previous/next day
 * - Today button: jump to today's day node
 * - Calendar icon: opens a calendar popover for jumping to any date
 */
import { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from '../../lib/icons.js';
import { useUIStore } from '../../stores/ui-store';
import { useNodeStore } from '../../stores/node-store';
import { ensureTodayNode, ensureDateNode, getAdjacentDayNodeId, getDayNoteCountsForMonth } from '../../lib/journal.js';
import { parseDayNodeName, parseYearNodeName } from '../../lib/date-utils.js';
import * as loroDoc from '../../lib/loro-doc.js';
import { CalendarGrid } from '../fields/DatePicker.js';
import { t } from '../../i18n/strings.js';

interface DateNavigationBarProps {
  dayNodeId: string;
}

export function DateNavigationBar({ dayNodeId }: DateNavigationBarProps) {
  const navigateTo = useUIStore((s) => s.navigateTo);

  // Current day node's date as YYYY-MM-DD string (primitive to avoid infinite re-render)
  const currentDateStr = useNodeStore((s) => {
    void s._version;
    const node = s.getNode(dayNodeId);
    if (!node?.name) return '';
    const weekId = loroDoc.getParentId(dayNodeId);
    if (!weekId) return '';
    const yearId = loroDoc.getParentId(weekId);
    if (!yearId) return '';
    const yearNode = loroDoc.toNodexNode(yearId);
    if (!yearNode?.name) return '';
    const year = parseYearNodeName(yearNode.name);
    if (year === null) return '';
    const date = parseDayNodeName(node.name, year);
    if (!date) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });

  // Derive year/month from the date string (for calendar view initialization)
  const currentDateInfo = useMemo(() => {
    if (!currentDateStr) return null;
    const [y, m] = currentDateStr.split('-').map(Number);
    return { year: y, month: m - 1, dateStr: currentDateStr };
  }, [currentDateStr]);

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  // ── Day navigation ──

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

  // ── Calendar popover ──

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => currentDateInfo?.year ?? new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => currentDateInfo?.month ?? new Date().getMonth());
  const calendarRef = useRef<HTMLDivElement>(null);

  // Close calendar when navigating to a different day
  useEffect(() => {
    setCalendarOpen(false);
  }, [dayNodeId]);

  // Reset calendar view to current day's month when opening
  const handleToggleCalendar = useCallback(() => {
    if (!calendarOpen) {
      const now = new Date();
      setViewYear(currentDateInfo?.year ?? now.getFullYear());
      setViewMonth(currentDateInfo?.month ?? now.getMonth());
    }
    setCalendarOpen((v) => !v);
  }, [calendarOpen, currentDateInfo]);

  // Close on click outside (capture phase to beat stopPropagation in other components)
  useEffect(() => {
    if (!calendarOpen) return;
    const handler = (e: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setCalendarOpen(false);
      }
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [calendarOpen]);

  // Close on Escape
  useEffect(() => {
    if (!calendarOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCalendarOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [calendarOpen]);

  // Compute note counts for the current calendar view month (heatmap data)
  const version = useNodeStore((s) => s._version);
  const noteCountMap = useMemo(() => {
    void version; // re-compute when data changes
    return getDayNoteCountsForMonth(viewYear, viewMonth);
  }, [viewYear, viewMonth, version]);

  // Select a date from calendar → ensureDateNode → navigateTo
  const handleCalendarSelect = useCallback((dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const dayId = ensureDateNode(date);
    navigateTo(dayId);
    setCalendarOpen(false);
  }, [navigateTo]);

  return (
    <div className="relative my-1.5 text-[11px] text-ink-secondary flex items-center" style={{ paddingLeft: 32 }} ref={calendarRef}>
      <div className="inline-flex items-center gap-1">
        <button
          onClick={handlePrevDay}
          className="flex h-6 w-6 items-center justify-center rounded-full text-ink-tertiary hover:bg-foreground/4 hover:text-ink-primary transition-all"
          title={t('dateNavigationBar.previousDay')}
        >
          <ChevronLeft size={13} strokeWidth={1.5} />
        </button>
        <button
          onClick={handleToday}
          className="flex h-6 items-center px-2.5 rounded-full font-medium text-ink-tertiary hover:bg-foreground/4 hover:text-ink-primary transition-all"
          title={t('dateNavigationBar.goToToday')}
        >
          {t('dateNavigationBar.today')}
        </button>
        <button
          onClick={handleNextDay}
          className="flex h-6 w-6 items-center justify-center rounded-full text-ink-tertiary hover:bg-foreground/4 hover:text-ink-primary transition-all"
          title={t('dateNavigationBar.nextDay')}
        >
          <ChevronRight size={13} strokeWidth={1.5} />
        </button>
      </div>

      {/* 细视觉分隔竖线 */}
      <div className="ml-1.5 w-px h-2.5 bg-border-faint" />

      <button
        onClick={handleToggleCalendar}
        className={`ml-1.5 flex h-6 w-6 items-center justify-center rounded-full transition-all ${calendarOpen
          ? 'bg-foreground/[0.08] text-ink-primary'
          : 'text-ink-tertiary hover:bg-foreground/4 hover:text-ink-primary'
          }`}
        title={t('dateNavigationBar.pickDate')}
      >
        <Calendar size={13} strokeWidth={1.5} />
      </button>
      {/* Calendar popover — left-aligned with bar padding, stays within panel */}
      {
        calendarOpen && (
          <div
            className="absolute top-full z-50 mt-1 w-[252px] rounded-lg border border-border bg-popover p-3"
            style={{ left: 25 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <CalendarGrid
              viewYear={viewYear}
              viewMonth={viewMonth}
              onViewChange={(y, m) => { setViewYear(y); setViewMonth(m); }}
              selectedDate={currentDateInfo?.dateStr ?? todayStr}
              onSelectDate={handleCalendarSelect}
              today={todayStr}
              noteCountMap={noteCountMap}
            />
          </div>
        )
      }
    </div >
  );
}

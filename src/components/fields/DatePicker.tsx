/**
 * Custom DatePicker popover matching design-system.md.
 *
 * Features:
 * - Single calendar with two-click range selection
 * - Year/month picker grids (click year → year grid, click month → month grid)
 * - Today highlight (primary filled) + selected date (ring)
 * - Hover preview for range selection
 * - Time input (HH:MM AM/PM) for start and end
 * - Auto-swap: if end < start, swap them
 * - "Add end" / "Remove end" toggle
 *
 * Storage format in node.props.name:
 *   YYYY-MM-DD | YYYY-MM-DDTHH:MM | YYYY-MM-DD/YYYY-MM-DD | YYYY-MM-DDTHH:MM/YYYY-MM-DDTHH:MM
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay(); // 0=Sun
}

/** ISO 8601 week number */
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

interface DayCell {
  day: number;
  month: number; // 0-based
  year: number;
  isCurrentMonth: boolean;
  dateStr: string; // YYYY-MM-DD
}

function generateCalendarDays(year: number, month: number): DayCell[][] {
  const firstDay = getFirstDayOfWeek(year, month);
  const daysInMonth = getDaysInMonth(year, month);
  const prevMonthIdx = month === 0 ? 11 : month - 1;
  const prevYearIdx = month === 0 ? year - 1 : year;
  const daysInPrevMonth = getDaysInMonth(prevYearIdx, prevMonthIdx);

  const cells: DayCell[] = [];

  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  for (let i = firstDay - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    cells.push({
      day, month: prevMonth, year: prevYear, isCurrentMonth: false,
      dateStr: `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      day: d, month, year, isCurrentMonth: true,
      dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    });
  }

  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  const remaining = 7 - (cells.length % 7);
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      cells.push({
        day: d, month: nextMonth, year: nextYear, isCurrentMonth: false,
        dateStr: `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      });
    }
  }

  const weeks: DayCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const SHORT_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Parse / Format ───────────────────────────────────────────────

interface ParsedDate {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
}

function parseValue(value: string): ParsedDate {
  const result: ParsedDate = { startDate: '', startTime: '', endDate: '', endTime: '' };
  if (!value) return result;

  const parts = value.split('/');
  const [startPart, endPart] = parts;

  if (startPart) {
    if (startPart.includes('T')) {
      const [d, t] = startPart.split('T');
      result.startDate = d;
      result.startTime = t;
    } else {
      result.startDate = startPart;
    }
  }

  if (endPart) {
    if (endPart.includes('T')) {
      const [d, t] = endPart.split('T');
      result.endDate = d;
      result.endTime = t;
    } else {
      result.endDate = endPart;
    }
  }

  return result;
}

function buildValue(startDate: string, startTime: string, endDate: string, endTime: string): string {
  if (!startDate) return '';
  let start = startDate;
  if (startTime) start += `T${startTime}`;
  if (!endDate) return start;
  let end = endDate;
  if (endTime) end += `T${endTime}`;
  return `${start}/${end}`;
}

function dateStrToYM(dateStr: string): { year: number; month: number } {
  const [y, m] = dateStr.split('-').map(Number);
  return { year: y, month: m - 1 };
}

// ─── Time helpers ─────────────────────────────────────────────────

function parse24to12(time24: string): { hours12: string; minutes: string; period: 'AM' | 'PM' } {
  const [h, m] = time24.split(':').map(Number);
  const period: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return {
    hours12: String(h12).padStart(2, '0'),
    minutes: String(m).padStart(2, '0'),
    period,
  };
}

function build24from12(hours12: string, minutes: string, period: 'AM' | 'PM'): string {
  let h = parseInt(hours12, 10);
  if (isNaN(h)) h = 12;
  if (period === 'AM' && h === 12) h = 0;
  else if (period === 'PM' && h !== 12) h += 12;
  const m = parseInt(minutes, 10);
  return `${String(h).padStart(2, '0')}:${String(isNaN(m) ? 0 : m).padStart(2, '0')}`;
}

// ─── Range mode state ─────────────────────────────────────────────

type RangeMode = 'single' | 'selecting_end' | 'range_complete' | 'editing_start' | 'editing_end';

/** Short format for range labels: "Wed, Feb 20" */
function formatShortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const date = new Date(y, m - 1, d);
  return `${DAY_NAMES[date.getDay()]}, ${SHORT_MONTH_NAMES[m - 1]} ${d}`;
}

// ─── DatePicker ───────────────────────────────────────────────────

interface DatePickerProps {
  value: string;
  onSelect: (v: string) => void;
  onClose: () => void;
}

export function DatePicker({ value, onSelect, onClose }: DatePickerProps) {
  const parsed = useMemo(() => parseValue(value), [value]);
  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const [selectedDate, setSelectedDate] = useState(parsed.startDate);
  const [selectedTime, setSelectedTime] = useState(parsed.startTime);
  const [endDate, setEndDate] = useState(parsed.endDate);
  const [endTime, setEndTime] = useState(parsed.endTime);
  const [hoveredDate, setHoveredDate] = useState('');

  // Range mode state machine
  const [rangeMode, setRangeMode] = useState<RangeMode>(
    parsed.endDate ? 'range_complete' : 'single',
  );

  const isRangeActive = rangeMode !== 'single';

  // Calendar view
  const initYM = parsed.startDate ? dateStrToYM(parsed.startDate) : { year: new Date().getFullYear(), month: new Date().getMonth() };
  const [viewYear, setViewYear] = useState(initYM.year);
  const [viewMonth, setViewMonth] = useState(initYM.month);

  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Handle date click based on range mode
  const handleDateClick = useCallback((dateStr: string) => {
    switch (rangeMode) {
      case 'single':
        setSelectedDate(dateStr);
        break;
      case 'selecting_end':
      case 'editing_end': {
        // Auto-swap if end < start
        let s = selectedDate;
        let e = dateStr;
        if (e < s) { [s, e] = [e, s]; setSelectedDate(s); }
        setEndDate(e);
        setHoveredDate('');
        setRangeMode('range_complete');
        break;
      }
      case 'editing_start': {
        setSelectedDate(dateStr);
        // If new start > current end, swap
        if (endDate && dateStr > endDate) {
          setEndDate(dateStr);
          setSelectedDate(endDate);
        }
        setRangeMode('editing_end');
        break;
      }
      case 'range_complete':
        // Click in range_complete = start editing start
        setSelectedDate(dateStr);
        if (endDate && dateStr > endDate) {
          setEndDate(dateStr);
          setSelectedDate(endDate);
        }
        setRangeMode('editing_end');
        break;
    }
  }, [rangeMode, selectedDate, endDate]);

  const handleOk = useCallback(() => {
    if (!selectedDate) {
      onClose();
      return;
    }
    const v = buildValue(selectedDate, selectedTime, isRangeActive ? endDate : '', isRangeActive ? endTime : '');
    onSelect(v);
    onClose();
  }, [selectedDate, selectedTime, isRangeActive, endDate, endTime, onSelect, onClose]);

  const handleClearDate = useCallback(() => {
    onSelect('');
    onClose();
  }, [onSelect, onClose]);

  const handleAddEnd = useCallback(() => {
    if (!selectedDate) return;
    setEndDate(selectedDate);
    setRangeMode('selecting_end');
  }, [selectedDate]);

  const handleRemoveEnd = useCallback(() => {
    setRangeMode('single');
    setEndDate('');
    setEndTime('');
    setHoveredDate('');
  }, []);

  // For hover preview: compute effective range
  const effectiveRangeStart = selectedDate;
  const effectiveRangeEnd = useMemo(() => {
    if (rangeMode === 'selecting_end' || rangeMode === 'editing_end') {
      return hoveredDate || endDate;
    }
    if (rangeMode === 'range_complete' || rangeMode === 'editing_start') {
      return endDate;
    }
    return '';
  }, [rangeMode, hoveredDate, endDate]);

  const showHover = rangeMode === 'selecting_end' || rangeMode === 'editing_end';

  return (
    <div
      ref={containerRef}
      className="absolute left-0 top-full z-50 mt-1 w-full min-w-[248px] max-w-[280px] rounded-lg border border-border bg-popover shadow-lg p-3"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Close button */}
      <button
        className="absolute top-2 right-2 text-foreground-tertiary hover:text-foreground-secondary transition-colors"
        onClick={onClose}
      >
        <X size={14} />
      </button>

      {/* Range labels (only in range modes) */}
      {isRangeActive && (
        <div className="flex items-center gap-1.5 mb-2 text-xs">
          <button
            className={`rounded px-1.5 py-0.5 transition-colors cursor-pointer ${
              rangeMode === 'editing_start' ? 'ring-1 ring-primary bg-primary-muted text-foreground' : 'bg-foreground/5 text-foreground-secondary hover:bg-foreground/10'
            }`}
            onClick={() => setRangeMode('editing_start')}
          >
            {selectedDate ? formatShortDate(selectedDate) : 'Start'}
          </button>
          <span className="text-foreground-tertiary">→</span>
          <button
            className={`rounded px-1.5 py-0.5 transition-colors cursor-pointer ${
              rangeMode === 'selecting_end' || rangeMode === 'editing_end'
                ? 'ring-1 ring-primary bg-primary-muted text-foreground'
                : 'bg-foreground/5 text-foreground-secondary hover:bg-foreground/10'
            }`}
            onClick={() => setRangeMode('editing_end')}
          >
            {endDate ? formatShortDate(endDate) : 'End'}
          </button>
        </div>
      )}

      {/* Calendar */}
      <CalendarGrid
        viewYear={viewYear}
        viewMonth={viewMonth}
        onViewChange={(y, m) => { setViewYear(y); setViewMonth(m); }}
        selectedDate={selectedDate}
        onSelectDate={handleDateClick}
        today={today}
        rangeStart={isRangeActive ? effectiveRangeStart : undefined}
        rangeEnd={isRangeActive ? effectiveRangeEnd : undefined}
        hoveredDate={showHover ? hoveredDate : ''}
        onHover={showHover ? setHoveredDate : undefined}
      />

      {/* Bottom bar */}
      <div className="mt-2">
        {isRangeActive ? (
          <>
            {/* Time inputs row */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] text-foreground-tertiary w-7 shrink-0">Start</span>
              <TimeInput value={selectedTime} onChange={setSelectedTime} />
              <span className="text-[10px] text-foreground-tertiary w-6 shrink-0 text-right">End</span>
              <TimeInput value={endTime} onChange={setEndTime} />
            </div>
            {/* Actions row */}
            <div className="flex items-center justify-between">
              <button
                className="text-xs text-foreground-tertiary hover:text-foreground-secondary transition-colors cursor-pointer"
                onClick={handleRemoveEnd}
              >
                Remove end
              </button>
              <button
                className="text-sm font-medium text-primary hover:text-primary-hover transition-colors cursor-pointer"
                onClick={handleOk}
              >
                OK
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between">
            <TimeInput value={selectedTime} onChange={setSelectedTime} />
            <div className="flex items-center gap-3">
              <button
                className="text-xs text-foreground-tertiary hover:text-foreground-secondary transition-colors cursor-pointer"
                onClick={handleAddEnd}
              >
                Add end
              </button>
              <button
                className="text-sm font-medium text-primary hover:text-primary-hover transition-colors cursor-pointer"
                onClick={handleOk}
              >
                OK
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Clear date */}
      {selectedDate && (
        <div className="mt-2 pt-2 border-t border-border">
          <button
            className="text-xs text-foreground-tertiary hover:text-destructive transition-colors cursor-pointer"
            onClick={handleClearDate}
          >
            Clear date
          </button>
        </div>
      )}
    </div>
  );
}

// ─── CalendarGrid ─────────────────────────────────────────────────

interface CalendarGridProps {
  viewYear: number;
  viewMonth: number;
  onViewChange: (year: number, month: number) => void;
  selectedDate: string;
  onSelectDate: (dateStr: string) => void;
  today: string;
  rangeStart?: string;
  rangeEnd?: string;
  hoveredDate?: string;
  onHover?: (dateStr: string) => void;
}

function CalendarGrid({
  viewYear,
  viewMonth,
  onViewChange,
  selectedDate,
  onSelectDate,
  today,
  rangeStart,
  rangeEnd,
  hoveredDate,
  onHover,
}: CalendarGridProps) {
  const [pickerMode, setPickerMode] = useState<'calendar' | 'year' | 'month'>('calendar');
  const weeks = useMemo(() => generateCalendarDays(viewYear, viewMonth), [viewYear, viewMonth]);

  const prevMonth = () => {
    if (pickerMode === 'year') {
      onViewChange(viewYear - 12, viewMonth);
    } else if (pickerMode === 'month') {
      onViewChange(viewYear - 1, viewMonth);
    } else {
      if (viewMonth === 0) onViewChange(viewYear - 1, 11);
      else onViewChange(viewYear, viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (pickerMode === 'year') {
      onViewChange(viewYear + 12, viewMonth);
    } else if (pickerMode === 'month') {
      onViewChange(viewYear + 1, viewMonth);
    } else {
      if (viewMonth === 11) onViewChange(viewYear + 1, 0);
      else onViewChange(viewYear, viewMonth + 1);
    }
  };

  // Compute effective range for highlighting (with hover preview)
  const rangeA = rangeStart ?? '';
  const rangeB = hoveredDate || rangeEnd || '';
  const effectiveStart = rangeA && rangeB ? (rangeA < rangeB ? rangeA : rangeB) : rangeA;
  const effectiveEnd = rangeA && rangeB ? (rangeA < rangeB ? rangeB : rangeA) : rangeB;

  const isInRange = useCallback((dateStr: string) => {
    if (!effectiveStart || !effectiveEnd) return false;
    return dateStr > effectiveStart && dateStr < effectiveEnd;
  }, [effectiveStart, effectiveEnd]);

  // Year picker
  if (pickerMode === 'year') {
    const startYear = viewYear - 5;
    const years = Array.from({ length: 12 }, (_, i) => startYear + i);
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <button className="text-foreground-tertiary hover:text-foreground-secondary transition-colors w-6 h-6 flex items-center justify-center" onClick={prevMonth}>
            <ChevronLeft size={14} />
          </button>
          <span className="text-sm font-medium text-foreground-secondary">{startYear} – {startYear + 11}</span>
          <button className="text-foreground-tertiary hover:text-foreground-secondary transition-colors w-6 h-6 flex items-center justify-center" onClick={nextMonth}>
            <ChevronRight size={14} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {years.map((y) => (
            <button
              key={y}
              className={`h-8 rounded-md text-sm transition-colors cursor-pointer ${
                y === viewYear ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-foreground/5 text-foreground'
              }`}
              onClick={() => { onViewChange(y, viewMonth); setPickerMode('calendar'); }}
            >
              {y}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Month picker
  if (pickerMode === 'month') {
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <button className="text-foreground-tertiary hover:text-foreground-secondary transition-colors w-6 h-6 flex items-center justify-center" onClick={prevMonth}>
            <ChevronLeft size={14} />
          </button>
          <span className="text-sm font-medium text-foreground-secondary">{viewYear}</span>
          <button className="text-foreground-tertiary hover:text-foreground-secondary transition-colors w-6 h-6 flex items-center justify-center" onClick={nextMonth}>
            <ChevronRight size={14} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {SHORT_MONTH_NAMES.map((name, i) => (
            <button
              key={i}
              className={`h-8 rounded-md text-sm transition-colors cursor-pointer ${
                i === viewMonth ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-foreground/5 text-foreground'
              }`}
              onClick={() => { onViewChange(viewYear, i); setPickerMode('calendar'); }}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Calendar grid
  return (
    <div>
      {/* Month/Year navigation */}
      <div className="flex items-center justify-between mb-2">
        <button
          className="text-foreground-tertiary hover:text-foreground-secondary transition-colors w-6 h-6 flex items-center justify-center"
          onClick={prevMonth}
        >
          <ChevronLeft size={14} />
        </button>
        <div className="flex items-center gap-1">
          <button
            className="rounded-md px-2 py-0.5 bg-foreground/5 text-sm font-medium hover:bg-foreground/10 transition-colors cursor-pointer"
            onClick={() => setPickerMode('year')}
          >
            {viewYear}
          </button>
          <button
            className="rounded-md px-2 py-0.5 bg-foreground/5 text-sm font-medium hover:bg-foreground/10 transition-colors cursor-pointer"
            onClick={() => setPickerMode('month')}
          >
            {MONTH_NAMES[viewMonth]}
          </button>
        </div>
        <button
          className="text-foreground-tertiary hover:text-foreground-secondary transition-colors w-6 h-6 flex items-center justify-center"
          onClick={nextMonth}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-[auto_repeat(7,1fr)] gap-0 mb-0.5">
        <div className="w-7 text-center text-[10px] text-foreground-tertiary" />
        {DAY_HEADERS.map((d, i) => (
          <div key={i} className="text-center text-[10px] text-foreground-tertiary">
            {d}
          </div>
        ))}
      </div>

      {/* Weeks */}
      {weeks.map((week, wi) => {
        const weekDate = new Date(week[0].year, week[0].month, week[0].day);
        const wn = getWeekNumber(weekDate);
        return (
          <div key={wi} className="grid grid-cols-[auto_repeat(7,1fr)] gap-0">
            <div className="w-7 h-7 flex items-center justify-center text-[10px] text-foreground-tertiary">
              W{wn}
            </div>
            {week.map((cell) => {
              const isToday = cell.dateStr === today;
              const isSelected = cell.dateStr === selectedDate;
              const isEnd = cell.dateStr === effectiveEnd && !!effectiveStart;
              const inRange = isInRange(cell.dateStr);

              let cls = 'aspect-square h-7 mx-auto flex items-center justify-center rounded-full text-sm cursor-pointer transition-colors';

              if (isSelected && isToday) {
                cls += ' bg-primary text-primary-foreground ring-2 ring-primary/50 font-medium';
              } else if (isSelected) {
                cls += ' ring-2 ring-primary/50 font-medium';
              } else if (isEnd) {
                cls += ' ring-2 ring-primary/50 font-medium';
              } else if (isToday) {
                cls += ' bg-primary text-primary-foreground font-medium';
              } else if (inRange) {
                cls += ' bg-primary-muted';
              } else {
                cls += ' hover:bg-foreground/5';
              }

              if (!cell.isCurrentMonth) {
                cls += ' text-foreground-tertiary';
              }

              return (
                <button
                  key={cell.dateStr}
                  className={cls}
                  onClick={() => onSelectDate(cell.dateStr)}
                  onMouseEnter={() => onHover?.(cell.dateStr)}
                  onMouseLeave={() => onHover?.('')}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── TimeInput ────────────────────────────────────────────────────

function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const hasTime = !!value;
  const parsed = hasTime ? parse24to12(value) : { hours12: '--', minutes: '--', period: 'AM' as const };

  const [hours, setHours] = useState(parsed.hours12);
  const [minutes, setMinutes] = useState(parsed.minutes);
  const [period, setPeriod] = useState<'AM' | 'PM'>(parsed.period);

  useEffect(() => {
    if (value) {
      const p = parse24to12(value);
      setHours(p.hours12);
      setMinutes(p.minutes);
      setPeriod(p.period);
    } else {
      setHours('--');
      setMinutes('--');
    }
  }, [value]);

  const commit = useCallback((h: string, m: string, p: 'AM' | 'PM') => {
    if (h === '--' || m === '--') return;
    onChange(build24from12(h, m, p));
  }, [onChange]);

  const handleHoursChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw.length > 2) return;
    const num = parseInt(raw, 10);
    if (raw && (num < 1 || num > 12)) return;
    const val = raw || '--';
    setHours(val);
    if (raw.length === 2 && !isNaN(num)) commit(val.padStart(2, '0'), minutes === '--' ? '00' : minutes, period);
  }, [minutes, period, commit]);

  const handleMinutesChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw.length > 2) return;
    const num = parseInt(raw, 10);
    if (raw && num > 59) return;
    const val = raw || '--';
    setMinutes(val);
    if (raw.length === 2 && !isNaN(num)) commit(hours === '--' ? '12' : hours, val.padStart(2, '0'), period);
  }, [hours, period, commit]);

  const handleHoursBlur = useCallback(() => {
    if (hours !== '--' && hours.length === 1) {
      const padded = hours.padStart(2, '0');
      setHours(padded);
      commit(padded, minutes === '--' ? '00' : minutes, period);
    }
  }, [hours, minutes, period, commit]);

  const handleMinutesBlur = useCallback(() => {
    if (minutes !== '--' && minutes.length === 1) {
      const padded = minutes.padStart(2, '0');
      setMinutes(padded);
      commit(hours === '--' ? '12' : hours, padded, period);
    }
  }, [hours, minutes, period, commit]);

  const togglePeriod = useCallback(() => {
    const newPeriod = period === 'AM' ? 'PM' : 'AM';
    setPeriod(newPeriod);
    if (hours !== '--' && minutes !== '--') {
      commit(hours, minutes, newPeriod);
    }
  }, [hours, minutes, period, commit]);

  const handleHoursFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    if (hours === '--') setHours('');
    e.target.select();
  }, [hours]);

  const handleMinutesFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    if (minutes === '--') setMinutes('');
    e.target.select();
  }, [minutes]);

  return (
    <div className="flex items-center gap-0.5">
      <div className="flex items-center rounded-md border border-border px-1.5 py-0.5 text-sm bg-transparent">
        <input
          type="text"
          value={hours}
          onChange={handleHoursChange}
          onFocus={handleHoursFocus}
          onBlur={handleHoursBlur}
          className="w-5 text-center bg-transparent outline-none text-sm text-foreground"
          maxLength={2}
          placeholder="--"
        />
        <span className="text-foreground-tertiary">:</span>
        <input
          type="text"
          value={minutes}
          onChange={handleMinutesChange}
          onFocus={handleMinutesFocus}
          onBlur={handleMinutesBlur}
          className="w-5 text-center bg-transparent outline-none text-sm text-foreground"
          maxLength={2}
          placeholder="--"
        />
      </div>
      <button
        className="rounded-md px-1.5 py-0.5 text-xs font-medium text-foreground-secondary hover:bg-foreground/5 transition-colors cursor-pointer"
        onClick={togglePeriod}
      >
        {period}
      </button>
    </div>
  );
}

// ─── Format for display ───────────────────────────────────────────

function formatTime12(time24: string): string {
  const { hours12, minutes, period } = parse24to12(time24);
  const h = parseInt(hours12, 10);
  return `${h}:${minutes} ${period}`;
}

function parseDateParts(dateStr: string): { year: number; month: number; day: number } | null {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { year: y, month: m - 1, day: d };
}

function getDayName(year: number, month: number, day: number): string {
  return DAY_NAMES[new Date(year, month, day).getDay()];
}

/** Format date value string for inline display.
 * Single: "Thu, Feb 13" (current year) or "Thu, Feb 13, 2025" (other year)
 * Range: "Wed, Feb 11 → Wed, Feb 18" */
export function formatDateDisplay(value: string): string {
  if (!value) return '';

  const currentYear = new Date().getFullYear();
  const { startDate, startTime, endDate, endTime } = parseValue(value);
  const s = parseDateParts(startDate);
  if (!s) return value;

  const sDayName = getDayName(s.year, s.month, s.day);
  const showStartYear = s.year !== currentYear;

  // Single date
  if (!endDate) {
    let base = `${sDayName}, ${SHORT_MONTH_NAMES[s.month]} ${s.day}`;
    if (startTime) base += `, ${formatTime12(startTime)}`;
    if (showStartYear) base += `, ${s.year}`;
    return base;
  }

  // Range
  const e = parseDateParts(endDate);
  if (!e) return value;

  const eDayName = getDayName(e.year, e.month, e.day);
  const showEndYear = e.year !== currentYear;

  let startStr = `${sDayName}, ${SHORT_MONTH_NAMES[s.month]} ${s.day}`;
  if (startTime) startStr += `, ${formatTime12(startTime)}`;
  if (showStartYear) startStr += `, ${s.year}`;

  let endStr = `${eDayName}, ${SHORT_MONTH_NAMES[e.month]} ${e.day}`;
  if (endTime) endStr += `, ${formatTime12(endTime)}`;
  if (showEndYear) endStr += `, ${e.year}`;

  return `${startStr} → ${endStr}`;
}

/**
 * Custom DatePicker popover matching design-system.md.
 *
 * Features:
 * - Calendar grid with week numbers (W6, W7...)
 * - Year/month navigation arrows
 * - Today highlight (primary filled) + selected date highlight (ring)
 * - Time input (HH:MM AM/PM)
 * - "Add end" → end date calendar (vertical stack for side panel width)
 * - OK confirms, × / click-outside / Escape closes
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

  // Previous month fill
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  for (let i = firstDay - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    cells.push({
      day,
      month: prevMonth,
      year: prevYear,
      isCurrentMonth: false,
      dateStr: `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    });
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      day: d,
      month,
      year,
      isCurrentMonth: true,
      dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    });
  }

  // Next month fill
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  const remaining = 7 - (cells.length % 7);
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      cells.push({
        day: d,
        month: nextMonth,
        year: nextYear,
        isCurrentMonth: false,
        dateStr: `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      });
    }
  }

  // Chunk into weeks
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

const DAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

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

/** Parse "HH:MM" 24h to { hours12, minutes, period } */
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

/** Build "HH:MM" 24h from 12h parts */
function build24from12(hours12: string, minutes: string, period: 'AM' | 'PM'): string {
  let h = parseInt(hours12, 10);
  if (isNaN(h)) h = 12;
  if (period === 'AM' && h === 12) h = 0;
  else if (period === 'PM' && h !== 12) h += 12;
  const m = parseInt(minutes, 10);
  return `${String(h).padStart(2, '0')}:${String(isNaN(m) ? 0 : m).padStart(2, '0')}`;
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
  const [hasEndDate, setHasEndDate] = useState(!!parsed.endDate);
  const [endDate, setEndDate] = useState(parsed.endDate);
  const [endTime, setEndTime] = useState(parsed.endTime);

  // Calendar view months
  const initStart = parsed.startDate ? dateStrToYM(parsed.startDate) : { year: new Date().getFullYear(), month: new Date().getMonth() };
  const [viewYear, setViewYear] = useState(initStart.year);
  const [viewMonth, setViewMonth] = useState(initStart.month);

  const initEnd = parsed.endDate ? dateStrToYM(parsed.endDate) : initStart;
  const [endViewYear, setEndViewYear] = useState(initEnd.year);
  const [endViewMonth, setEndViewMonth] = useState(initEnd.month);

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

  const handleOk = useCallback(() => {
    if (!selectedDate) {
      onClose();
      return;
    }
    const v = buildValue(selectedDate, selectedTime, hasEndDate ? endDate : '', hasEndDate ? endTime : '');
    onSelect(v);
    onClose();
  }, [selectedDate, selectedTime, hasEndDate, endDate, endTime, onSelect, onClose]);

  const handleClearDate = useCallback(() => {
    onSelect('');
    onClose();
  }, [onSelect, onClose]);

  const handleAddEnd = useCallback(() => {
    setHasEndDate(true);
    if (!endDate && selectedDate) {
      // Default end = same as start
      setEndDate(selectedDate);
      const ym = dateStrToYM(selectedDate);
      setEndViewYear(ym.year);
      setEndViewMonth(ym.month);
    }
  }, [endDate, selectedDate]);

  const handleRemoveEnd = useCallback(() => {
    setHasEndDate(false);
    setEndDate('');
    setEndTime('');
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute left-0 top-full z-50 mt-1 w-[280px] rounded-lg border border-border bg-popover shadow-lg p-3"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Close button */}
      <button
        className="absolute top-2 right-2 text-foreground-tertiary hover:text-foreground-secondary transition-colors"
        onClick={onClose}
      >
        <X size={14} />
      </button>

      {/* Start label (only in range mode) */}
      {hasEndDate && (
        <div className="text-xs text-foreground-tertiary mb-1">Start date</div>
      )}

      {/* Start calendar */}
      <CalendarGrid
        viewYear={viewYear}
        viewMonth={viewMonth}
        onViewChange={(y, m) => { setViewYear(y); setViewMonth(m); }}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        today={today}
        rangeStart={selectedDate}
        rangeEnd={hasEndDate ? endDate : undefined}
      />

      {/* Start time */}
      <div className="flex items-center justify-between mt-2">
        <TimeInput value={selectedTime} onChange={setSelectedTime} />
        {!hasEndDate && (
          <div className="flex items-center gap-3">
            <button
              className="text-sm text-foreground-tertiary hover:text-foreground-secondary transition-colors cursor-pointer"
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
        )}
      </div>

      {/* End date section */}
      {hasEndDate && (
        <>
          <div className="border-t border-border my-3" />
          <div className="text-xs text-foreground-tertiary mb-1">End date</div>
          <CalendarGrid
            viewYear={endViewYear}
            viewMonth={endViewMonth}
            onViewChange={(y, m) => { setEndViewYear(y); setEndViewMonth(m); }}
            selectedDate={endDate}
            onSelectDate={setEndDate}
            today={today}
            rangeStart={selectedDate}
            rangeEnd={endDate}
          />
          <div className="flex items-center justify-between mt-2">
            <TimeInput value={endTime} onChange={setEndTime} />
            <div className="flex items-center gap-3">
              <button
                className="text-sm text-foreground-tertiary hover:text-foreground-secondary transition-colors cursor-pointer"
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
          </div>
        </>
      )}

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
}: CalendarGridProps) {
  const weeks = useMemo(() => generateCalendarDays(viewYear, viewMonth), [viewYear, viewMonth]);

  const prevMonth = () => {
    if (viewMonth === 0) onViewChange(viewYear - 1, 11);
    else onViewChange(viewYear, viewMonth - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) onViewChange(viewYear + 1, 0);
    else onViewChange(viewYear, viewMonth + 1);
  };

  const isInRange = useCallback((dateStr: string) => {
    if (!rangeStart || !rangeEnd) return false;
    return dateStr > rangeStart && dateStr < rangeEnd;
  }, [rangeStart, rangeEnd]);

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
          <span className="rounded-md px-2 py-0.5 bg-foreground/5 text-sm font-medium hover:bg-foreground/10 transition-colors cursor-default">
            {viewYear}
          </span>
          <span className="rounded-md px-2 py-0.5 bg-foreground/5 text-sm font-medium hover:bg-foreground/10 transition-colors cursor-default">
            {MONTH_NAMES[viewMonth]}
          </span>
        </div>
        <button
          className="text-foreground-tertiary hover:text-foreground-secondary transition-colors w-6 h-6 flex items-center justify-center"
          onClick={nextMonth}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Day headers with week number column */}
      <div className="grid grid-cols-8 gap-0 mb-0.5">
        <div className="w-7 text-center text-[10px] text-foreground-tertiary" />
        {DAY_HEADERS.map((d, i) => (
          <div key={i} className="w-8 text-center text-[10px] text-foreground-tertiary">
            {d}
          </div>
        ))}
      </div>

      {/* Weeks */}
      {weeks.map((week, wi) => {
        const weekDate = new Date(week[0].year, week[0].month, week[0].day);
        const wn = getWeekNumber(weekDate);
        return (
          <div key={wi} className="grid grid-cols-8 gap-0">
            {/* Week number */}
            <div className="w-7 h-8 flex items-center justify-center text-[10px] text-foreground-tertiary">
              W{wn}
            </div>
            {week.map((cell) => {
              const isToday = cell.dateStr === today;
              const isSelected = cell.dateStr === selectedDate;
              const inRange = isInRange(cell.dateStr);
              const isRangeEnd = cell.dateStr === rangeEnd;

              let cellClasses = 'w-8 h-8 flex items-center justify-center rounded-full text-sm cursor-pointer transition-colors';

              if (isSelected) {
                cellClasses += ' ring-2 ring-primary/50 font-medium';
                if (isToday) {
                  cellClasses += ' bg-primary text-primary-foreground';
                }
              } else if (isRangeEnd) {
                cellClasses += ' ring-2 ring-primary/50 font-medium';
              } else if (isToday) {
                cellClasses += ' bg-primary text-primary-foreground font-medium';
              } else if (inRange) {
                cellClasses += ' bg-primary-muted';
              } else {
                cellClasses += ' hover:bg-foreground/5';
              }

              if (!cell.isCurrentMonth) {
                cellClasses += ' text-foreground-tertiary';
              }

              return (
                <button
                  key={cell.dateStr}
                  className={cellClasses}
                  onClick={() => onSelectDate(cell.dateStr)}
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

  // Sync from outside when value changes
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

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

/** Format date value string for inline display */
export function formatDateDisplay(value: string): string {
  if (!value) return '';

  const { startDate, startTime, endDate, endTime } = parseValue(value);
  const s = parseDateParts(startDate);
  if (!s) return value;

  // Single date
  if (!endDate) {
    const base = `${SHORT_MONTHS[s.month]} ${s.day}, ${s.year}`;
    if (startTime) return `${base} ${formatTime12(startTime)}`;
    return base;
  }

  // Range
  const e = parseDateParts(endDate);
  if (!e) return value;

  const hasTime = startTime || endTime;

  if (!hasTime) {
    // Same month & year
    if (s.year === e.year && s.month === e.month) {
      return `${SHORT_MONTHS[s.month]} ${s.day} – ${e.day}, ${s.year}`;
    }
    // Same year, different month
    if (s.year === e.year) {
      return `${SHORT_MONTHS[s.month]} ${s.day} – ${SHORT_MONTHS[e.month]} ${e.day}, ${s.year}`;
    }
    // Different year
    return `${SHORT_MONTHS[s.month]} ${s.day}, ${s.year} – ${SHORT_MONTHS[e.month]} ${e.day}, ${e.year}`;
  }

  // Range with time
  const startStr = startTime ? `${SHORT_MONTHS[s.month]} ${s.day}, ${formatTime12(startTime)}` : `${SHORT_MONTHS[s.month]} ${s.day}`;
  const endStr = endTime ? `${SHORT_MONTHS[e.month]} ${e.day}, ${formatTime12(endTime)}` : `${SHORT_MONTHS[e.month]} ${e.day}`;

  if (s.year === e.year) {
    return `${startStr} – ${endStr}, ${s.year}`;
  }
  return `${startStr}, ${s.year} – ${endStr}, ${e.year}`;
}

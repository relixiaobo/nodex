/**
 * Custom DatePicker popover — Notion-inspired interaction.
 *
 * Features:
 * - Top date input field(s) showing selected date (+ time when enabled)
 * - Click-to-pick: clicking a date immediately saves (no OK button)
 * - Toggle "End date" / "Include time" settings
 * - "Today" quick-jump button
 * - Year/month picker grids (our advantage over Notion)
 * - Auto-swap: if end < start, swap them
 * - Range hover preview
 *
 * Storage format in node.props.name:
 *   YYYY-MM-DD | YYYY-MM-DDTHH:MM | YYYY-MM-DD/YYYY-MM-DD | YYYY-MM-DDTHH:MM/YYYY-MM-DDTHH:MM
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay(); // 0=Sun
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

  const cells: DayCell[] = [];

  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth);
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

  // Always pad to 6 rows (42 cells) like Notion — show more overflow from next month
  while (cells.length < 42) {
    const prev = cells[cells.length - 1];
    let nm = prev.month;
    let ny = prev.year;
    let nd = prev.day + 1;
    const maxD = getDaysInMonth(ny, nm);
    if (nd > maxD) {
      nd = 1;
      if (nm === 11) { nm = 0; ny += 1; } else { nm += 1; }
    }
    cells.push({
      day: nd, month: nm, year: ny, isCurrentMonth: false,
      dateStr: `${ny}-${String(nm + 1).padStart(2, '0')}-${String(nd).padStart(2, '0')}`,
    });
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

/** Format for editable date input fields: "2026/02/20" */
function formatInputDate(dateStr: string): string {
  // dateStr is YYYY-MM-DD, convert to YYYY/MM/DD for display/editing
  return dateStr.replace(/-/g, '/');
}

/** Parse user-typed date "2026/02/20" or "2026/2/5" back to YYYY-MM-DD */
function parseInputDate(input: string): string | null {
  const trimmed = input.trim().replace(/-/g, '/');
  const parts = trimmed.split('/');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const maxD = getDaysInMonth(y, m - 1);
  if (d > maxD) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Format 24h time to display: "9:00 AM" */
function formatTime12(time24: string): string {
  const { hours12, minutes, period } = parse24to12(time24);
  const h = parseInt(hours12, 10);
  return `${h}:${minutes} ${period}`;
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
  const todayYM = useMemo(() => dateStrToYM(today), [today]);

  const [selectedDate, setSelectedDate] = useState(parsed.startDate);
  const [selectedTime, setSelectedTime] = useState(parsed.startTime);
  const [endDate, setEndDate] = useState(parsed.endDate);
  const [endTime, setEndTime] = useState(parsed.endTime);
  const [hoveredDate, setHoveredDate] = useState('');

  // Simplified state: two booleans + editingEnd enum
  const [includeEnd, setIncludeEnd] = useState(!!parsed.endDate);
  const [includeTime, setIncludeTime] = useState(!!parsed.startTime);
  const [editingEnd, setEditingEnd] = useState<'start' | 'end'>('start');

  // Calendar view
  const initYM = parsed.startDate ? dateStrToYM(parsed.startDate) : todayYM;
  const [viewYear, setViewYear] = useState(initYM.year);
  const [viewMonth, setViewMonth] = useState(initYM.month);

  const containerRef = useRef<HTMLDivElement>(null);

  // Skip first render for auto-save effect
  const isInitialMount = useRef(true);

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

  // ─── Auto-save: every state change immediately calls onSelect ───
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (!selectedDate) return;
    const v = buildValue(
      selectedDate,
      includeTime ? selectedTime : '',
      includeEnd ? endDate : '',
      includeEnd && includeTime ? endTime : '',
    );
    onSelect(v);
  }, [selectedDate, selectedTime, endDate, endTime, includeEnd, includeTime]);

  // Handle date click — simplified state machine
  const handleDateClick = useCallback((dateStr: string) => {
    if (!includeEnd) {
      // Single date mode
      setSelectedDate(dateStr);
    } else if (editingEnd === 'start') {
      // Setting start in range mode
      let s = dateStr;
      let e = endDate;
      if (e && s > e) { [s, e] = [e, s]; }
      setSelectedDate(s);
      if (e) setEndDate(e);
      setEditingEnd('end'); // auto-advance to end
    } else {
      // Setting end in range mode
      let s = selectedDate;
      let e = dateStr;
      if (s && e < s) { [s, e] = [e, s]; setSelectedDate(s); }
      setEndDate(e);
      setHoveredDate('');
    }
    // Auto-jump calendar when clicking an overflow (non-current-month) date
    const { year: cy, month: cm } = dateStrToYM(dateStr);
    if (cy !== viewYear || cm !== viewMonth) {
      setViewYear(cy);
      setViewMonth(cm);
    }
  }, [includeEnd, editingEnd, selectedDate, endDate, viewYear, viewMonth]);

  // Today button
  const handleToday = useCallback(() => {
    setViewYear(todayYM.year);
    setViewMonth(todayYM.month);
    handleDateClick(today);
  }, [todayYM, today, handleDateClick]);

  const handleClearDate = useCallback(() => {
    onSelect('');
    onClose();
  }, [onSelect, onClose]);

  // Toggle end date
  const toggleEnd = useCallback(() => {
    if (!includeEnd) {
      // Turn ON
      setIncludeEnd(true);
      setEndDate(selectedDate || today);
      if (includeTime && !endTime) setEndTime('09:00');
      setEditingEnd('end');
    } else {
      // Turn OFF
      setIncludeEnd(false);
      setEndDate('');
      setEndTime('');
      setEditingEnd('start');
      setHoveredDate('');
    }
  }, [includeEnd, includeTime, endTime, selectedDate, today]);

  // Toggle include time
  const toggleTime = useCallback(() => {
    if (!includeTime) {
      // Turn ON — default 09:00
      setIncludeTime(true);
      if (!selectedTime) setSelectedTime('09:00');
      if (includeEnd && !endTime) setEndTime('09:00');
    } else {
      // Turn OFF
      setIncludeTime(false);
      setSelectedTime('');
      setEndTime('');
    }
  }, [includeTime, includeEnd, selectedTime, endTime]);

  // For hover preview in range mode
  const showHover = includeEnd && editingEnd === 'end';
  const effectiveRangeStart = selectedDate;
  const effectiveRangeEnd = useMemo(() => {
    if (!includeEnd) return '';
    if (showHover && hoveredDate) return hoveredDate;
    return endDate;
  }, [includeEnd, showHover, hoveredDate, endDate]);

  return (
    <div
      ref={containerRef}
      className="absolute left-0 top-full z-50 mt-1 w-full min-w-[248px] max-w-[280px] rounded-lg border border-border bg-popover shadow-lg p-3"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* ─── Top date input field(s) ─── */}
      <div className="mb-2 space-y-1">
        {/* Start date input */}
        <DateInputField
          dateStr={selectedDate}
          timeStr={includeTime ? selectedTime : ''}
          placeholder="YYYY/MM/DD"
          active={!includeEnd || editingEnd === 'start'}
          showRing={includeEnd}
          onClick={() => setEditingEnd('start')}
          onDateChange={(d) => { setSelectedDate(d); const ym = dateStrToYM(d); setViewYear(ym.year); setViewMonth(ym.month); }}
          onTimeChange={includeTime ? setSelectedTime : undefined}
        />
        {/* End date input (only when range active) */}
        {includeEnd && (
          <DateInputField
            dateStr={endDate}
            timeStr={includeTime ? endTime : ''}
            placeholder="YYYY/MM/DD"
            active={editingEnd === 'end'}
            showRing
            onClick={() => setEditingEnd('end')}
            onDateChange={(d) => { setEndDate(d); const ym = dateStrToYM(d); setViewYear(ym.year); setViewMonth(ym.month); }}
            onTimeChange={includeTime ? setEndTime : undefined}
          />
        )}
      </div>

      {/* ─── Calendar ─── */}
      <CalendarGrid
        viewYear={viewYear}
        viewMonth={viewMonth}
        onViewChange={(y, m) => { setViewYear(y); setViewMonth(m); }}
        selectedDate={selectedDate}
        endDate={includeEnd ? endDate : undefined}
        onSelectDate={handleDateClick}
        today={today}
        onToday={handleToday}
        rangeStart={includeEnd ? effectiveRangeStart : undefined}
        rangeEnd={includeEnd ? effectiveRangeEnd : undefined}
        hoveredDate={showHover ? hoveredDate : ''}
        onHover={showHover ? setHoveredDate : undefined}
      />

      {/* ─── Settings toggles ─── */}
      <div className="border-t border-border mt-2 pt-2 space-y-0.5">
        <SettingRow label="End date" checked={includeEnd} onChange={toggleEnd} />
        <SettingRow label="Include time" checked={includeTime} onChange={toggleTime} />
      </div>

      {/* ─── Clear ─── */}
      {selectedDate && (
        <div className="mt-2 pt-2 border-t border-border">
          <button
            className="text-sm text-foreground-secondary hover:text-destructive transition-colors cursor-pointer h-7 flex items-center"
            onClick={handleClearDate}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

// ─── DateInputField ──────────────────────────────────────────────

function DateInputField({
  dateStr,
  timeStr,
  placeholder,
  active,
  showRing,
  onClick,
  onDateChange,
  onTimeChange,
}: {
  dateStr: string;
  timeStr: string;
  placeholder: string;
  active: boolean;
  showRing: boolean;
  onClick: () => void;
  onDateChange?: (dateStr: string) => void;
  onTimeChange?: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = useCallback(() => {
    onClick();
    if (dateStr && onDateChange) {
      setEditing(true);
      setEditValue(formatInputDate(dateStr));
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [dateStr, onClick, onDateChange]);

  const commitEdit = useCallback(() => {
    setEditing(false);
    const parsed = parseInputDate(editValue);
    if (parsed && parsed !== dateStr) {
      onDateChange?.(parsed);
    }
  }, [editValue, dateStr, onDateChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
    else if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
  }, [commitEdit]);

  return (
    <div
      className={`flex w-full items-center rounded-md border text-sm transition-colors ${
        active && showRing
          ? 'border-primary bg-primary/5'
          : active && !showRing
            ? 'border-border bg-transparent'
            : 'border-border bg-transparent hover:border-foreground/20'
      }`}
      onClick={!editing ? startEditing : onClick}
    >
      {/* Date part — editable input */}
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className="flex-1 min-w-0 px-2.5 py-1.5 bg-transparent text-sm text-foreground outline-none"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className={`flex-1 px-2.5 py-1.5 cursor-pointer ${dateStr ? 'text-foreground' : 'text-foreground-tertiary'}`}>
          {dateStr ? formatInputDate(dateStr) : placeholder}
        </span>
      )}
      {/* Time part — separated by | divider */}
      {timeStr && onTimeChange ? (
        <>
          <span className="text-border-emphasis select-none">|</span>
          <span
            className="pl-1.5 pr-1 py-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <InlineTimeInput value={timeStr} onChange={onTimeChange} />
          </span>
        </>
      ) : null}
    </div>
  );
}

// ─── InlineTimeInput (compact time editor inside date input) ─────

function InlineTimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parsed = parse24to12(value);
  const [hours, setHours] = useState(parsed.hours12);
  const [minutes, setMinutes] = useState(parsed.minutes);
  const [period, setPeriod] = useState<'AM' | 'PM'>(parsed.period);

  useEffect(() => {
    const p = parse24to12(value);
    setHours(p.hours12);
    setMinutes(p.minutes);
    setPeriod(p.period);
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
    <span className="inline-flex items-center text-sm text-foreground">
      <input
        type="text"
        value={hours}
        onChange={handleHoursChange}
        onFocus={handleHoursFocus}
        onBlur={handleHoursBlur}
        className="w-[18px] text-right bg-transparent outline-none text-sm"
        maxLength={2}
      />
      <span className="text-foreground-tertiary">:</span>
      <input
        type="text"
        value={minutes}
        onChange={handleMinutesChange}
        onFocus={handleMinutesFocus}
        onBlur={handleMinutesBlur}
        className="w-[18px] bg-transparent outline-none text-sm"
        maxLength={2}
      />
      <button
        className="w-[26px] text-xs font-medium text-foreground-secondary hover:text-foreground transition-colors cursor-pointer text-center"
        onClick={(e) => { e.stopPropagation(); togglePeriod(); }}
      >
        {period}
      </button>
    </span>
  );
}

// ─── SettingRow (label + toggle) ─────────────────────────────────

function SettingRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between min-h-8 px-0.5">
      <span className="text-sm text-foreground">{label}</span>
      <button
        className={`relative w-8 h-[18px] rounded-full transition-colors cursor-pointer ${
          checked ? 'bg-primary' : 'bg-foreground/15'
        }`}
        onClick={onChange}
      >
        <span
          className={`absolute top-[2px] left-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-[14px]' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

// ─── CalendarGrid ─────────────────────────────────────────────────

interface CalendarGridProps {
  viewYear: number;
  viewMonth: number;
  onViewChange: (year: number, month: number) => void;
  selectedDate: string;
  endDate?: string;
  onSelectDate: (dateStr: string) => void;
  today: string;
  onToday: () => void;
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
  endDate,
  onSelectDate,
  today,
  onToday,
  rangeStart,
  rangeEnd,
  hoveredDate,
  onHover,
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

  // Compute effective range for highlighting (with hover preview)
  const rangeA = rangeStart ?? '';
  const rangeB = hoveredDate || rangeEnd || '';
  const effectiveStart = rangeA && rangeB ? (rangeA < rangeB ? rangeA : rangeB) : rangeA;
  const effectiveEnd = rangeA && rangeB ? (rangeA < rangeB ? rangeB : rangeA) : rangeB;

  const isInRange = useCallback((dateStr: string) => {
    if (!effectiveStart || !effectiveEnd) return false;
    return dateStr > effectiveStart && dateStr < effectiveEnd;
  }, [effectiveStart, effectiveEnd]);

  // Calendar grid — 7 columns, no week numbers
  return (
    <div>
      {/* Month/Year status label + Today + arrows */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-foreground">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <div className="flex items-center gap-1">
          <button
            className="rounded-md px-1.5 h-7 text-xs text-foreground-secondary hover:bg-foreground/5 transition-colors cursor-pointer"
            onClick={onToday}
          >
            Today
          </button>
          <button className="text-foreground-tertiary hover:text-foreground-secondary transition-colors w-7 h-7 flex items-center justify-center rounded-md cursor-pointer" onClick={prevMonth}>
            <ChevronLeft size={16} />
          </button>
          <button className="text-foreground-tertiary hover:text-foreground-secondary transition-colors w-7 h-7 flex items-center justify-center rounded-md cursor-pointer" onClick={nextMonth}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Day headers — 7 columns */}
      <div className="grid grid-cols-7 gap-0 mb-0.5">
        {DAY_HEADERS.map((d, i) => (
          <div key={i} className="text-center text-xs text-foreground-tertiary">
            {d}
          </div>
        ))}
      </div>

      {/* Weeks — 7 columns, no week numbers */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 gap-0">
          {week.map((cell, ci) => {
            const isToday = cell.dateStr === today;
            const isSelected = cell.dateStr === selectedDate;
            const hasRange = !!effectiveStart && !!effectiveEnd && effectiveStart !== effectiveEnd;
            const isEnd = cell.dateStr === effectiveEnd && hasRange;
            const isStart = cell.dateStr === effectiveStart && hasRange;
            const inRange = isInRange(cell.dateStr);
            // Non-current month dates: not clickable in single mode (like Notion)
            const isOverflow = !cell.isCurrentMonth;
            const isRangeActive = !!rangeStart;
            const disabled = isOverflow && !isRangeActive && !inRange;

            // Full-width cells for continuous range band
            let cls = 'h-7 flex items-center justify-center text-sm transition-colors';

            if (isStart && isEnd) {
              // Same day range: fully rounded
              cls += ' bg-primary text-primary-foreground font-medium rounded-md';
            } else if (isStart) {
              // Range start: filled blue, rounded left only (right connects to range)
              cls += ' bg-primary text-primary-foreground font-medium rounded-l-md';
            } else if (isEnd) {
              // Range end: filled blue, rounded right only
              cls += ' bg-primary text-primary-foreground font-medium rounded-r-md';
            } else if (isSelected) {
              // Single selected: fully rounded
              cls += ' bg-primary text-primary-foreground font-medium rounded-md';
            } else if (inRange) {
              // Range middle: no rounding for continuous band
              cls += ' bg-primary-muted';
              // Round edges at row boundaries for clean look
              if (ci === 0) cls += ' rounded-l-md';
              if (ci === 6) cls += ' rounded-r-md';
            } else if (isToday) {
              cls += ' ring-1 ring-primary/30 font-medium rounded-md';
            } else {
              cls += ' rounded-md';
              if (!disabled) cls += ' hover:bg-foreground/5';
            }

            if (disabled) {
              cls += ' text-foreground-tertiary opacity-50 cursor-not-allowed';
            } else if (isOverflow && !isSelected && !isStart && !isEnd && !inRange) {
              cls += ' text-foreground-tertiary cursor-pointer';
            } else if (!isSelected && !isStart && !isEnd) {
              cls += ' cursor-pointer';
            } else {
              cls += ' cursor-pointer';
            }

            return (
              <button
                key={cell.dateStr}
                className={cls}
                onClick={() => !disabled && onSelectDate(cell.dateStr)}
                onMouseEnter={() => !disabled && onHover?.(cell.dateStr)}
                onMouseLeave={() => onHover?.('')}
                disabled={disabled}
              >
                {cell.day}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Format for display (exported for FieldValueOutliner) ────────

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

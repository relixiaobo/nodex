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
 *  YYYY-MM-DD | YYYY-MM-DDTHH:MM | YYYY-MM-DD/YYYY-MM-DD | YYYY-MM-DDTHH:MM/YYYY-MM-DDTHH:MM
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from '../../lib/icons.js';
import { FIELD_OVERLAY_Z_INDEX } from './field-layout.js';
import { t } from '../../i18n/strings.js';

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

  // Position calculation
  const [positionConfig, setPositionConfig] = useState<{ bottom: string, mt: string } | { top: string, mt: string }>({ top: '100%', mt: '0.25rem' });

  // Compute if we should render upwards (to avoid bottom overflow)
  useEffect(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const parentRect = containerRef.current.parentElement?.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      // If expanding down goes past viewport, but expanding up has enough room
      if (rect.bottom > viewportHeight && parentRect && parentRect.top > rect.height) {
        setPositionConfig({ bottom: '100%', mt: '-0.25rem' });
      }
    }
  }, [includeEnd, includeTime]); // Re-calculate when contents might change height

  // Close on click outside
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
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
      className={`absolute isolate left-0 w-[244px] overflow-hidden rounded-lg bg-background shadow-paper p-3 ${'bottom' in positionConfig ? 'mb-1' : 'mt-1'
        }`}
      style={{ zIndex: FIELD_OVERLAY_Z_INDEX, ...positionConfig }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* ─── Top date input field(s) ─── */}
      <div className="mb-2 space-y-1">
        {/* Start date input */}
        <DateInputField
          dateStr={selectedDate}
          timeStr={includeTime ? selectedTime : ''}
          placeholder={t('datePicker.datePlaceholder')}
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
            placeholder={t('datePicker.datePlaceholder')}
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
      <div className="border-t border-border mt-3 pt-2 space-y-0.5">
        <SettingRow label={t('datePicker.settingEndDate')} checked={includeEnd} onChange={toggleEnd} />
        <SettingRow label={t('datePicker.settingIncludeTime')} checked={includeTime} onChange={toggleTime} />
      </div>

      {/* ─── Clear ─── */}
      {selectedDate && (
        <div className="mt-2 pt-2 border-t border-border">
          <button
            className="text-sm text-foreground-secondary hover:text-destructive transition-colors cursor-pointer h-7 flex items-center"
            onClick={handleClearDate}
          >
            {t('datePicker.clear')}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── DateInputField ──────────────────────────────────────────────

/** Build per-character display array: always 10 chars, typed vs template. */
function buildDisplayChars(digits: string): { char: string; typed: boolean }[] {
  const TEMPLATE = 'YYYY/MM/DD';
  const chars: { char: string; typed: boolean }[] = [];
  let di = 0;
  for (let ti = 0; ti < TEMPLATE.length; ti++) {
    if (TEMPLATE[ti] === '/') {
      // Separator: typed when its preceding digit group is complete
      const threshold = ti === 4 ? 4 : 6;
      chars.push({ char: '/', typed: digits.length >= threshold });
    } else {
      if (di < digits.length) {
        chars.push({ char: digits[di], typed: true });
        di++;
      } else {
        chars.push({ char: TEMPLATE[ti], typed: false });
      }
    }
  }
  return chars;
}

/** Convert raw digits (up to 8) to YYYY-MM-DD date string, or null if invalid/incomplete. */
function digitsToDateStr(digits: string): string | null {
  if (digits.length !== 8) return null;
  const formatted = `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6, 8)}`;
  return parseInputDate(formatted);
}

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
  const [digits, setDigits] = useState('');
  const [allSelected, setAllSelected] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = useCallback(() => {
    onClick();
    if (onDateChange) {
      setEditing(true);
      if (dateStr) {
        setDigits(dateStr.replace(/\D/g, '')); // "2026-03-15" → "20260315"
        setAllSelected(true);
      } else {
        setDigits('');
        setAllSelected(false);
      }
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [dateStr, onClick, onDateChange]);

  const commitEdit = useCallback(() => {
    setEditing(false);
    const parsed = digitsToDateStr(digits);
    if (parsed && parsed !== dateStr) {
      onDateChange?.(parsed);
    }
  }, [digits, dateStr, onDateChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditing(false);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      if (allSelected) {
        setDigits('');
        setAllSelected(false);
      } else {
        setDigits(d => d.slice(0, -1));
      }
    } else if (/^\d$/.test(e.key)) {
      e.preventDefault();
      if (allSelected) {
        setDigits(e.key);
        setAllSelected(false);
      } else if (digits.length < 8) {
        setDigits(d => d + e.key);
      }
    }
  }, [allSelected, digits, commitEdit]);

  // Build per-character display (always 10 chars — zero layout shift)
  const displayChars = useMemo(() => buildDisplayChars(digits), [digits]);
  const cursorIdx = allSelected ? -1 : displayChars.findIndex(c => !c.typed);
  const fullText = displayChars.map(c => c.char).join('');

  return (
    <div
      className={`flex w-full items-center rounded-md border text-sm transition-colors ${active && showRing
        ? 'border-primary bg-primary/5'
        : active && !showRing
          ? 'border-border bg-transparent'
          : 'border-border bg-transparent hover:border-foreground/20'
        }`}
      onClick={!editing ? startEditing : onClick}
    >
      {/* Date part — masked input */}
      {editing ? (
        <div
          className="relative flex-1 min-w-0 px-2.5 py-1.5 cursor-text"
          onClick={(e) => { e.stopPropagation(); inputRef.current?.focus(); }}
        >
          {/* Hidden input for keyboard capture */}
          <input
            ref={inputRef}
            className="absolute w-0 h-0 overflow-hidden opacity-0"
            onKeyDown={handleKeyDown}
            onBlur={commitEdit}
            readOnly
          />
          {/* Visual masked display — always 10 chars, no layout shift */}
          <span className="text-sm select-none">
            {allSelected ? (
              <span className="bg-primary/20 text-foreground rounded-sm">{fullText}</span>
            ) : (
              displayChars.map((c, i) => (
                <span
                  key={i}
                  className={`${c.typed ? 'text-foreground' : 'text-foreground-tertiary'}${i === cursorIdx ? ' relative' : ''}`}
                >
                  {i === cursorIdx && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[1.5px] h-[14px] bg-foreground animate-pulse pointer-events-none" />
                  )}
                  {c.char}
                </span>
              ))
            )}
          </span>
        </div>
      ) : (
        <span className={`flex-1 px-2.5 py-1.5 cursor-pointer ${dateStr ? 'text-foreground' : 'text-foreground-tertiary'}`}>
          {dateStr ? formatInputDate(dateStr) : placeholder}
        </span>
      )}
      {/* Time part — separated by divider */}
      {timeStr && onTimeChange ? (
        <>
          <div className="w-px h-3.5 bg-border-emphasis mx-1.5" />
          <div
            className="pr-1 py-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <InlineTimeInput value={timeStr} onChange={onTimeChange} />
          </div>
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
  const hoursRef = useRef<HTMLInputElement>(null);
  const minutesRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const p = parse24to12(value);
    setHours(p.hours12);
    setMinutes(p.minutes);
    setPeriod(p.period);
  }, [value]);

  const commit = useCallback((h: string, m: string, p: 'AM' | 'PM') => {
    const hNum = parseInt(h, 10);
    const mNum = parseInt(m, 10);
    if (isNaN(hNum) || isNaN(mNum)) return;
    onChange(build24from12(String(hNum).padStart(2, '0'), String(mNum).padStart(2, '0'), p));
  }, [onChange]);

  // Block all non-digit input via onKeyDown; manage value ourselves
  const makeKeyHandler = useCallback((
    field: 'hours' | 'minutes',
    val: string,
    setVal: (v: string) => void,
    max: number,
    min: number,
  ) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow navigation keys
    if (['Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;

    e.preventDefault(); // block all other default input

    if (e.key === 'Backspace') {
      if (val.length > 0) {
        const next = val.slice(0, -1);
        setVal(next);
      }
      return;
    }

    if (!/^\d$/.test(e.key)) return; // only digits allowed

    // Build candidate value
    const candidate = val.length >= 2 ? e.key : val + e.key; // replace if already 2 digits
    const num = parseInt(candidate, 10);

    // Validate range
    if (num > max) return; // reject out-of-range
    if (candidate.length === 2 && num < min) return; // reject completed value below min

    setVal(candidate);

    // Auto-commit and advance when 2 digits entered
    if (candidate.length === 2) {
      const padded = candidate.padStart(2, '0');
      if (field === 'hours') {
        commit(padded, minutes.length === 2 ? minutes : '00', period);
        // Auto-advance to minutes
        requestAnimationFrame(() => { minutesRef.current?.focus(); minutesRef.current?.select(); });
      } else {
        commit(hours.length === 2 ? hours : '12', padded, period);
      }
    }
  }, [hours, minutes, period, commit]);

  const handleHoursKey = useMemo(
    () => makeKeyHandler('hours', hours, setHours, 12, 1),
    [makeKeyHandler, hours],
  );
  const handleMinutesKey = useMemo(
    () => makeKeyHandler('minutes', minutes, setMinutes, 59, 0),
    [makeKeyHandler, minutes],
  );

  const handleHoursBlur = useCallback(() => {
    if (hours.length === 1) {
      const padded = hours.padStart(2, '0');
      const num = parseInt(padded, 10);
      if (num >= 1 && num <= 12) {
        setHours(padded);
        commit(padded, minutes.length === 2 ? minutes : '00', period);
      } else {
        setHours('12'); // fallback
        commit('12', minutes.length === 2 ? minutes : '00', period);
      }
    } else if (hours.length === 0) {
      // Restore to parsed default
      setHours(parsed.hours12);
    }
  }, [hours, minutes, period, parsed.hours12, commit]);

  const handleMinutesBlur = useCallback(() => {
    if (minutes.length === 1) {
      const padded = minutes.padStart(2, '0');
      setMinutes(padded);
      commit(hours.length === 2 ? hours : '12', padded, period);
    } else if (minutes.length === 0) {
      setMinutes(parsed.minutes);
    }
  }, [hours, minutes, period, parsed.minutes, commit]);

  const togglePeriod = useCallback(() => {
    const newPeriod = period === 'AM' ? 'PM' : 'AM';
    setPeriod(newPeriod);
    const h = hours.length === 2 ? hours : '12';
    const m = minutes.length === 2 ? minutes : '00';
    commit(h, m, newPeriod);
  }, [hours, minutes, period, commit]);

  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  }, []);

  // Display: show value or placeholder
  const hoursDisplay = hours || '--';
  const minutesDisplay = minutes || '--';

  return (
    <span className="inline-flex items-center text-sm text-foreground">
      <input
        ref={hoursRef}
        type="text"
        inputMode="numeric"
        value={hoursDisplay}
        onChange={() => { }} // controlled via onKeyDown
        onKeyDown={handleHoursKey}
        onFocus={handleFocus}
        onBlur={handleHoursBlur}
        className={`w-[18px] text-right bg-transparent outline-none text-sm ${hours ? '' : 'text-foreground-tertiary'}`}
      />
      <span className="text-foreground-tertiary">:</span>
      <input
        ref={minutesRef}
        type="text"
        inputMode="numeric"
        value={minutesDisplay}
        onChange={() => { }} // controlled via onKeyDown
        onKeyDown={handleMinutesKey}
        onFocus={handleFocus}
        onBlur={handleMinutesBlur}
        className={`w-[18px] bg-transparent outline-none text-sm ${minutes ? '' : 'text-foreground-tertiary'}`}
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
        className={`relative w-8 h-[18px] rounded-full transition-colors cursor-pointer ${checked ? 'bg-primary' : 'bg-foreground/15'
          }`}
        onClick={onChange}
      >
        <span
          className={`absolute top-[2px] left-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-[14px]' : 'translate-x-0'
            }`}
        />
      </button>
    </div>
  );
}

// ─── CalendarGrid ─────────────────────────────────────────────────

export interface CalendarGridProps {
  viewYear: number;
  viewMonth: number;
  onViewChange: (year: number, month: number) => void;
  selectedDate: string;
  endDate?: string;
  onSelectDate: (dateStr: string) => void;
  today: string;
  /** If provided, shows a "Today" button in the header. Omit to hide. */
  onToday?: () => void;
  rangeStart?: string;
  rangeEnd?: string;
  hoveredDate?: string;
  onHover?: (dateStr: string) => void;
  /** Optional: date → note count for heatmap display */
  noteCountMap?: Map<string, number>;
}

// Primary Green #5E8E65, Secondary Amber #E1A15E
const PRIMARY_SOLID = 'rgba(94,142,101,0.75)';
const SECONDARY_SOLID = 'rgba(225,161,94,0.75)';
const NEUTRAL_BORDER = 'rgba(0,0,0,0.18)';

/** Map note count → green heatmap background (rgba string) */
function heatmapBg(count: number | undefined): string {
  if (!count || count <= 0) return '';
  // Primary Green #5E8E65 at different opacities
  if (count <= 2) return 'rgba(94,142,101,0.15)';
  if (count <= 4) return 'rgba(94,142,101,0.25)';
  return 'rgba(94,142,101,0.40)';
}

/** Map note count → amber "today" background (rgba string) */
function todayBg(count: number | undefined): string {
  // Always show at least a light amber for today
  if (!count || count <= 0) return 'rgba(225,161,94,0.15)';
  if (count <= 2) return 'rgba(225,161,94,0.25)';
  if (count <= 4) return 'rgba(225,161,94,0.35)';
  return 'rgba(225,161,94,0.50)';
}

/** Get inset border color for selected state — matches cell's theme color */
function selectedBorderColor(isToday: boolean, hasHeatmap: boolean): string {
  if (isToday) return SECONDARY_SOLID;
  if (hasHeatmap) return PRIMARY_SOLID;
  return NEUTRAL_BORDER;
}

export function CalendarGrid({
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
  noteCountMap,
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
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-foreground pl-1">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <div className="inline-flex items-center gap-0.5">
          <button
            className="flex h-6 w-6 items-center justify-center rounded-full text-foreground-tertiary hover:bg-foreground/4 hover:text-foreground transition-all cursor-pointer"
            onClick={prevMonth}
          >
            <ChevronLeft size={13} strokeWidth={1.5} />
          </button>
          {onToday && (
            <button
              className="flex h-6 items-center px-1.5 rounded-full font-medium text-[11px] text-foreground-tertiary hover:bg-foreground/4 hover:text-foreground transition-all cursor-pointer"
              onClick={onToday}
            >
              {t('datePicker.today')}
            </button>
          )}
          <button
            className="flex h-6 w-6 items-center justify-center rounded-full text-foreground-tertiary hover:bg-foreground/4 hover:text-foreground transition-all cursor-pointer"
            onClick={nextMonth}
          >
            <ChevronRight size={13} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Unified 7-column grid: headers + all day cells — equal gap in both directions */}
      <div className="grid grid-cols-7 gap-1 w-fit mx-auto">
        {/* Day headers — weekend columns (Sun=0, Sat=6) use muted red */}
        {DAY_HEADERS.map((d, i) => (
          <div
            key={`h${i}`}
            className={`h-7 w-7 flex items-center justify-center text-xs font-medium ${i === 0 || i === 6 ? 'text-destructive/50' : 'text-foreground-tertiary'
              }`}
          >
            {d}
          </div>
        ))}

        {/* Day cells — flattened from weeks */}
        {weeks.flat().map((cell, idx) => {
          const ci = idx % 7;
          const isToday = cell.dateStr === today;
          const isSelected = cell.dateStr === selectedDate;
          const hasRange = !!effectiveStart && !!effectiveEnd && effectiveStart !== effectiveEnd;
          const isEnd = cell.dateStr === effectiveEnd && hasRange;
          const isStart = cell.dateStr === effectiveStart && hasRange;
          const inRange = isInRange(cell.dateStr);
          const isOverflow = !cell.isCurrentMonth;

          // Note count for this cell
          const noteCount = noteCountMap?.get(cell.dateStr);
          const cellHeat = cell.isCurrentMonth ? heatmapBg(noteCount) : '';

          // Build inline style for backgrounds
          const style: React.CSSProperties = {};

          let cls = 'h-7 w-7 flex items-center justify-center text-[13px] transition-colors';

          if (isStart && isEnd) {
            cls += ' font-medium rounded-full bg-foreground text-background shadow-sm';
          } else if (isStart) {
            cls += ' bg-foreground text-background font-medium rounded-l-full';
          } else if (isEnd) {
            cls += ' bg-foreground text-background font-medium rounded-r-full';
          } else if (isSelected) {
            cls += ' font-medium rounded-full bg-foreground text-background shadow-sm';
          } else if (inRange) {
            cls += ' bg-foreground/10';
            if (ci === 0) cls += ' rounded-l-full';
            if (ci === 6) cls += ' rounded-r-full';
          } else if (isToday) {
            cls += ' font-medium rounded-full text-secondary-hover';
            style.backgroundColor = todayBg(noteCount);
          } else {
            cls += ' rounded-full';
            if (cellHeat) style.backgroundColor = cellHeat;
            cls += ' hover:bg-foreground/4';
          }

          if (isOverflow && !isSelected && !isStart && !isEnd && !inRange) {
            cls += ' text-foreground-tertiary cursor-pointer';
          } else {
            cls += ' cursor-pointer';
          }

          return (
            <button
              key={cell.dateStr}
              className={cls}
              style={style}
              onClick={() => onSelectDate(cell.dateStr)}
              onMouseEnter={() => onHover?.(cell.dateStr)}
              onMouseLeave={() => onHover?.('')}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
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

/**
 * Smart timestamp formatting.
 *
 * Rules (from recent to distant):
 * - < 30s      → "just now"
 * - < 60min    → "3 min ago"
 * - < 24h      → "2 hr ago"
 * - yesterday  → "Yesterday, 10:30 am"
 * - this year  → "Mar 3, 10:30 am"
 * - other year → "Mar 3, 2025, 10:30 am"
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const fmtThisYear = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const fmtOtherYear = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const fmtTimeOnly = new Intl.DateTimeFormat('en', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/**
 * Check if a date is calendar-yesterday relative to `now`.
 * Uses calendar day comparison, not "24 hours ago".
 */
function isYesterday(date: Date, nowDate: Date): boolean {
  const y = new Date(nowDate);
  y.setDate(y.getDate() - 1);
  return (
    date.getFullYear() === y.getFullYear() &&
    date.getMonth() === y.getMonth() &&
    date.getDate() === y.getDate()
  );
}

/**
 * Format a millisecond timestamp with smart relative/absolute rules.
 *
 * @param ms - Timestamp in milliseconds (e.g. `Date.now()`)
 * @param now - Current time in ms; defaults to `Date.now()`. Inject for testing.
 * @returns Formatted string, or `''` if ms is undefined/falsy.
 */
export function formatSmartTimestamp(ms: number | undefined, now?: number): string {
  if (!ms) return '';

  const currentMs = now ?? Date.now();
  const diff = currentMs - ms;
  const date = new Date(ms);
  const nowDate = new Date(currentMs);

  // Future timestamps or < 30s → "just now"
  if (diff < 30 * SECOND) return 'just now';

  // < 60 min → "N min ago"
  if (diff < 60 * MINUTE) {
    const mins = Math.floor(diff / MINUTE);
    return `${mins} min ago`;
  }

  // < 24h → "N hr ago"
  if (diff < 24 * HOUR) {
    const hrs = Math.floor(diff / HOUR);
    return `${hrs} hr ago`;
  }

  // Calendar yesterday → "Yesterday, 10:30 am"
  if (isYesterday(date, nowDate)) {
    return `Yesterday, ${fmtTimeOnly.format(date).toLowerCase()}`;
  }

  // Same year → "Mar 3, 10:30 am"
  if (date.getFullYear() === nowDate.getFullYear()) {
    return fmtThisYear.format(date).toLowerCase().replace(/,\s*/, ', ');
  }

  // Different year → "Mar 3, 2025, 10:30 am"
  return fmtOtherYear.format(date).toLowerCase().replace(/,\s*/g, ', ');
}

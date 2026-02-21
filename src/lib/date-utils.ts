/**
 * Date utility functions for the journal/calendar system.
 *
 * Pure functions, zero external dependencies (standard JS Date only).
 * ISO 8601 week rules: weeks start on Monday, Week 01 contains the year's first Thursday.
 */

/**
 * Get ISO 8601 week number for a given date.
 * Week starts on Monday; Week 01 contains the first Thursday of the year.
 * Note: Dec 29-31 can belong to next year's Week 01; Jan 1-3 can belong to previous year's last week.
 */
export function getISOWeekNumber(date: Date): { year: number; week: number } {
  // Copy date to avoid mutation
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Set to nearest Thursday: current date + 4 - current day (Mon=1, Sun=7)
  const dayOfWeek = d.getUTCDay() || 7; // Convert Sunday (0) to 7
  d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek);
  // Get first day of year
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  // Calculate full weeks to nearest Thursday
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Format a date as a day node name: "Sat, Feb 14"
 */
export function formatDayName(date: Date): string {
  const day = DAY_NAMES[date.getDay()];
  const month = MONTH_NAMES[date.getMonth()];
  const dateNum = date.getDate();
  return `${day}, ${month} ${dateNum}`;
}

/**
 * Format a week number as a week node name: "Week 07"
 */
export function formatWeekName(week: number): string {
  return `Week ${String(week).padStart(2, '0')}`;
}

/**
 * Format a year as a year node name: "2026"
 */
export function formatYearName(year: number): string {
  return String(year);
}

/**
 * Parse a day node name back to a Date.
 * Expected format: "Sat, Feb 14" (or similar 3-char day + month abbreviation + number).
 * Requires the year because the name doesn't include it.
 * Returns null if the name doesn't match the expected format.
 */
export function parseDayNodeName(name: string, year: number): Date | null {
  // Match "Day, Mon DD" pattern
  const match = name.match(/^[A-Z][a-z]{2},\s+([A-Z][a-z]{2})\s+(\d{1,2})$/);
  if (!match) return null;
  const monthStr = match[1];
  const day = parseInt(match[2], 10);
  const monthIdx = MONTH_NAMES.indexOf(monthStr);
  if (monthIdx === -1 || isNaN(day)) return null;
  const date = new Date(year, monthIdx, day);
  // Validate the date is real (e.g., Feb 31 would roll over)
  if (date.getMonth() !== monthIdx || date.getDate() !== day) return null;
  return date;
}

/**
 * Parse a week node name back to a week number.
 * Expected format: "Week 07"
 */
export function parseWeekNodeName(name: string): number | null {
  const match = name.match(/^Week\s+(\d{1,2})$/);
  if (!match) return null;
  const week = parseInt(match[1], 10);
  if (week < 1 || week > 53) return null;
  return week;
}

/**
 * Parse a year node name back to a year number.
 * Expected format: "2026"
 */
export function parseYearNodeName(name: string): number | null {
  const match = name.match(/^(\d{4})$/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

/**
 * Get a date offset by N days from the given date.
 */
export function getAdjacentDay(date: Date, offset: number): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
  return result;
}

/**
 * Check if the given date is today (local timezone).
 */
export function isToday(date: Date): boolean {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

/**
 * Extract the numeric value for sorting from a node name.
 * Used for binary-search insertion in descending order.
 *
 * - Year node "2026" → 2026
 * - Week node "Week 07" → 7
 * - Day node "Sat, Feb 14" → month*100 + day (e.g., 214 for Feb 14)
 *   This works for descending sort within a single year.
 */
export function extractSortValue(name: string): number {
  // Year
  const yearVal = parseYearNodeName(name);
  if (yearVal !== null) return yearVal;

  // Week
  const weekVal = parseWeekNodeName(name);
  if (weekVal !== null) return weekVal;

  // Day: extract month index * 100 + day for within-year sorting
  const dayMatch = name.match(/^[A-Z][a-z]{2},\s+([A-Z][a-z]{2})\s+(\d{1,2})$/);
  if (dayMatch) {
    const monthIdx = MONTH_NAMES.indexOf(dayMatch[1]);
    const day = parseInt(dayMatch[2], 10);
    if (monthIdx !== -1 && !isNaN(day)) {
      return (monthIdx + 1) * 100 + day;
    }
  }

  return 0;
}

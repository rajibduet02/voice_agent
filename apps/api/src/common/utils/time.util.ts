import { DateTime } from 'luxon';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Application day-of-week convention (used by AvailabilityRule.dayOfWeek):
 * 0 = Sunday, 1 = Monday, 2 = Tuesday, 3 = Wednesday,
 * 4 = Thursday, 5 = Friday, 6 = Saturday
 *
 * This matches JavaScript Date.getDay(), NOT Luxon/ISO (Mon=1 … Sun=7).
 */
export const APPLICATION_WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export function isValidHhMm(value: string): boolean {
  return TIME_RE.test(value);
}

export function parseHhMm(value: string): { hours: number; minutes: number } {
  if (!isValidHhMm(value)) {
    throw new Error(`Invalid HH:mm time: ${value}`);
  }
  const [hours, minutes] = value.split(':').map(Number);
  return { hours, minutes };
}

export function hhMmToMinutes(value: string): number {
  const { hours, minutes } = parseHhMm(value);
  return hours * 60 + minutes;
}

export function isValidTimezone(timeZone: string): boolean {
  return DateTime.now().setZone(timeZone).isValid;
}

/**
 * Convert a clinic-local calendar date + HH:mm in an IANA timezone to a UTC Date.
 */
export function zonedLocalToUtc(
  dateYmd: string,
  timeHhMm: string,
  timeZone: string,
): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
    throw new Error(`Invalid local date: ${dateYmd}`);
  }
  parseHhMm(timeHhMm);
  if (!isValidTimezone(timeZone)) {
    throw new Error(`Invalid timezone: ${timeZone}`);
  }

  const dt = DateTime.fromISO(`${dateYmd}T${timeHhMm}:00`, { zone: timeZone });
  if (!dt.isValid) {
    throw new Error(`Invalid local datetime: ${dateYmd} ${timeHhMm} ${timeZone}`);
  }
  return dt.toUTC().toJSDate();
}

/** Stable machine-readable local timestamp: YYYY-MM-DDTHH:mm:ss */
export function formatInTimeZone(date: Date, timeZone: string): string {
  const dt = DateTime.fromJSDate(date, { zone: 'utc' }).setZone(timeZone);
  if (!dt.isValid) {
    throw new Error(`Invalid timezone: ${timeZone}`);
  }
  return dt.toFormat("yyyy-MM-dd'T'HH:mm:ss");
}

export function getDatePartsInTimeZone(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number } {
  const dt = DateTime.fromJSDate(date, { zone: 'utc' }).setZone(timeZone);
  return {
    year: dt.year,
    month: dt.month,
    day: dt.day,
    hour: dt.hour,
    minute: dt.minute,
  };
}

export function toYmdInTimeZone(date: Date, timeZone: string): string {
  const { year, month, day } = getDatePartsInTimeZone(date, timeZone);
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
    .toString()
    .padStart(2, '0')}`;
}

/**
 * Prisma `@db.Date` values are UTC midnight for the calendar day.
 * Convert to YYYY-MM-DD without timezone shifting.
 */
export function prismaDateOnlyToYmd(date: Date): string {
  return DateTime.fromJSDate(date, { zone: 'utc' }).toISODate() ?? date.toISOString().slice(0, 10);
}

/**
 * Application weekday for a clinic-local YYYY-MM-DD date.
 * Converts Luxon ISO weekday (Mon=1…Sun=7) → application (Sun=0…Sat=6).
 */
export function getApplicationDayOfWeek(localDate: string, timezone: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    throw new Error(`Invalid local date: ${localDate}`);
  }
  const dt = DateTime.fromISO(localDate, { zone: timezone });
  if (!dt.isValid) {
    throw new Error(`Invalid local date/timezone: ${localDate} ${timezone}`);
  }
  // Luxon: 1=Monday … 7=Sunday
  return dt.weekday === 7 ? 0 : dt.weekday;
}

/** @deprecated Prefer getApplicationDayOfWeek — kept as a clear alias. */
export function dayOfWeekInTimeZone(dateYmd: string, timeZone: string): number {
  return getApplicationDayOfWeek(dateYmd, timeZone);
}

export function applicationWeekdayName(dayOfWeek: number): string {
  return APPLICATION_WEEKDAY_NAMES[dayOfWeek] ?? `Unknown(${dayOfWeek})`;
}

/**
 * Normalize a tool/API date input to clinic-local YYYY-MM-DD.
 * Accepts YYYY-MM-DD or an ISO timestamp (converted in the given timezone).
 */
export function normalizeClinicDateInput(
  value: string,
  timeZone: string,
): string | null {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const dt = DateTime.fromISO(trimmed, { zone: timeZone });
    if (!dt.isValid) {
      return null;
    }
    return trimmed;
  }

  const iso = DateTime.fromISO(trimmed, { setZone: true });
  if (iso.isValid) {
    return iso.setZone(timeZone).toISODate();
  }

  const js = Date.parse(trimmed);
  if (!Number.isNaN(js)) {
    return toYmdInTimeZone(new Date(js), timeZone);
  }

  return null;
}

export function formatDisplayDate(dateYmd: string, timeZone: string): string {
  const dt = DateTime.fromISO(dateYmd, { zone: timeZone });
  return dt.isValid ? dt.toFormat('MMMM d, yyyy') : dateYmd;
}

export function formatDisplayTime(date: Date, timeZone: string): string {
  return DateTime.fromJSDate(date, { zone: 'utc' })
    .setZone(timeZone)
    .toFormat('h:mm a');
}

export function rangesOverlap(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
): boolean {
  return startA < endB && startB < endA;
}

export function subtractTimeWindow(
  windows: Array<{ startTime: string; endTime: string; timezone: string }>,
  blockStart: string,
  blockEnd: string,
): Array<{ startTime: string; endTime: string; timezone: string }> {
  if (!isValidHhMm(blockStart) || !isValidHhMm(blockEnd)) {
    return windows;
  }
  const blockStartMin = hhMmToMinutes(blockStart);
  const blockEndMin = hhMmToMinutes(blockEnd);
  if (blockStartMin >= blockEndMin) {
    return windows;
  }

  const result: Array<{ startTime: string; endTime: string; timezone: string }> = [];
  for (const window of windows) {
    const start = hhMmToMinutes(window.startTime);
    const end = hhMmToMinutes(window.endTime);
    if (blockEndMin <= start || blockStartMin >= end) {
      result.push(window);
      continue;
    }
    if (start < blockStartMin) {
      result.push({
        startTime: minutesToHhMm(start),
        endTime: minutesToHhMm(blockStartMin),
        timezone: window.timezone,
      });
    }
    if (end > blockEndMin) {
      result.push({
        startTime: minutesToHhMm(blockEndMin),
        endTime: minutesToHhMm(end),
        timezone: window.timezone,
      });
    }
  }
  return result;
}

function minutesToHhMm(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

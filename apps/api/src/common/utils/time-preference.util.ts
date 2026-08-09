export type TimePreference = 'morning' | 'afternoon' | 'evening' | 'any';

const MORNING_ALIASES = new Set(['morning', 'before noon', 'before-noon', 'am']);
const AFTERNOON_ALIASES = new Set([
  'afternoon',
  'after lunch',
  'after-lunch',
  'after noon',
  'pm',
]);
const EVENING_ALIASES = new Set(['evening', 'late afternoon', 'late-afternoon', 'night']);
const ANY_ALIASES = new Set([
  'any',
  'anytime',
  'anything',
  'no preference',
  'no-preference',
  'whenever',
  'all day',
  'all-day',
]);

/**
 * CarePoint local-time preference windows (hour, exclusive end):
 * - morning: 05:00–11:59
 * - afternoon: 12:00–16:59
 * - evening: 17:00–21:59
 * - any: no filter
 */
export function normalizeTimePreference(raw?: string | null): TimePreference {
  if (!raw) {
    return 'any';
  }
  const value = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (MORNING_ALIASES.has(value)) return 'morning';
  if (AFTERNOON_ALIASES.has(value)) return 'afternoon';
  if (EVENING_ALIASES.has(value)) return 'evening';
  if (ANY_ALIASES.has(value)) return 'any';
  return 'any';
}

export function matchesTimePreferenceHour(
  hour: number,
  preference: TimePreference,
): boolean {
  if (preference === 'any') {
    return true;
  }
  if (!Number.isFinite(hour)) {
    return true;
  }
  if (preference === 'morning') {
    return hour >= 5 && hour < 12;
  }
  if (preference === 'afternoon') {
    return hour >= 12 && hour < 17;
  }
  return hour >= 17 && hour < 22;
}

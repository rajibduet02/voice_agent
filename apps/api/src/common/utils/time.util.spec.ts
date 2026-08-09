import {
  dayOfWeekInTimeZone,
  formatDisplayTime,
  formatInTimeZone,
  getApplicationDayOfWeek,
  hhMmToMinutes,
  isValidHhMm,
  normalizeClinicDateInput,
  rangesOverlap,
  subtractTimeWindow,
  zonedLocalToUtc,
} from './time.util';

describe('time.util', () => {
  it('validates HH:mm', () => {
    expect(isValidHhMm('09:00')).toBe(true);
    expect(isValidHhMm('17:30')).toBe(true);
    expect(isValidHhMm('9:00')).toBe(false);
    expect(isValidHhMm('24:00')).toBe(false);
  });

  it('converts HH:mm to minutes', () => {
    expect(hhMmToMinutes('09:00')).toBe(540);
    expect(hhMmToMinutes('14:30')).toBe(870);
  });

  it('converts Asia/Dhaka local time to UTC without host TZ dependency', () => {
    const utc = zonedLocalToUtc('2026-08-12', '09:00', 'Asia/Dhaka');
    expect(utc.toISOString()).toBe('2026-08-12T03:00:00.000Z');
  });

  it('resolves 2026-08-09 to Sunday=0 and 2026-08-10 to Monday=1 in Asia/Dhaka', () => {
    expect(getApplicationDayOfWeek('2026-08-09', 'Asia/Dhaka')).toBe(0);
    expect(getApplicationDayOfWeek('2026-08-10', 'Asia/Dhaka')).toBe(1);
    expect(dayOfWeekInTimeZone('2026-08-12', 'Asia/Dhaka')).toBe(3);
  });

  it('does not use UTC-shifted weekday for clinic-local dates', () => {
    // 2026-08-09 00:00 UTC is still Sunday in Dhaka (+6 → 06:00 Sunday).
    expect(getApplicationDayOfWeek('2026-08-09', 'Asia/Dhaka')).toBe(0);
    const localStart = zonedLocalToUtc('2026-08-09', '00:00', 'Asia/Dhaka');
    expect(localStart.toISOString()).toBe('2026-08-08T18:00:00.000Z');
    expect(formatInTimeZone(localStart, 'Asia/Dhaka').startsWith('2026-08-09')).toBe(true);
  });

  it('normalizes ISO timestamps to clinic-local YYYY-MM-DD', () => {
    expect(normalizeClinicDateInput('2026-08-09', 'Asia/Dhaka')).toBe('2026-08-09');
    expect(
      normalizeClinicDateInput('2026-08-08T18:00:00.000Z', 'Asia/Dhaka'),
    ).toBe('2026-08-09');
  });

  it('formats display times in the requested timezone', () => {
    const utc = zonedLocalToUtc('2026-08-09', '09:00', 'Asia/Dhaka');
    expect(formatDisplayTime(utc, 'Asia/Dhaka')).toMatch(/9:00/i);
  });

  it('detects overlapping ranges and boundary non-overlaps', () => {
    const aStart = new Date('2026-08-12T03:00:00.000Z');
    const aEnd = new Date('2026-08-12T03:30:00.000Z');
    const bStart = new Date('2026-08-12T03:15:00.000Z');
    const bEnd = new Date('2026-08-12T03:45:00.000Z');
    expect(rangesOverlap(aStart, aEnd, bStart, bEnd)).toBe(true);
    expect(
      rangesOverlap(
        aStart,
        aEnd,
        new Date('2026-08-12T03:30:00.000Z'),
        new Date('2026-08-12T04:00:00.000Z'),
      ),
    ).toBe(false);
  });

  it('subtracts partial unavailable windows', () => {
    const result = subtractTimeWindow(
      [{ startTime: '09:00', endTime: '13:00', timezone: 'Asia/Dhaka' }],
      '11:00',
      '12:00',
    );
    expect(result).toEqual([
      { startTime: '09:00', endTime: '11:00', timezone: 'Asia/Dhaka' },
      { startTime: '12:00', endTime: '13:00', timezone: 'Asia/Dhaka' },
    ]);
  });
});

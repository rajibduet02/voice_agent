import { ExceptionType } from '@prisma/client';
import { AvailabilityService } from './availability.service';
import { getApplicationDayOfWeek } from '../common/utils/time.util';

describe('AvailabilityService window resolution', () => {
  const service = new AvailabilityService({} as never);

  const baseRule = {
    dayOfWeek: 0,
    startTime: '09:00',
    endTime: '13:00',
    timezone: 'Asia/Dhaka',
    locationId: 'loc-1',
    effectiveFrom: null,
    effectiveUntil: null,
    isActive: true,
  };

  it('loads Sunday and Monday rule windows', () => {
    expect(getApplicationDayOfWeek('2026-08-09', 'Asia/Dhaka')).toBe(0);
    expect(getApplicationDayOfWeek('2026-08-10', 'Asia/Dhaka')).toBe(1);

    const sunday = service.resolveWindowsForDay(
      [baseRule, { ...baseRule, startTime: '14:00', endTime: '17:00' }],
      [],
      '2026-08-09',
      0,
      'loc-1',
      'Asia/Dhaka',
    );
    expect(sunday).toHaveLength(2);

    const monday = service.resolveWindowsForDay(
      [
        { ...baseRule, dayOfWeek: 1 },
        { ...baseRule, dayOfWeek: 1, startTime: '14:00', endTime: '17:00' },
      ],
      [],
      '2026-08-10',
      1,
      'loc-1',
      'Asia/Dhaka',
    );
    expect(monday).toHaveLength(2);
  });

  it('accepts generic locationId=null rules and exact location rules', () => {
    const generic = service.resolveWindowsForDay(
      [{ ...baseRule, locationId: null }],
      [],
      '2026-08-09',
      0,
      'loc-1',
      'Asia/Dhaka',
    );
    expect(generic).toEqual([
      { startTime: '09:00', endTime: '13:00', timezone: 'Asia/Dhaka' },
    ]);

    const exact = service.resolveWindowsForDay(
      [baseRule],
      [],
      '2026-08-09',
      0,
      'loc-1',
      'Asia/Dhaka',
    );
    expect(exact).toHaveLength(1);
  });

  it('prefers exact location rules over generic duplicates', () => {
    const windows = service.resolveWindowsForDay(
      [
        { ...baseRule, locationId: null, startTime: '08:00', endTime: '10:00' },
        { ...baseRule, locationId: 'loc-1', startTime: '09:00', endTime: '13:00' },
      ],
      [],
      '2026-08-09',
      0,
      'loc-1',
      'Asia/Dhaka',
    );
    expect(windows).toEqual([
      { startTime: '09:00', endTime: '13:00', timezone: 'Asia/Dhaka' },
    ]);
  });

  it('returns no windows for full-day UNAVAILABLE exceptions', () => {
    const windows = service.resolveWindowsForDay(
      [baseRule],
      [
        {
          date: new Date('2026-08-09T00:00:00.000Z'),
          exceptionType: ExceptionType.UNAVAILABLE,
          startTime: null,
          endTime: null,
          locationId: 'loc-1',
        },
      ],
      '2026-08-09',
      0,
      'loc-1',
      'Asia/Dhaka',
    );
    expect(windows).toEqual([]);
  });

  it('keeps remaining hours for partial UNAVAILABLE exceptions', () => {
    const windows = service.resolveWindowsForDay(
      [baseRule],
      [
        {
          date: new Date('2026-08-09T00:00:00.000Z'),
          exceptionType: ExceptionType.UNAVAILABLE,
          startTime: '10:00',
          endTime: '11:00',
          locationId: null,
        },
      ],
      '2026-08-09',
      0,
      'loc-1',
      'Asia/Dhaka',
    );
    expect(windows).toEqual([
      { startTime: '09:00', endTime: '10:00', timezone: 'Asia/Dhaka' },
      { startTime: '11:00', endTime: '13:00', timezone: 'Asia/Dhaka' },
    ]);
  });

  it('prefers CUSTOM_HOURS exceptions over normal rules', () => {
    const windows = service.resolveWindowsForDay(
      [baseRule, { ...baseRule, startTime: '14:00', endTime: '17:00' }],
      [
        {
          date: new Date('2026-08-09T00:00:00.000Z'),
          exceptionType: ExceptionType.CUSTOM_HOURS,
          startTime: '10:00',
          endTime: '12:00',
          locationId: null,
        },
      ],
      '2026-08-09',
      0,
      'loc-1',
      'Asia/Dhaka',
    );
    expect(windows).toEqual([
      { startTime: '10:00', endTime: '12:00', timezone: 'Asia/Dhaka' },
    ]);
  });

  it('does not remove regular hours when no exception exists', () => {
    const windows = service.resolveWindowsForDay(
      [baseRule, { ...baseRule, startTime: '14:00', endTime: '17:00' }],
      [],
      '2026-08-09',
      0,
      'loc-1',
      'Asia/Dhaka',
    );
    expect(windows).toHaveLength(2);
  });

  it('resolves custom duration from provider service', () => {
    const duration = service.resolveDuration(
      { durationMinutes: 30, bufferBeforeMinutes: 5, bufferAfterMinutes: 10 },
      { customDurationMinutes: 45 },
    );
    expect(duration).toEqual({
      durationMinutes: 45,
      bufferBeforeMinutes: 5,
      bufferAfterMinutes: 10,
    });
  });
});

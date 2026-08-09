import { FixedClock } from './clock';
import { OrganizationTimeService } from './organization-time.service';

describe('OrganizationTimeService', () => {
  const fixedUtc = new Date('2026-08-08T13:25:00.000Z');
  const prisma = {
    organization: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'org-1',
        name: 'CarePoint Clinic',
        slug: 'carepoint-clinic',
        timezone: 'Asia/Dhaka',
      }),
    },
  };

  const service = new OrganizationTimeService(prisma as never, new FixedClock(fixedUtc));

  it('uses organization timezone instead of server OS timezone', async () => {
    const context = await service.getTimeContext('carepoint-clinic');
    expect(context.organization.timezone).toBe('Asia/Dhaka');
    expect(context.current.localDate).toBe('2026-08-08');
    expect(context.current.localTime).toBe('19:25:00');
    expect(context.current.dayName).toBe('Saturday');
    expect(context.current.dayOfWeek).toBe(6);
    expect(context.current.utcOffset).toBe('+06:00');
    expect(context.relativeDates.tomorrow.date).toBe('2026-08-09');
    expect(context.relativeDates.tomorrow.dayName).toBe('Sunday');
    expect(context.relativeDates.dayAfterTomorrow.date).toBe('2026-08-10');
    expect(context.relativeDates.dayAfterTomorrow.dayName).toBe('Monday');
  });

  it('keeps caller timezone as context only', async () => {
    const context = await service.getTimeContext('carepoint-clinic', {
      callerTimezone: 'America/New_York',
    });
    expect(context.callerContextTimezone).toBe('America/New_York');
    expect(context.organization.timezone).toBe('Asia/Dhaka');
    expect(context.current.timezone).toBe('Asia/Dhaka');
  });

  it('rejects invalid IANA timezones', async () => {
    await expect(
      service.getTimeContext('carepoint-clinic', { callerTimezone: 'Not/AZone' }),
    ).rejects.toThrow(/Invalid IANA timezone/);
  });

  it('keeps Asia/Dhaka results stable across process timezones', async () => {
    const previous = process.env.TZ;
    for (const tz of ['UTC', 'America/New_York', 'Asia/Dhaka']) {
      process.env.TZ = tz;
      const context = await service.getTimeContext('carepoint-clinic');
      expect(context.current.localDate).toBe('2026-08-08');
      expect(context.current.localTime).toBe('19:25:00');
      expect(context.relativeDates.tomorrow.date).toBe('2026-08-09');
    }
    if (previous === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previous;
    }
  });
});

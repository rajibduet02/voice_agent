import { AppointmentStatus, PrismaClient } from '@prisma/client';
import { AvailabilityService } from './availability.service';
import { PrismaService } from '../prisma/prisma.service';
import { getApplicationDayOfWeek, zonedLocalToUtc } from '../common/utils/time.util';

/**
 * Integration tests against the seeded CarePoint development database.
 */
describe('AvailabilityService CarePoint seed integration', () => {
  const prisma = new PrismaClient();
  const service = new AvailabilityService(prisma as unknown as PrismaService);

  let serviceId = '';
  let locationId = '';
  let providerId = '';
  let organizationId = '';

  beforeAll(async () => {
    const org = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'carepoint-clinic' },
    });
    organizationId = org.id;
    const general = await prisma.service.findFirstOrThrow({
      where: { organizationId: org.id, slug: 'general-consultation' },
    });
    serviceId = general.id;
    const location = await prisma.location.findFirstOrThrow({
      where: { organizationId: org.id, name: 'CarePoint Main Branch' },
    });
    locationId = location.id;
    const provider = await prisma.provider.findFirstOrThrow({
      where: { organizationId: org.id, name: 'Dr. Sarah Khan' },
    });
    providerId = provider.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('resolves General Consultation to Dr. Sarah Khan without preferred provider', async () => {
    const slots = await service.getAvailableSlots({
      organizationIdOrSlug: 'carepoint-clinic',
      serviceId,
      locationId,
      date: '2026-08-10',
      timezone: 'Asia/Dhaka',
    });
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((slot) => slot.providerName === 'Dr. Sarah Khan')).toBe(true);
  });

  it('returns morning Sunday slots and anytime Monday slots', async () => {
    expect(getApplicationDayOfWeek('2026-08-09', 'Asia/Dhaka')).toBe(0);
    expect(getApplicationDayOfWeek('2026-08-10', 'Asia/Dhaka')).toBe(1);

    const sunday = await service.getAvailableSlots({
      organizationIdOrSlug: organizationId,
      serviceId,
      locationId,
      date: '2026-08-09',
      timezone: 'Asia/Dhaka',
    });
    const sundayMorning = service.filterSlotsByTimePreference(
      sunday,
      'morning',
      'Asia/Dhaka',
    );
    expect(sundayMorning.length).toBeGreaterThan(0);
    expect(sundayMorning[0].displayStart).toContain('T09:');

    const monday = await service.getAvailableSlots({
      organizationIdOrSlug: organizationId,
      serviceId,
      locationId,
      date: '2026-08-10',
      timezone: 'Asia/Dhaka',
    });
    const mondayAny = service.filterSlotsByTimePreference(monday, 'any', 'Asia/Dhaka');
    // 15-min interval, 30-min duration: 15 morning + 11 afternoon = 26 when unconflicted.
    expect(mondayAny.length).toBeGreaterThanOrEqual(20);
  });

  it('returns no slots for Friday/Saturday and evening may be empty', async () => {
    const friday = await service.getAvailableSlots({
      organizationIdOrSlug: organizationId,
      serviceId,
      locationId,
      date: '2026-08-14',
      timezone: 'Asia/Dhaka',
    });
    expect(friday).toHaveLength(0);

    const saturday = await service.getAvailableSlots({
      organizationIdOrSlug: organizationId,
      serviceId,
      locationId,
      date: '2026-08-15',
      timezone: 'Asia/Dhaka',
    });
    expect(saturday).toHaveLength(0);

    const sunday = await service.getAvailableSlots({
      organizationIdOrSlug: organizationId,
      serviceId,
      locationId,
      date: '2026-08-09',
      timezone: 'Asia/Dhaka',
    });
    const evening = service.filterSlotsByTimePreference(sunday, 'evening', 'Asia/Dhaka');
    expect(evening).toHaveLength(0);
  });

  it('excludes same-day slots inside the minimum booking lead window', async () => {
    // Local Sunday 10:00 Asia/Dhaka → earliest bookable with 30m lead is 10:30.
    const now = zonedLocalToUtc('2026-08-09', '10:00', 'Asia/Dhaka');
    const earliest = new Date(now.getTime() + 30 * 60_000);
    const slots = await service.getAvailableSlots({
      organizationIdOrSlug: organizationId,
      serviceId,
      locationId,
      providerId,
      date: '2026-08-09',
      timezone: 'Asia/Dhaka',
      now,
      minimumBookingLeadMinutes: 30,
    });
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((slot) => new Date(slot.startTime) > earliest)).toBe(true);
    expect(slots.some((slot) => slot.displayStart.includes('T09:'))).toBe(false);
    expect(slots.some((slot) => slot.displayStart.includes('T10:00'))).toBe(false);
  });

  it('respects duration, interval, and lunch break', async () => {
    const monday = await service.getAvailableSlots({
      organizationIdOrSlug: organizationId,
      serviceId,
      locationId,
      providerId,
      date: '2026-08-10',
      timezone: 'Asia/Dhaka',
    });

    const starts = monday.map((slot) => slot.displayStart.slice(11, 16));
    expect(starts).toContain('09:00');
    expect(starts).toContain('09:15');
    expect(starts).toContain('12:30');
    expect(starts).not.toContain('12:45');
    expect(starts).toContain('14:00');
    expect(starts).toContain('16:30');
    expect(starts).not.toContain('13:00');
    expect(starts).not.toContain('16:45');

    const durationMs =
      new Date(monday[0].endTime).getTime() - new Date(monday[0].startTime).getTime();
    expect(durationMs).toBe(30 * 60_000);
  });

  it('blocks PENDING/CONFIRMED overlaps but not CANCELLED/COMPLETED', async () => {
    const start = zonedLocalToUtc('2026-08-10', '10:00', 'Asia/Dhaka');
    const end = zonedLocalToUtc('2026-08-10', '10:30', 'Asia/Dhaka');

    const customer = await prisma.customer.create({
      data: {
        organizationId,
        name: 'Availability Test Patient',
        phone: '+8801799000099',
        normalizedPhone: '+8801799000099',
      },
    });

    const confirmed = await prisma.appointment.create({
      data: {
        organizationId,
        locationId,
        providerId,
        serviceId,
        customerId: customer.id,
        confirmationCode: `APT-TEST-${Date.now()}`,
        scheduledStart: start,
        scheduledEnd: end,
        timezone: 'Asia/Dhaka',
        status: AppointmentStatus.CONFIRMED,
        source: 'WEB',
      },
    });

    try {
      const withConflict = await service.getAvailableSlots({
        organizationIdOrSlug: organizationId,
        serviceId,
        locationId,
        providerId,
        date: '2026-08-10',
        timezone: 'Asia/Dhaka',
      });
      expect(
        withConflict.some((slot) => slot.startTime === start.toISOString()),
      ).toBe(false);

      await prisma.appointment.update({
        where: { id: confirmed.id },
        data: { status: AppointmentStatus.CANCELLED },
      });

      const afterCancel = await service.getAvailableSlots({
        organizationIdOrSlug: organizationId,
        serviceId,
        locationId,
        providerId,
        date: '2026-08-10',
        timezone: 'Asia/Dhaka',
      });
      expect(afterCancel.some((slot) => slot.startTime === start.toISOString())).toBe(true);

      await prisma.appointment.update({
        where: { id: confirmed.id },
        data: { status: AppointmentStatus.COMPLETED },
      });
      const afterCompleted = await service.getAvailableSlots({
        organizationIdOrSlug: organizationId,
        serviceId,
        locationId,
        providerId,
        date: '2026-08-10',
        timezone: 'Asia/Dhaka',
      });
      expect(
        afterCompleted.some((slot) => slot.startTime === start.toISOString()),
      ).toBe(true);
    } finally {
      await prisma.appointment.deleteMany({ where: { id: confirmed.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
    }
  });
});

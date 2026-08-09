import { BadRequestException } from '@nestjs/common';
import { FixedClock } from './clock';
import { NextAvailabilityService } from './next-availability.service';
import { OrganizationTimeService } from './organization-time.service';

describe('NextAvailabilityService', () => {
  const fixedUtc = new Date('2026-08-08T13:25:00.000Z');
  const organization = {
    id: 'org-1',
    name: 'CarePoint Clinic',
    slug: 'carepoint-clinic',
    timezone: 'Asia/Dhaka',
  };

  const serviceRow = {
    id: 'svc-1',
    name: 'General Consultation',
  };
  const locationRow = {
    id: 'loc-1',
    name: 'CarePoint Main Branch',
  };

  function buildService(overrides?: {
    slotsByDate?: Record<string, Array<Record<string, unknown>>>;
    getAvailableSlots?: jest.Mock;
  }) {
    const slotsByDate = overrides?.slotsByDate ?? {
      '2026-08-08': [],
      '2026-08-09': [
        {
          providerId: 'p1',
          providerName: 'Dr. Sarah Khan',
          specialty: 'General Medicine',
          serviceId: 'svc-1',
          startTime: '2026-08-09T03:00:00.000Z',
          endTime: '2026-08-09T03:30:00.000Z',
        },
      ],
    };

    const getAvailableSlots =
      overrides?.getAvailableSlots ??
      jest.fn(async (query: { date: string }) => slotsByDate[query.date] ?? []);

    const availabilityService = {
      getAvailableSlots,
      filterSlotsByTimePreference: jest.fn((slots: unknown[]) => slots),
    };

    const prisma = {
      organization: {
        findFirst: jest.fn().mockResolvedValue(organization),
      },
      service: {
        findMany: jest.fn().mockResolvedValue([serviceRow]),
      },
      location: {
        findFirst: jest.fn().mockResolvedValue(locationRow),
        findMany: jest.fn().mockResolvedValue([locationRow]),
      },
      provider: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const organizationTime = new OrganizationTimeService(
      prisma as never,
      new FixedClock(fixedUtc),
    );

    const configService = {
      get: jest.fn().mockReturnValue('30'),
    };

    const service = new NextAvailabilityService(
      prisma as never,
      availabilityService as never,
      organizationTime,
      configService as never,
      new FixedClock(fixedUtc),
    );

    return { service, getAvailableSlots, availabilityService };
  }

  it('skips unavailable Friday/Saturday-style empty days and finds Sunday', async () => {
    const { service, getAvailableSlots } = buildService();
    const result = await service.findNextAvailable({
      organizationSlug: 'carepoint-clinic',
      serviceName: 'General Consultation',
      timePreference: 'any',
      daysToSearch: 7,
    });

    expect(result.available).toBe(true);
    expect(result.nextAvailableDate).toBe('2026-08-09');
    expect(result.options).toHaveLength(1);
    expect(getAvailableSlots).toHaveBeenCalled();
    // Stops once slots are found (today empty + Sunday found => 2 day checks)
    expect(getAvailableSlots.mock.calls.length).toBe(2);
  });

  it('rejects search ranges above 60 days', async () => {
    const { service } = buildService();
    await expect(
      service.findNextAvailable({
        organizationSlug: 'carepoint-clinic',
        serviceName: 'General Consultation',
        daysToSearch: 61,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns a normal no-availability result when the range is empty', async () => {
    const { service } = buildService({
      slotsByDate: {
        '2026-08-08': [],
        '2026-08-09': [],
        '2026-08-10': [],
      },
    });
    const result = await service.findNextAvailable({
      organizationSlug: 'carepoint-clinic',
      serviceName: 'General Consultation',
      daysToSearch: 3,
    });
    expect(result).toMatchObject({
      success: true,
      available: false,
      searchedFrom: '2026-08-08',
      searchedThrough: '2026-08-10',
      options: [],
    });
    expect(result.message).toMatch(/No available appointments/);
  });

  it('propagates internal availability errors instead of labeling them as no availability', async () => {
    const { service } = buildService({
      getAvailableSlots: jest.fn().mockRejectedValue(new Error('db exploded')),
    });
    await expect(
      service.findNextAvailable({
        organizationSlug: 'carepoint-clinic',
        serviceName: 'General Consultation',
        daysToSearch: 2,
      }),
    ).rejects.toThrow('db exploded');
  });
});

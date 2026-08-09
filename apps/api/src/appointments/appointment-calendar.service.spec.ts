import { BadRequestException } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { AppointmentCalendarService } from './appointment-calendar.service';

describe('AppointmentCalendarService', () => {
  const organization = {
    id: 'org-1',
    slug: 'carepoint-clinic',
    timezone: 'Asia/Dhaka',
    isActive: true,
  };

  const prisma = {
    appointment: {
      findMany: jest.fn(),
    },
  };

  const availabilityService = {
    resolveOrganization: jest.fn().mockResolvedValue(organization),
  };

  const service = new AppointmentCalendarService(
    prisma as never,
    availabilityService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.appointment.findMany.mockResolvedValue([]);
  });

  it('rejects start after end', async () => {
    await expect(
      service.getCalendarAppointments('carepoint-clinic', {
        start: '2026-09-01T00:00:00.000Z',
        end: '2026-08-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects excessive date ranges', async () => {
    await expect(
      service.getCalendarAppointments('carepoint-clinic', {
        start: '2026-01-01T00:00:00.000Z',
        end: '2026-05-01T00:00:00.000Z',
      }),
    ).rejects.toThrow(/93 days/);
  });

  it('queries overlapping appointments and orders by scheduledStart', async () => {
    const start = '2026-08-01T00:00:00.000Z';
    const end = '2026-09-01T00:00:00.000Z';

    prisma.appointment.findMany.mockResolvedValue([
      {
        id: 'a1',
        confirmationCode: 'APT-1',
        scheduledStart: new Date('2026-08-12T04:00:00.000Z'),
        scheduledEnd: new Date('2026-08-12T04:30:00.000Z'),
        timezone: 'Asia/Dhaka',
        status: AppointmentStatus.CONFIRMED,
        source: 'VOICE',
        customer: { name: 'John Doe' },
        provider: { id: 'p1', name: 'Dr. Sarah Khan', specialty: 'General Medicine' },
        service: { id: 's1', name: 'General Consultation' },
        location: { id: 'l1', name: 'CarePoint Main Branch' },
      },
    ]);

    const result = await service.getCalendarAppointments('carepoint-clinic', {
      start,
      end,
      providerId: '11111111-1111-4111-8111-111111111111',
      serviceId: '22222222-2222-4222-8222-222222222222',
      locationId: '33333333-3333-4333-8333-333333333333',
      status: AppointmentStatus.CONFIRMED,
      timezone: 'Asia/Dhaka',
    });

    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          scheduledStart: { lt: new Date(end) },
          scheduledEnd: { gt: new Date(start) },
          providerId: '11111111-1111-4111-8111-111111111111',
          serviceId: '22222222-2222-4222-8222-222222222222',
          locationId: '33333333-3333-4333-8333-333333333333',
          status: AppointmentStatus.CONFIRMED,
        }),
        orderBy: { scheduledStart: 'asc' },
        select: expect.objectContaining({
          customer: { select: { name: true } },
        }),
      }),
    );

    expect(result.appointments[0]).toEqual(
      expect.objectContaining({
        confirmationCode: 'APT-1',
        customer: { name: 'John Doe' },
      }),
    );
    expect(result.appointments[0]).not.toHaveProperty('customer.phone');
    expect(JSON.stringify(result)).not.toContain('phone');
    expect(JSON.stringify(result)).not.toContain('email');
    expect(JSON.stringify(result)).not.toContain('internalNotes');
  });
});

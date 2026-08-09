import { BadRequestException, Injectable } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { AvailabilityService } from '../availability/availability.service';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarAppointmentsQueryDto } from './dto/calendar-appointments-query.dto';

const MAX_RANGE_MS = 93 * 24 * 60 * 60 * 1000;

export type CalendarAppointmentItem = {
  id: string;
  confirmationCode: string;
  scheduledStart: string;
  scheduledEnd: string;
  timezone: string;
  status: AppointmentStatus;
  source: string;
  customer: { name: string };
  provider: { id: string; name: string; specialty: string | null };
  service: { id: string; name: string };
  location: { id: string; name: string };
};

export type CalendarAppointmentsResponse = {
  appointments: CalendarAppointmentItem[];
  range: {
    start: string;
    end: string;
    timezone: string;
  };
};

@Injectable()
export class AppointmentCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  async getCalendarAppointments(
    organizationSlug: string,
    query: CalendarAppointmentsQueryDto,
  ): Promise<CalendarAppointmentsResponse> {
    const organization = await this.availabilityService.resolveOrganization(organizationSlug);
    const start = new Date(query.start);
    const end = new Date(query.end);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('start and end must be valid ISO timestamps');
    }
    if (start >= end) {
      throw new BadRequestException('start must be before end');
    }
    if (end.getTime() - start.getTime() > MAX_RANGE_MS) {
      throw new BadRequestException('Date range cannot exceed 93 days');
    }

    const timezone = query.timezone ?? organization.timezone;
    if (!this.isValidTimezone(timezone)) {
      throw new BadRequestException(`Invalid timezone: ${timezone}`);
    }

    const appointments = await this.prisma.appointment.findMany({
      where: {
        organizationId: organization.id,
        scheduledStart: { lt: end },
        scheduledEnd: { gt: start },
        ...(query.providerId ? { providerId: query.providerId } : {}),
        ...(query.serviceId ? { serviceId: query.serviceId } : {}),
        ...(query.locationId ? { locationId: query.locationId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { scheduledStart: 'asc' },
      select: {
        id: true,
        confirmationCode: true,
        scheduledStart: true,
        scheduledEnd: true,
        timezone: true,
        status: true,
        source: true,
        customer: {
          select: { name: true },
        },
        provider: {
          select: { id: true, name: true, specialty: true },
        },
        service: {
          select: { id: true, name: true },
        },
        location: {
          select: { id: true, name: true },
        },
      },
    });

    return {
      appointments: appointments.map((appointment) => ({
        id: appointment.id,
        confirmationCode: appointment.confirmationCode,
        scheduledStart: appointment.scheduledStart.toISOString(),
        scheduledEnd: appointment.scheduledEnd.toISOString(),
        timezone: appointment.timezone,
        status: appointment.status,
        source: appointment.source,
        customer: { name: appointment.customer.name },
        provider: {
          id: appointment.provider.id,
          name: appointment.provider.name,
          specialty: appointment.provider.specialty,
        },
        service: {
          id: appointment.service.id,
          name: appointment.service.name,
        },
        location: {
          id: appointment.location.id,
          name: appointment.location.name,
        },
      })),
      range: {
        start: start.toISOString(),
        end: end.toISOString(),
        timezone,
      },
    };
  }

  private isValidTimezone(timeZone: string): boolean {
    try {
      Intl.DateTimeFormat('en-US', { timeZone });
      return true;
    } catch {
      return false;
    }
  }
}

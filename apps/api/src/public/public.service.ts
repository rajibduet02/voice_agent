import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityService } from '../availability/availability.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { OrganizationTimeService } from '../date-time/organization-time.service';
import { RelativeDateService } from '../date-time/relative-date.service';
import { NextAvailabilityService } from '../date-time/next-availability.service';
import { CreateAppointmentDto } from '../appointments/dto/create-appointment.dto';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import { ResolveDateDto } from './dto/resolve-date.dto';

@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
    private readonly appointmentsService: AppointmentsService,
    private readonly organizationTime: OrganizationTimeService,
    private readonly relativeDateService: RelativeDateService,
    private readonly nextAvailabilityService: NextAvailabilityService,
    private readonly configService: ConfigService,
  ) {}

  getTimeContext(organizationSlug: string, callerTimezone?: string) {
    return this.organizationTime.getTimeContext(organizationSlug, {
      callerTimezone,
    });
  }

  resolveDate(organizationSlug: string, dto: ResolveDateDto) {
    const nodeEnv = this.configService.get<string>('NODE_ENV') ?? 'development';
    const allowReferenceOverride = nodeEnv !== 'production';
    return this.relativeDateService.resolveExpression({
      organizationSlug,
      expression: dto.expression,
      timezone: dto.timezone,
      referenceUtc: allowReferenceOverride ? dto.referenceUtc : undefined,
      allowReferenceOverride,
    });
  }

  async listServices(organizationSlug: string) {
    const organization = await this.availabilityService.resolveOrganization(organizationSlug);
    const services = await this.prisma.service.findMany({
      where: { organizationId: organization.id, isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        durationMinutes: true,
        bufferBeforeMinutes: true,
        bufferAfterMinutes: true,
        price: true,
        currency: true,
      },
    });

    const location = await this.prisma.location.findFirst({
      where: { organizationId: organization.id, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        city: true,
        timezone: true,
        addressLine1: true,
        countryCode: true,
      },
    });

    return {
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        timezone: organization.timezone,
        slotIntervalMinutes: organization.slotIntervalMinutes,
      },
      defaultLocation: location,
      services,
    };
  }

  async listProviders(organizationSlug: string, serviceId: string) {
    const organization = await this.availabilityService.resolveOrganization(organizationSlug);
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, organizationId: organization.id, isActive: true },
    });
    if (!service) {
      throw new NotFoundException('Service not found for organization');
    }

    return this.prisma.provider.findMany({
      where: {
        organizationId: organization.id,
        isActive: true,
        providerServices: {
          some: { serviceId, isActive: true },
        },
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        providerType: true,
        specialty: true,
        biography: true,
        timezone: true,
        defaultLocationId: true,
      },
    });
  }

  async getAvailability(organizationSlug: string, query: AvailabilityQueryDto) {
    const organization = await this.availabilityService.resolveOrganization(organizationSlug);
    const timezone = organization.timezone;
    const timeContext = await this.organizationTime.getTimeContext(organizationSlug);
    const leadMinutes = this.nextAvailabilityService.getMinimumBookingLeadMinutes();
    const slots = await this.availabilityService.getAvailableSlots({
      organizationIdOrSlug: organization.id,
      serviceId: query.serviceId,
      locationId: query.locationId,
      providerId: query.providerId,
      date: query.date,
      timezone,
      now: this.organizationTime.nowUtc(),
      minimumBookingLeadMinutes: leadMinutes,
    });
    return {
      timezone,
      requestedDate: query.date,
      currentLocalDate: timeContext.current.localDate,
      currentLocalTime: timeContext.current.localTime,
      slots,
    };
  }

  createAppointment(organizationSlug: string, dto: CreateAppointmentDto) {
    return this.appointmentsService.create(organizationSlug, dto);
  }

  getAppointment(organizationSlug: string, confirmationCode: string) {
    return this.appointmentsService.findByConfirmationCode(organizationSlug, confirmationCode);
  }

  cancelAppointment(
    organizationSlug: string,
    confirmationCode: string,
    phone: string,
    reason?: string,
  ) {
    return this.appointmentsService.cancel(organizationSlug, confirmationCode, phone, reason);
  }
}

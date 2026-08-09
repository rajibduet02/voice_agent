import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Appointment,
  AppointmentSource,
  AppointmentStatus,
  Customer,
  Location,
  Prisma,
  Provider,
  Service,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityService } from '../availability/availability.service';
import { generateConfirmationCode } from '../common/utils/confirmation-code.util';
import { normalizePhone, phonesMatch } from '../common/utils/phone.util';
import { rangesOverlap } from '../common/utils/time.util';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

const MAX_RETRIES = 3;

export type AppointmentSafeResponse = {
  id: string;
  confirmationCode: string;
  status: AppointmentStatus;
  source: AppointmentSource;
  scheduledStart: string;
  scheduledEnd: string;
  timezone: string;
  reason: string | null;
  provider: { id: string; name: string; specialty: string | null };
  service: { id: string; name: string; durationMinutes: number };
  location: { id: string; name: string; city: string; timezone: string };
  customer: { id: string; name: string; phone: string; email: string | null };
  createdAt: string;
};

type AppointmentWithRelations = Appointment & {
  provider: Provider;
  service: Service;
  location: Location;
  customer: Customer;
};

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  async create(organizationSlug: string, dto: CreateAppointmentDto): Promise<AppointmentSafeResponse> {
    const organization = await this.availabilityService.resolveOrganization(organizationSlug);

    if (dto.externalRequestId) {
      const existing = await this.prisma.appointment.findUnique({
        where: { externalRequestId: dto.externalRequestId },
        include: {
          provider: true,
          service: true,
          location: true,
          customer: true,
        },
      });
      if (existing) {
        if (existing.organizationId !== organization.id) {
          throw new ConflictException('externalRequestId already used by another organization');
        }
        return this.toSafeResponse(existing);
      }
    }

    const scheduledStart = new Date(dto.scheduledStart);
    if (Number.isNaN(scheduledStart.getTime())) {
      throw new BadRequestException('scheduledStart must be a valid ISO timestamp');
    }
    if (scheduledStart.getTime() <= Date.now()) {
      throw new BadRequestException('Cannot book an appointment in the past');
    }

    if (!this.isValidTimezone(dto.timezone)) {
      throw new BadRequestException(`Invalid timezone: ${dto.timezone}`);
    }

    const [location, provider, service, providerService] = await Promise.all([
      this.prisma.location.findFirst({
        where: { id: dto.locationId, organizationId: organization.id, isActive: true },
      }),
      this.prisma.provider.findFirst({
        where: { id: dto.providerId, organizationId: organization.id, isActive: true },
      }),
      this.prisma.service.findFirst({
        where: { id: dto.serviceId, organizationId: organization.id, isActive: true },
      }),
      this.prisma.providerService.findFirst({
        where: {
          providerId: dto.providerId,
          serviceId: dto.serviceId,
          isActive: true,
        },
      }),
    ]);

    if (!location) {
      throw new NotFoundException('Location not found for organization');
    }
    if (!provider) {
      throw new NotFoundException('Provider not found for organization');
    }
    if (!service) {
      throw new NotFoundException('Service not found for organization');
    }
    if (!providerService) {
      throw new BadRequestException('Provider does not offer this service');
    }

    const duration = this.availabilityService.resolveDuration(service, providerService);
    const scheduledEnd = new Date(
      scheduledStart.getTime() + duration.durationMinutes * 60_000,
    );

    // Recalculate availability before attempting insert.
    const dateYmd = new Intl.DateTimeFormat('en-CA', {
      timeZone: dto.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(scheduledStart);

    const available = await this.availabilityService.getAvailableSlots({
      organizationIdOrSlug: organization.id,
      serviceId: service.id,
      locationId: location.id,
      providerId: provider.id,
      date: dateYmd,
      timezone: dto.timezone,
    });

    const slotStillOpen = available.some(
      (slot) => slot.startTime === scheduledStart.toISOString(),
    );
    if (!slotStillOpen) {
      throw new ConflictException('Selected slot is no longer available');
    }

    const normalizedPhone = normalizePhone(dto.customer.phone);
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      try {
        const appointment = await this.prisma.$transaction(
          async (tx) => {
            if (dto.externalRequestId) {
              const again = await tx.appointment.findUnique({
                where: { externalRequestId: dto.externalRequestId },
                include: {
                  provider: true,
                  service: true,
                  location: true,
                  customer: true,
                },
              });
              if (again) {
                return again;
              }
            }

            const customer = await this.upsertCustomer(tx, {
              organizationId: organization.id,
              name: dto.customer.name,
              phone: dto.customer.phone,
              normalizedPhone,
              email: dto.customer.email,
            });

            const overlapping = await tx.appointment.findMany({
              where: {
                providerId: provider.id,
                status: {
                  in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED],
                },
                scheduledStart: {
                  lt: new Date(scheduledEnd.getTime() + duration.bufferAfterMinutes * 60_000),
                },
                scheduledEnd: {
                  gt: new Date(
                    scheduledStart.getTime() - duration.bufferBeforeMinutes * 60_000,
                  ),
                },
              },
            });

            const hasConflict = overlapping.some((existing) =>
              rangesOverlap(
                new Date(scheduledStart.getTime() - duration.bufferBeforeMinutes * 60_000),
                new Date(scheduledEnd.getTime() + duration.bufferAfterMinutes * 60_000),
                new Date(existing.scheduledStart.getTime() - duration.bufferBeforeMinutes * 60_000),
                new Date(existing.scheduledEnd.getTime() + duration.bufferAfterMinutes * 60_000),
              ),
            );

            if (hasConflict) {
              throw new ConflictException('Selected slot is no longer available');
            }

            const confirmationCode = await this.createUniqueConfirmationCode(tx);

            return tx.appointment.create({
              data: {
                organizationId: organization.id,
                locationId: location.id,
                providerId: provider.id,
                serviceId: service.id,
                customerId: customer.id,
                confirmationCode,
                externalRequestId: dto.externalRequestId,
                scheduledStart,
                scheduledEnd,
                timezone: dto.timezone,
                status: AppointmentStatus.CONFIRMED,
                source: dto.source ?? AppointmentSource.WEB,
                reason: dto.reason,
              },
              include: {
                provider: true,
                service: true,
                location: true,
                customer: true,
              },
            });
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 5000,
            timeout: 10000,
          },
        );

        return this.toSafeResponse(appointment);
      } catch (error) {
        lastError = error;
        if (error instanceof ConflictException) {
          throw error;
        }
        if (this.isRetryableTransactionError(error) && attempt < MAX_RETRIES - 1) {
          continue;
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          dto.externalRequestId
        ) {
          const existing = await this.prisma.appointment.findUnique({
            where: { externalRequestId: dto.externalRequestId },
            include: {
              provider: true,
              service: true,
              location: true,
              customer: true,
            },
          });
          if (existing) {
            return this.toSafeResponse(existing);
          }
        }
        throw error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new ConflictException('Unable to book appointment due to a concurrent update');
  }

  async findByConfirmationCode(
    organizationSlug: string,
    confirmationCode: string,
  ): Promise<AppointmentSafeResponse> {
    const organization = await this.availabilityService.resolveOrganization(organizationSlug);
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        organizationId: organization.id,
        confirmationCode: confirmationCode.toUpperCase(),
      },
      include: {
        provider: true,
        service: true,
        location: true,
        customer: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    return this.toSafeResponse(appointment);
  }

  async cancel(
    organizationSlug: string,
    confirmationCode: string,
    phone: string,
    reason?: string,
  ): Promise<AppointmentSafeResponse> {
    const organization = await this.availabilityService.resolveOrganization(organizationSlug);
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        organizationId: organization.id,
        confirmationCode: confirmationCode.toUpperCase(),
      },
      include: {
        provider: true,
        service: true,
        location: true,
        customer: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (!phonesMatch(appointment.customer.phone, phone)) {
      throw new BadRequestException('Phone number does not match this appointment');
    }

    if (appointment.status === AppointmentStatus.CANCELLED) {
      return this.toSafeResponse(appointment);
    }

    if (
      appointment.status === AppointmentStatus.COMPLETED ||
      appointment.status === AppointmentStatus.NO_SHOW
    ) {
      throw new BadRequestException(`Cannot cancel an appointment with status ${appointment.status}`);
    }

    const updated = await this.prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: AppointmentStatus.CANCELLED,
        cancellationReason: reason,
        cancelledAt: new Date(),
      },
      include: {
        provider: true,
        service: true,
        location: true,
        customer: true,
      },
    });

    return this.toSafeResponse(updated);
  }

  toSafeResponse(appointment: AppointmentWithRelations): AppointmentSafeResponse {
    return {
      id: appointment.id,
      confirmationCode: appointment.confirmationCode,
      status: appointment.status,
      source: appointment.source,
      scheduledStart: appointment.scheduledStart.toISOString(),
      scheduledEnd: appointment.scheduledEnd.toISOString(),
      timezone: appointment.timezone,
      reason: appointment.reason,
      provider: {
        id: appointment.provider.id,
        name: appointment.provider.name,
        specialty: appointment.provider.specialty,
      },
      service: {
        id: appointment.service.id,
        name: appointment.service.name,
        durationMinutes: appointment.service.durationMinutes,
      },
      location: {
        id: appointment.location.id,
        name: appointment.location.name,
        city: appointment.location.city,
        timezone: appointment.location.timezone,
      },
      customer: {
        id: appointment.customer.id,
        name: appointment.customer.name,
        phone: appointment.customer.phone,
        email: appointment.customer.email,
      },
      createdAt: appointment.createdAt.toISOString(),
    };
  }

  private async upsertCustomer(
    tx: Prisma.TransactionClient,
    data: {
      organizationId: string;
      name: string;
      phone: string;
      normalizedPhone: string;
      email?: string;
    },
  ): Promise<Customer> {
    const existing = await tx.customer.findFirst({
      where: {
        organizationId: data.organizationId,
        normalizedPhone: data.normalizedPhone,
        ...(data.email
          ? { email: { equals: data.email, mode: 'insensitive' } }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
    });

    if (existing) {
      return tx.customer.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          phone: data.phone,
          normalizedPhone: data.normalizedPhone,
          email: data.email ?? existing.email,
        },
      });
    }

    return tx.customer.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        phone: data.phone,
        normalizedPhone: data.normalizedPhone,
        email: data.email,
      },
    });
  }

  private async createUniqueConfirmationCode(tx: Prisma.TransactionClient): Promise<string> {
    for (let i = 0; i < 10; i += 1) {
      const code = generateConfirmationCode();
      const exists = await tx.appointment.findUnique({ where: { confirmationCode: code } });
      if (!exists) {
        return code;
      }
    }
    throw new ConflictException('Unable to generate a unique confirmation code');
  }

  private isRetryableTransactionError(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return error.code === 'P2034';
    }
    return false;
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

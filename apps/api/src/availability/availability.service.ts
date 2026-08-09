import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AppointmentStatus,
  ExceptionType,
  Organization,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  applicationWeekdayName,
  formatInTimeZone,
  getApplicationDayOfWeek,
  hhMmToMinutes,
  isValidHhMm,
  isValidTimezone,
  prismaDateOnlyToYmd,
  rangesOverlap,
  subtractTimeWindow,
  zonedLocalToUtc,
} from '../common/utils/time.util';
import {
  matchesTimePreferenceHour,
  normalizeTimePreference,
  type TimePreference,
} from '../common/utils/time-preference.util';
import {
  AvailabilityAuditBreakdown,
  AvailabilityQuery,
  AvailableSlot,
  ResolvedDuration,
} from './availability.types';

const ACTIVE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.PENDING,
  AppointmentStatus.CONFIRMED,
];

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async getAvailableSlots(query: AvailabilityQuery): Promise<AvailableSlot[]> {
    const context = await this.loadAvailabilityContext(query);
    return this.generateSlots(context);
  }

  /**
   * Full audit breakdown for CLI / diagnostics (safe fields only).
   */
  async auditAvailability(
    query: AvailabilityQuery,
    timePreferenceRaw?: string,
  ): Promise<AvailabilityAuditBreakdown> {
    const preference = normalizeTimePreference(timePreferenceRaw);
    const context = await this.loadAvailabilityContext(query);
    const beforePreference = this.generateSlots(context, { skipPreference: true });
    const afterPreference = beforePreference.filter((slot) =>
      this.slotMatchesPreference(slot, preference, query.timezone),
    );

    return {
      organization: {
        id: context.organization.id,
        name: context.organization.name,
        slug: context.organization.slug,
        timezone: context.organization.timezone,
      },
      service: {
        id: context.service.id,
        name: context.service.name,
        durationMinutes: context.service.durationMinutes,
      },
      location: {
        id: context.location.id,
        name: context.location.name,
      },
      requestedDate: query.date,
      localWeekday: context.dayOfWeek,
      localWeekdayName: applicationWeekdayName(context.dayOfWeek),
      timezone: query.timezone,
      eligibleProviders: context.providers.map((p) => ({ id: p.id, name: p.name })),
      matchingRules: context.matchingRulesCount,
      exceptions: context.exceptionsCount,
      conflictingAppointments: context.appointments.length,
      candidateSlots: beforePreference.length,
      afterPreferenceFilter: afterPreference.length,
      afterConflictFilter: afterPreference.length,
      finalSlots: afterPreference,
    };
  }

  filterSlotsByTimePreference(
    slots: AvailableSlot[],
    timePreferenceRaw: string | undefined,
    timezone: string,
  ): AvailableSlot[] {
    const preference = normalizeTimePreference(timePreferenceRaw);
    return slots.filter((slot) => this.slotMatchesPreference(slot, preference, timezone));
  }

  resolveDuration(
    service: { durationMinutes: number; bufferBeforeMinutes: number; bufferAfterMinutes: number },
    providerService: { customDurationMinutes: number | null },
  ): ResolvedDuration {
    return {
      durationMinutes: providerService.customDurationMinutes ?? service.durationMinutes,
      bufferBeforeMinutes: service.bufferBeforeMinutes,
      bufferAfterMinutes: service.bufferAfterMinutes,
    };
  }

  resolveWindowsForDay(
    rules: Array<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      timezone: string;
      locationId: string | null;
      effectiveFrom: Date | null;
      effectiveUntil: Date | null;
      isActive: boolean;
    }>,
    exceptions: Array<{
      date: Date;
      exceptionType: ExceptionType;
      startTime: string | null;
      endTime: string | null;
      locationId: string | null;
    }>,
    dateYmd: string,
    dayOfWeek: number,
    locationId: string,
    fallbackTimezone: string,
  ): Array<{ startTime: string; endTime: string; timezone: string }> {
    const dayExceptions = exceptions.filter((exception) => {
      const exceptionYmd = prismaDateOnlyToYmd(exception.date);
      const locationOk = !exception.locationId || exception.locationId === locationId;
      return exceptionYmd === dateYmd && locationOk;
    });

    const fullDayUnavailable = dayExceptions.some(
      (e) =>
        e.exceptionType === ExceptionType.UNAVAILABLE &&
        (!e.startTime || !e.endTime || !isValidHhMm(e.startTime) || !isValidHhMm(e.endTime)),
    );
    if (fullDayUnavailable) {
      return [];
    }

    const customHours = dayExceptions.filter(
      (e) =>
        e.exceptionType === ExceptionType.CUSTOM_HOURS &&
        e.startTime &&
        e.endTime &&
        isValidHhMm(e.startTime) &&
        isValidHhMm(e.endTime),
    );

    let windows: Array<{ startTime: string; endTime: string; timezone: string }>;

    if (customHours.length > 0) {
      windows = customHours.map((e) => ({
        startTime: e.startTime as string,
        endTime: e.endTime as string,
        timezone: fallbackTimezone,
      }));
    } else {
      const matchingRules = rules.filter((rule) =>
        this.ruleApplies(rule, dayOfWeek, locationId, dateYmd),
      );

      const exactLocation = matchingRules.filter((rule) => rule.locationId === locationId);
      const selected = exactLocation.length > 0 ? exactLocation : matchingRules;

      windows = this.dedupeWindows(
        selected.map((rule) => ({
          startTime: rule.startTime,
          endTime: rule.endTime,
          timezone: rule.timezone || fallbackTimezone,
        })),
      );
    }

    const partialUnavailable = dayExceptions.filter(
      (e) =>
        e.exceptionType === ExceptionType.UNAVAILABLE &&
        e.startTime &&
        e.endTime &&
        isValidHhMm(e.startTime) &&
        isValidHhMm(e.endTime),
    );

    for (const block of partialUnavailable) {
      windows = subtractTimeWindow(windows, block.startTime as string, block.endTime as string);
    }

    return windows;
  }

  async resolveOrganization(idOrSlug: string): Promise<Organization> {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        idOrSlug,
      );

    const organization = await this.prisma.organization.findFirst({
      where: {
        isActive: true,
        ...(isUuid ? { OR: [{ id: idOrSlug }, { slug: idOrSlug }] } : { slug: idOrSlug }),
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return organization;
  }

  buildBusyIntervals(
    appointments: Array<{ scheduledStart: Date; scheduledEnd: Date }>,
    bufferBeforeMinutes: number,
    bufferAfterMinutes: number,
  ) {
    return appointments.map((appointment) => ({
      start: new Date(appointment.scheduledStart.getTime() - bufferBeforeMinutes * 60_000),
      end: new Date(appointment.scheduledEnd.getTime() + bufferAfterMinutes * 60_000),
    }));
  }

  async assertSlotAvailable(params: {
    organizationId: string;
    locationId: string;
    providerId: string;
    serviceId: string;
    scheduledStart: Date;
    timezone: string;
    tx?: Prisma.TransactionClient;
  }): Promise<{ scheduledEnd: Date; duration: ResolvedDuration }> {
    const db = params.tx ?? this.prisma;
    const service = await db.service.findFirst({
      where: {
        id: params.serviceId,
        organizationId: params.organizationId,
        isActive: true,
      },
    });
    if (!service) {
      throw new NotFoundException('Service not found');
    }

    const providerService = await db.providerService.findFirst({
      where: {
        providerId: params.providerId,
        serviceId: params.serviceId,
        isActive: true,
      },
    });
    if (!providerService) {
      throw new BadRequestException('Provider does not offer this service');
    }

    const duration = this.resolveDuration(service, providerService);
    const scheduledEnd = new Date(
      params.scheduledStart.getTime() + duration.durationMinutes * 60_000,
    );

    const dateYmd = formatInTimeZone(params.scheduledStart, params.timezone).slice(0, 10);
    const slots = await this.getAvailableSlots({
      organizationIdOrSlug: params.organizationId,
      serviceId: params.serviceId,
      locationId: params.locationId,
      providerId: params.providerId,
      date: dateYmd,
      timezone: params.timezone,
    });

    const match = slots.find(
      (slot) =>
        slot.startTime === params.scheduledStart.toISOString() &&
        slot.providerId === params.providerId,
    );

    if (!match) {
      throw new BadRequestException('Selected slot is not available');
    }

    return { scheduledEnd, duration };
  }

  private async loadAvailabilityContext(query: AvailabilityQuery) {
    this.validateDate(query.date);
    if (!isValidTimezone(query.timezone)) {
      throw new BadRequestException(`Invalid timezone: ${query.timezone}`);
    }

    const organization = await this.resolveOrganization(query.organizationIdOrSlug);
    const service = await this.prisma.service.findFirst({
      where: {
        id: query.serviceId,
        organizationId: organization.id,
        isActive: true,
      },
    });
    if (!service) {
      throw new NotFoundException('Service not found for organization');
    }

    const location = await this.prisma.location.findFirst({
      where: {
        id: query.locationId,
        organizationId: organization.id,
        isActive: true,
      },
    });
    if (!location) {
      throw new NotFoundException('Location not found for organization');
    }

    const providers = await this.prisma.provider.findMany({
      where: {
        organizationId: organization.id,
        isActive: true,
        ...(query.providerId ? { id: query.providerId } : {}),
        providerServices: {
          some: {
            serviceId: service.id,
            isActive: true,
          },
        },
      },
      include: {
        providerServices: {
          where: { serviceId: service.id, isActive: true },
        },
        availabilityRules: {
          where: { isActive: true },
        },
        availabilityExceptions: true,
      },
      orderBy: { name: 'asc' },
    });

    if (query.providerId && providers.length === 0) {
      throw new NotFoundException('Provider not found or does not offer this service');
    }

    // Clinic-local day bounds converted to UTC for overlap queries.
    const dayStart = zonedLocalToUtc(query.date, '00:00', query.timezone);
    const dayEnd = zonedLocalToUtc(
      this.nextLocalDate(query.date, query.timezone),
      '00:00',
      query.timezone,
    );

    const appointments = await this.prisma.appointment.findMany({
      where: {
        organizationId: organization.id,
        ...(providers.length > 0
          ? { providerId: { in: providers.map((p) => p.id) } }
          : { providerId: { in: [] } }),
        status: { in: ACTIVE_STATUSES },
        scheduledStart: { lt: dayEnd },
        scheduledEnd: { gt: dayStart },
      },
    });

    const dayOfWeek = getApplicationDayOfWeek(query.date, query.timezone);

    let matchingRulesCount = 0;
    let exceptionsCount = 0;
    for (const provider of providers) {
      const windows = this.resolveWindowsForDay(
        provider.availabilityRules,
        provider.availabilityExceptions,
        query.date,
        dayOfWeek,
        location.id,
        provider.timezone,
      );
      matchingRulesCount += provider.availabilityRules.filter((rule) =>
        this.ruleApplies(rule, dayOfWeek, location.id, query.date),
      ).length;
      exceptionsCount += provider.availabilityExceptions.filter((exception) => {
        const exceptionYmd = prismaDateOnlyToYmd(exception.date);
        const locationOk = !exception.locationId || exception.locationId === location.id;
        return exceptionYmd === query.date && locationOk;
      }).length;
      void windows;
    }

    return {
      organization,
      service,
      location,
      providers,
      appointments,
      dayOfWeek,
      dayStart,
      dayEnd,
      matchingRulesCount,
      exceptionsCount,
      query,
    };
  }

  private generateSlots(
    context: Awaited<ReturnType<AvailabilityService['loadAvailabilityContext']>>,
    options?: { skipPreference?: boolean },
  ): AvailableSlot[] {
    void options;
    const { organization, service, location, providers, appointments, dayOfWeek, query } =
      context;
    const slots: AvailableSlot[] = [];
    const now = query.now ?? new Date();
    const earliestBookable = new Date(
      now.getTime() + Math.max(0, query.minimumBookingLeadMinutes ?? 0) * 60_000,
    );

    for (const provider of providers) {
      const providerService = provider.providerServices[0];
      if (!providerService) {
        continue;
      }

      const duration = this.resolveDuration(service, providerService);
      const windows = this.resolveWindowsForDay(
        provider.availabilityRules,
        provider.availabilityExceptions,
        query.date,
        dayOfWeek,
        location.id,
        provider.timezone,
      );

      if (
        provider.availabilityRules.length === 0 &&
        process.env.NODE_ENV !== 'production'
      ) {
        // Safe diagnostic for missing seed/config — does not change return value.
         
        console.warn(
          `[availability] Provider ${provider.name} has no active availability rules`,
        );
      }

      const providerAppointments = appointments.filter((a) => a.providerId === provider.id);

      for (const window of windows) {
        const windowStart = zonedLocalToUtc(query.date, window.startTime, window.timezone);
        const windowEnd = zonedLocalToUtc(query.date, window.endTime, window.timezone);
        const intervalMs = organization.slotIntervalMinutes * 60 * 1000;
        const durationMs = duration.durationMinutes * 60 * 1000;
        const bufferBeforeMs = duration.bufferBeforeMinutes * 60 * 1000;
        const bufferAfterMs = duration.bufferAfterMinutes * 60 * 1000;

        for (
          let cursor = windowStart.getTime();
          cursor + durationMs <= windowEnd.getTime();
          cursor += intervalMs
        ) {
          const start = new Date(cursor);
          const end = new Date(cursor + durationMs);

          // Exclude slots that have started or fall inside the booking lead window.
          if (start <= earliestBookable) {
            continue;
          }

          const blockStart = new Date(start.getTime() - bufferBeforeMs);
          const blockEnd = new Date(end.getTime() + bufferAfterMs);

          const conflicts = providerAppointments.some((appointment) => {
            const existingStart = new Date(
              appointment.scheduledStart.getTime() - bufferBeforeMs,
            );
            const existingEnd = new Date(appointment.scheduledEnd.getTime() + bufferAfterMs);
            return rangesOverlap(blockStart, blockEnd, existingStart, existingEnd);
          });

          if (conflicts) {
            continue;
          }

          slots.push({
            providerId: provider.id,
            providerName: provider.name,
            specialty: provider.specialty,
            serviceId: service.id,
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            displayStart: formatInTimeZone(start, query.timezone),
            timezone: query.timezone,
          });
        }
      }
    }

    return slots.sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );
  }

  private ruleApplies(
    rule: {
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      locationId: string | null;
      effectiveFrom: Date | null;
      effectiveUntil: Date | null;
      isActive: boolean;
    },
    dayOfWeek: number,
    locationId: string,
    dateYmd: string,
  ): boolean {
    if (!rule.isActive || rule.dayOfWeek !== dayOfWeek) {
      return false;
    }
    // null locationId = generic rule valid for any location
    if (rule.locationId && rule.locationId !== locationId) {
      return false;
    }
    if (rule.effectiveFrom && dateYmd < prismaDateOnlyToYmd(rule.effectiveFrom)) {
      return false;
    }
    if (rule.effectiveUntil && dateYmd > prismaDateOnlyToYmd(rule.effectiveUntil)) {
      return false;
    }
    if (!isValidHhMm(rule.startTime) || !isValidHhMm(rule.endTime)) {
      return false;
    }
    if (hhMmToMinutes(rule.startTime) >= hhMmToMinutes(rule.endTime)) {
      return false;
    }
    return true;
  }

  private dedupeWindows(
    windows: Array<{ startTime: string; endTime: string; timezone: string }>,
  ) {
    const seen = new Set<string>();
    const result: Array<{ startTime: string; endTime: string; timezone: string }> = [];
    for (const window of windows) {
      const key = `${window.startTime}|${window.endTime}|${window.timezone}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(window);
    }
    return result.sort((a, b) => hhMmToMinutes(a.startTime) - hhMmToMinutes(b.startTime));
  }

  private slotMatchesPreference(
    slot: AvailableSlot,
    preference: TimePreference,
    timezone: string,
  ): boolean {
    const parts = formatInTimeZone(new Date(slot.startTime), timezone);
    const hour = Number(parts.slice(11, 13));
    return matchesTimePreferenceHour(hour, preference);
  }

  private nextLocalDate(dateYmd: string, timeZone: string): string {
    const noon = zonedLocalToUtc(dateYmd, '12:00', timeZone);
    const next = new Date(noon.getTime() + 24 * 60 * 60 * 1000);
    return formatInTimeZone(next, timeZone).slice(0, 10);
  }

  private validateDate(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('date must be in YYYY-MM-DD format');
    }
    try {
      getApplicationDayOfWeek(date, 'UTC');
    } catch {
      throw new BadRequestException('date must be a valid calendar date');
    }
  }
}

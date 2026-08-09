import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import { AvailabilityService } from '../availability/availability.service';
import { AvailableSlot } from '../availability/availability.types';
import {
  formatDisplayDate,
  formatDisplayTime,
  formatInTimeZone,
  applicationWeekdayName,
  getApplicationDayOfWeek,
} from '../common/utils/time.util';
import { normalizeTimePreference } from '../common/utils/time-preference.util';
import { PrismaService } from '../prisma/prisma.service';
import { CLOCK, Clock } from './clock';
import { OrganizationTimeService } from './organization-time.service';

const DEFAULT_SEARCH_DAYS = 30;
const MAX_SEARCH_DAYS = 60;
const DEFAULT_LEAD_MINUTES = 30;

export type NextAvailabilityResult = {
  success: true;
  available: boolean;
  message: string;
  searchedFrom: string;
  searchedThrough: string;
  timezone: string;
  service?: { id: string; name: string };
  location?: { id: string; name: string };
  nextAvailableDate?: string;
  formattedNextAvailableDate?: string;
  options: Array<Record<string, unknown>>;
};

@Injectable()
export class NextAvailabilityService {
  private readonly logger = new Logger(NextAvailabilityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
    private readonly organizationTime: OrganizationTimeService,
    private readonly configService: ConfigService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  getMinimumBookingLeadMinutes(): number {
    const raw = this.configService.get<string | number>('MINIMUM_BOOKING_LEAD_MINUTES');
    const parsed = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return DEFAULT_LEAD_MINUTES;
    }
    return Math.floor(parsed);
  }

  async findNextAvailable(params: {
    organizationSlug: string;
    serviceName: string;
    preferredProviderName?: string;
    locationName?: string;
    startDate?: string;
    timePreference?: string;
    timezone?: string;
    daysToSearch?: number;
  }): Promise<NextAvailabilityResult> {
    const organization = await this.organizationTime.getOrganizationTimezone(
      params.organizationSlug,
    );
    const timezone = organization.timezone;
    if (params.timezone) {
      this.organizationTime.assertValidTimezone(params.timezone);
      // Caller timezone is ignored for scheduling; org timezone wins.
    }

    const requestedDays = params.daysToSearch ?? DEFAULT_SEARCH_DAYS;
    if (requestedDays > MAX_SEARCH_DAYS) {
      throw new BadRequestException(`daysToSearch cannot exceed ${MAX_SEARCH_DAYS}`);
    }
    const daysToSearch = Math.min(Math.max(1, requestedDays), MAX_SEARCH_DAYS);

    const now = this.clock.now();
    const context = await this.organizationTime.getTimeContext(params.organizationSlug, {
      now,
    });
    const startDate = params.startDate
      ? this.organizationTime.parseStrictYmd(params.startDate)
      : context.current.localDate;

    const services = await this.prisma.service.findMany({
      where: {
        organizationId: organization.id,
        isActive: true,
        name: { equals: params.serviceName, mode: 'insensitive' },
      },
    });
    if (services.length === 0) {
      throw new BadRequestException(`No service found matching "${params.serviceName}"`);
    }
    if (services.length > 1) {
      throw new BadRequestException(`Ambiguous service name "${params.serviceName}"`);
    }
    const service = services[0];

    const location = await this.resolveLocation(organization.id, params.locationName);
    const providerId = await this.resolveProviderId(
      organization.id,
      service.id,
      params.preferredProviderName,
    );

    const preference = normalizeTimePreference(params.timePreference);
    const leadMinutes = this.getMinimumBookingLeadMinutes();
    let cursor = startDate;
    let searchedThrough = startDate;

    for (let i = 0; i < daysToSearch; i += 1) {
      searchedThrough = cursor;
      try {
        const slots = await this.availabilityService.getAvailableSlots({
          organizationIdOrSlug: organization.id,
          serviceId: service.id,
          locationId: location.id,
          providerId,
          date: cursor,
          timezone,
          now,
          minimumBookingLeadMinutes: leadMinutes,
        });
        const filtered = this.availabilityService.filterSlotsByTimePreference(
          slots,
          preference,
          timezone,
        );
        if (filtered.length > 0) {
          const options = filtered.slice(0, 5).map((slot) =>
            this.toOption(slot, service.name, location.id, location.name, timezone, now),
          );
          const dayOfWeek = getApplicationDayOfWeek(cursor, timezone);
          const formatted = `${applicationWeekdayName(dayOfWeek)}, ${formatDisplayDate(cursor, timezone)}`;
          return {
            success: true,
            available: true,
            message: `The next available appointments are on ${formatted}.`,
            searchedFrom: startDate,
            searchedThrough: cursor,
            timezone,
            service: { id: service.id, name: service.name },
            location: { id: location.id, name: location.name },
            nextAvailableDate: cursor,
            formattedNextAvailableDate: formatted,
            options,
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Availability search failed';
        this.logger.error(`Next-availability day ${cursor} failed: ${message}`);
        throw error;
      }
      cursor = this.organizationTime.addLocalDays(cursor, 1, timezone);
    }

    return {
      success: true,
      available: false,
      message: `No available appointments were found in the next ${daysToSearch} days.`,
      searchedFrom: startDate,
      searchedThrough,
      timezone,
      service: { id: service.id, name: service.name },
      location: { id: location.id, name: location.name },
      options: [],
    };
  }

  enrichAvailabilityOptions(
    slots: AvailableSlot[],
    meta: {
      serviceName: string;
      locationId: string;
      locationName: string;
      timezone: string;
      requestedDate: string;
      currentLocalDate: string;
      currentLocalTime: string;
    },
  ) {
    const now = this.clock.now();
    return {
      requestedDate: meta.requestedDate,
      requestedDateFormatted: `${applicationWeekdayName(getApplicationDayOfWeek(meta.requestedDate, meta.timezone))}, ${formatDisplayDate(meta.requestedDate, meta.timezone)}`,
      currentLocalDate: meta.currentLocalDate,
      currentLocalTime: meta.currentLocalTime,
      timezone: meta.timezone,
      available: slots.length > 0,
      options: slots.slice(0, 5).map((slot) =>
        this.toOption(slot, meta.serviceName, meta.locationId, meta.locationName, meta.timezone, now),
      ),
    };
  }

  private toOption(
    slot: AvailableSlot,
    serviceName: string,
    locationId: string,
    locationName: string,
    timezone: string,
    _now: Date,
  ) {
    const start = new Date(slot.startTime);
    const end = new Date(slot.endTime);
    const localStart = formatInTimeZone(start, timezone);
    const localEnd = formatInTimeZone(end, timezone);
    const utcOffset = DateTime.fromJSDate(start, { zone: 'utc' })
      .setZone(timezone)
      .toFormat('ZZ');
    const dayOfWeek = getApplicationDayOfWeek(localStart.slice(0, 10), timezone);
    return {
      providerId: slot.providerId,
      providerName: slot.providerName,
      specialty: slot.specialty,
      serviceId: slot.serviceId,
      serviceName,
      locationId,
      locationName,
      startTime: slot.startTime,
      endTime: slot.endTime,
      localStartIso: `${localStart}${utcOffset}`,
      localEndIso: `${localEnd}${utcOffset}`,
      displayDate: `${applicationWeekdayName(dayOfWeek)}, ${formatDisplayDate(localStart.slice(0, 10), timezone)}`,
      displayStart: formatDisplayTime(start, timezone),
      displayEnd: formatDisplayTime(end, timezone),
      timezone,
      utcOffset,
    };
  }

  private async resolveLocation(organizationId: string, locationName?: string) {
    if (locationName) {
      const locations = await this.prisma.location.findMany({
        where: {
          organizationId,
          isActive: true,
          name: { equals: locationName, mode: 'insensitive' },
        },
      });
      if (locations.length === 0) {
        throw new BadRequestException(`No location found matching "${locationName}"`);
      }
      if (locations.length > 1) {
        throw new BadRequestException(`Ambiguous location name "${locationName}"`);
      }
      return locations[0];
    }
    const location = await this.prisma.location.findFirst({
      where: { organizationId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!location) {
      throw new BadRequestException('No active location configured for this organization');
    }
    return location;
  }

  private async resolveProviderId(
    organizationId: string,
    serviceId: string,
    preferredProviderName?: string,
  ): Promise<string | undefined> {
    if (!preferredProviderName) {
      return undefined;
    }
    const providers = await this.prisma.provider.findMany({
      where: {
        organizationId,
        isActive: true,
        name: { equals: preferredProviderName, mode: 'insensitive' },
        providerServices: { some: { serviceId, isActive: true } },
      },
    });
    if (providers.length === 0) {
      throw new BadRequestException(
        `No provider found matching "${preferredProviderName}" for this service`,
      );
    }
    if (providers.length > 1) {
      throw new BadRequestException(`Ambiguous provider name "${preferredProviderName}"`);
    }
    return providers[0].id;
  }
}

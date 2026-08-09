import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import {
  APPLICATION_WEEKDAY_NAMES,
  applicationWeekdayName,
  formatDisplayDate,
  formatDisplayTime,
  getApplicationDayOfWeek,
  isValidTimezone,
  toYmdInTimeZone,
  zonedLocalToUtc,
} from '../common/utils/time.util';
import { PrismaService } from '../prisma/prisma.service';
import { CLOCK, Clock } from './clock';

export type OrganizationTimeContext = {
  organization: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
  };
  current: {
    utc: string;
    localIso: string;
    localDate: string;
    localTime: string;
    formattedDate: string;
    formattedTime: string;
    dayOfWeek: number;
    dayName: string;
    timezone: string;
    utcOffset: string;
  };
  callerContextTimezone?: string;
  relativeDates: {
    today: { date: string; dayName: string };
    tomorrow: { date: string; dayName: string };
    dayAfterTomorrow: { date: string; dayName: string };
  };
  generatedAtUtc: string;
};

@Injectable()
export class OrganizationTimeService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  nowUtc(): Date {
    return this.clock.now();
  }

  assertValidTimezone(timeZone: string): string {
    if (!isValidTimezone(timeZone)) {
      throw new BadRequestException(`Invalid IANA timezone: ${timeZone}`);
    }
    return timeZone;
  }

  parseStrictYmd(date: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('date must be in YYYY-MM-DD format');
    }
    const dt = DateTime.fromISO(date, { zone: 'utc' });
    if (!dt.isValid || dt.toISODate() !== date) {
      throw new BadRequestException('date must be a valid calendar date');
    }
    return date;
  }

  async getOrganizationTimezone(organizationSlug: string): Promise<{
    id: string;
    name: string;
    slug: string;
    timezone: string;
  }> {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        organizationSlug,
      );
    const organization = await this.prisma.organization.findFirst({
      where: {
        isActive: true,
        ...(isUuid
          ? { OR: [{ id: organizationSlug }, { slug: organizationSlug }] }
          : { slug: organizationSlug }),
      },
      select: { id: true, name: true, slug: true, timezone: true },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    this.assertValidTimezone(organization.timezone);
    return organization;
  }

  async getTimeContext(
    organizationSlug: string,
    options?: { callerTimezone?: string; now?: Date },
  ): Promise<OrganizationTimeContext> {
    const organization = await this.getOrganizationTimezone(organizationSlug);
    const orgTz = organization.timezone;
    const now = options?.now ?? this.nowUtc();

    let callerContextTimezone: string | undefined;
    if (options?.callerTimezone) {
      callerContextTimezone = this.assertValidTimezone(options.callerTimezone);
      // Caller timezone is display/context only — never overrides organization.timezone.
    }

    const local = DateTime.fromJSDate(now, { zone: 'utc' }).setZone(orgTz);
    const localDate = local.toISODate()!;
    const tomorrow = local.plus({ days: 1 });
    const dayAfter = local.plus({ days: 2 });
    const dayOfWeek = getApplicationDayOfWeek(localDate, orgTz);

    return {
      organization,
      current: {
        utc: now.toISOString(),
        localIso: local.toISO({ suppressMilliseconds: false }) ?? local.toString(),
        localDate,
        localTime: local.toFormat('HH:mm:ss'),
        formattedDate: formatDisplayDate(localDate, orgTz),
        formattedTime: formatDisplayTime(now, orgTz),
        dayOfWeek,
        dayName: applicationWeekdayName(dayOfWeek),
        timezone: orgTz,
        utcOffset: local.toFormat('ZZ'),
      },
      callerContextTimezone,
      relativeDates: {
        today: {
          date: localDate,
          dayName: APPLICATION_WEEKDAY_NAMES[dayOfWeek],
        },
        tomorrow: {
          date: tomorrow.toISODate()!,
          dayName: APPLICATION_WEEKDAY_NAMES[getApplicationDayOfWeek(tomorrow.toISODate()!, orgTz)],
        },
        dayAfterTomorrow: {
          date: dayAfter.toISODate()!,
          dayName: APPLICATION_WEEKDAY_NAMES[getApplicationDayOfWeek(dayAfter.toISODate()!, orgTz)],
        },
      },
      generatedAtUtc: now.toISOString(),
    };
  }

  localDateTimeToUtc(dateYmd: string, timeHhMm: string, timeZone: string): Date {
    this.assertValidTimezone(timeZone);
    this.parseStrictYmd(dateYmd);
    return zonedLocalToUtc(dateYmd, timeHhMm, timeZone);
  }

  utcToLocalYmd(instant: Date, timeZone: string): string {
    this.assertValidTimezone(timeZone);
    return toYmdInTimeZone(instant, timeZone);
  }

  addLocalDays(dateYmd: string, days: number, timeZone: string): string {
    this.assertValidTimezone(timeZone);
    this.parseStrictYmd(dateYmd);
    const next = DateTime.fromISO(dateYmd, { zone: timeZone }).plus({ days });
    if (!next.isValid || !next.toISODate()) {
      throw new BadRequestException('Unable to compute local calendar date');
    }
    return next.toISODate()!;
  }

  compareLocalDates(a: string, b: string): number {
    this.parseStrictYmd(a);
    this.parseStrictYmd(b);
    if (a === b) return 0;
    return a < b ? -1 : 1;
  }

  earliestBookableInstant(now: Date, leadMinutes: number): Date {
    return new Date(now.getTime() + Math.max(0, leadMinutes) * 60_000);
  }
}

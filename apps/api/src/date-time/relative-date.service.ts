import { Inject, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import {
  APPLICATION_WEEKDAY_NAMES,
  applicationWeekdayName,
  formatDisplayDate,
  getApplicationDayOfWeek,
} from '../common/utils/time.util';
import { CLOCK, Clock } from './clock';
import { OrganizationTimeService } from './organization-time.service';

export type ResolveDateSuccess = {
  success: true;
  originalExpression: string;
  resolvedDate: string;
  formattedDate: string;
  dayName: string;
  dayOfWeek: number;
  timezone: string;
  interpretation: string;
  reference: {
    currentLocalDate: string;
    currentLocalTime: string;
  };
};

export type ResolveDateFailure = {
  success: false;
  clarificationRequired?: true;
  pastDate?: true;
  message: string;
  originalExpression: string;
};

export type ResolveDateResult = ResolveDateSuccess | ResolveDateFailure;

const WEEKDAY_MAP: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const MONTH_MAP: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

@Injectable()
export class RelativeDateService {
  constructor(
    private readonly organizationTime: OrganizationTimeService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async resolveExpression(params: {
    organizationSlug: string;
    expression: string;
    timezone?: string;
    /** Test/dev only. Ignored in production public requests. */
    referenceUtc?: string;
    allowReferenceOverride?: boolean;
  }): Promise<ResolveDateResult> {
    const organization = await this.organizationTime.getOrganizationTimezone(
      params.organizationSlug,
    );
    const timezone = params.timezone
      ? this.organizationTime.assertValidTimezone(params.timezone)
      : organization.timezone;

    // Organization timezone remains authoritative for scheduling; optional timezone is display/context.
    const schedulingTimezone = organization.timezone;
    void timezone;

    const now = this.resolveReferenceInstant(
      params.referenceUtc,
      params.allowReferenceOverride === true,
    );
    const context = await this.organizationTime.getTimeContext(params.organizationSlug, {
      now,
    });
    const today = context.current.localDate;
    const normalized = this.normalizeExpression(params.expression);

    if (!normalized) {
      return this.clarification(params.expression);
    }

    if (this.isAmbiguous(normalized)) {
      return this.clarification(params.expression);
    }

    const resolved = this.parseExpression(normalized, today, schedulingTimezone);
    if (!resolved) {
      return this.clarification(params.expression);
    }

    if (resolved.date < today) {
      return {
        success: false,
        pastDate: true,
        message:
          'That date is in the past. Please choose today or a future date.',
        originalExpression: params.expression,
      };
    }

    const dayOfWeek = getApplicationDayOfWeek(resolved.date, schedulingTimezone);
    return {
      success: true,
      originalExpression: params.expression,
      resolvedDate: resolved.date,
      formattedDate: `${applicationWeekdayName(dayOfWeek)}, ${formatDisplayDate(resolved.date, schedulingTimezone)}`,
      dayName: APPLICATION_WEEKDAY_NAMES[dayOfWeek],
      dayOfWeek,
      timezone: schedulingTimezone,
      interpretation: resolved.interpretation,
      reference: {
        currentLocalDate: context.current.localDate,
        currentLocalTime: context.current.localTime,
      },
    };
  }

  private resolveReferenceInstant(
    referenceUtc: string | undefined,
    allow: boolean,
  ): Date {
    if (!allow || !referenceUtc) {
      return this.clock.now();
    }
    const parsed = DateTime.fromISO(referenceUtc, { zone: 'utc' });
    if (!parsed.isValid) {
      return this.clock.now();
    }
    return parsed.toJSDate();
  }

  private normalizeExpression(expression: string): string {
    return expression
      .trim()
      .toLowerCase()
      .replace(/[,]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\b(\d+)(st|nd|rd|th)\b/g, '$1');
  }

  private isAmbiguous(normalized: string): boolean {
    if (/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(normalized)) {
      return true;
    }
    const ambiguous = [
      'next weekend',
      'this weekend',
      'sometime next week',
      'next week',
      'later',
      'soon',
      'after a few days',
      'in a few days',
      'whenever',
    ];
    return ambiguous.includes(normalized);
  }

  private parseExpression(
    normalized: string,
    todayYmd: string,
    timeZone: string,
  ): { date: string; interpretation: string } | null {
    if (normalized === 'today') {
      return { date: todayYmd, interpretation: 'today' };
    }
    if (normalized === 'tomorrow' || normalized === 'next day') {
      return {
        date: this.organizationTime.addLocalDays(todayYmd, 1, timeZone),
        interpretation: normalized === 'next day' ? 'next day' : 'tomorrow',
      };
    }
    if (
      normalized === 'day after tomorrow' ||
      normalized === 'the day after tomorrow'
    ) {
      return {
        date: this.organizationTime.addLocalDays(todayYmd, 2, timeZone),
        interpretation: 'day after tomorrow',
      };
    }

    const thisWeekday = normalized.match(/^this (sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
    if (thisWeekday) {
      return {
        date: this.findWeekday(todayYmd, WEEKDAY_MAP[thisWeekday[1]], timeZone, 'this'),
        interpretation: `this ${thisWeekday[1]}`,
      };
    }

    const nextWeekday = normalized.match(/^next (sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
    if (nextWeekday) {
      return {
        date: this.findWeekday(todayYmd, WEEKDAY_MAP[nextWeekday[1]], timeZone, 'next'),
        interpretation: `next ${nextWeekday[1]}`,
      };
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      this.organizationTime.parseStrictYmd(normalized);
      return { date: normalized, interpretation: 'iso-date' };
    }

    const monthDayYear = normalized.match(
      /^(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec) (\d{1,2})(?: (\d{4}))?$/,
    );
    if (monthDayYear) {
      return this.resolveMonthDay(
        MONTH_MAP[monthDayYear[1]],
        Number(monthDayYear[2]),
        monthDayYear[3] ? Number(monthDayYear[3]) : undefined,
        todayYmd,
        timeZone,
      );
    }

    const dayMonthYear = normalized.match(
      /^(\d{1,2}) (january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)(?: (\d{4}))?$/,
    );
    if (dayMonthYear) {
      return this.resolveMonthDay(
        MONTH_MAP[dayMonthYear[2]],
        Number(dayMonthYear[1]),
        dayMonthYear[3] ? Number(dayMonthYear[3]) : undefined,
        todayYmd,
        timeZone,
      );
    }

    return null;
  }

  private resolveMonthDay(
    month: number,
    day: number,
    year: number | undefined,
    todayYmd: string,
    timeZone: string,
  ): { date: string; interpretation: string } | null {
    if (!month || day < 1 || day > 31) {
      return null;
    }
    const today = DateTime.fromISO(todayYmd, { zone: timeZone });
    const targetYear = year ?? today.year;
    let candidate = DateTime.fromObject(
      { year: targetYear, month, day },
      { zone: timeZone },
    );
    if (!candidate.isValid || !candidate.toISODate()) {
      return null;
    }
    if (!year && candidate.toISODate()! < todayYmd) {
      candidate = candidate.plus({ years: 1 });
      if (!candidate.isValid || !candidate.toISODate()) {
        return null;
      }
    }
    return {
      date: candidate.toISODate()!,
      interpretation: year ? 'absolute-date' : 'month-day-upcoming',
    };
  }

  /**
   * this <weekday>: nearest upcoming including today
   * next <weekday>: strictly after today (if today is that weekday, jump 7 days)
   */
  private findWeekday(
    todayYmd: string,
    targetDow: number,
    timeZone: string,
    mode: 'this' | 'next',
  ): string {
    const todayDow = getApplicationDayOfWeek(todayYmd, timeZone);
    let delta = (targetDow - todayDow + 7) % 7;
    if (mode === 'next' && delta === 0) {
      delta = 7;
    }
    return this.organizationTime.addLocalDays(todayYmd, delta, timeZone);
  }

  private clarification(expression: string): ResolveDateFailure {
    return {
      success: false,
      clarificationRequired: true,
      message:
        'Please provide a specific date, such as August 10 or next Monday.',
      originalExpression: expression,
    };
  }
}

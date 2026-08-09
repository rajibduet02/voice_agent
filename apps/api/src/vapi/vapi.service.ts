import {
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { AppointmentSource, VoiceCallStatus } from '@prisma/client';
import { NextAvailabilityService } from '../date-time/next-availability.service';
import { OrganizationTimeService } from '../date-time/organization-time.service';
import { RelativeDateService } from '../date-time/relative-date.service';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityService } from '../availability/availability.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { formatInTimeZone } from '../common/utils/time.util';
import { normalizeTimePreference } from '../common/utils/time-preference.util';
import {
  extractMessage,
  extractToolCalls,
  getToolArguments,
  getToolCallId,
  getToolName,
  parseBookAppointmentArgs,
  parseCheckAvailabilityArgs,
} from './vapi.parser';
import {
  VapiToolResponse,
  VapiWebhookPayload,
} from './vapi.types';

@Injectable()
export class VapiService {
  private readonly logger = new Logger(VapiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
    private readonly appointmentsService: AppointmentsService,
    private readonly organizationTime: OrganizationTimeService,
    private readonly relativeDateService: RelativeDateService,
    private readonly nextAvailabilityService: NextAvailabilityService,
  ) {}

  async handleTools(payload: VapiWebhookPayload): Promise<VapiToolResponse> {
    const message = extractMessage(payload);
    const toolCalls = extractToolCalls(message);
    const results = [];

    for (const toolCall of toolCalls) {
      const toolCallId = getToolCallId(toolCall);
      const name = getToolName(toolCall);
      const args = getToolArguments(toolCall);

      try {
        let result: Record<string, unknown>;
        if (name === 'get_current_datetime') {
          result = await this.getCurrentDateTime(args);
        } else if (name === 'resolve_appointment_date') {
          result = await this.resolveAppointmentDate(args);
        } else if (name === 'check_appointment_availability') {
          result = await this.checkAvailability(args);
        } else if (name === 'find_next_available_appointment') {
          result = await this.findNextAvailableAppointment(args);
        } else if (name === 'book_appointment') {
          result = await this.bookAppointment(args);
        } else {
          result = {
            success: false,
            error: `Unsupported tool: ${name || 'unknown'}`,
          };
        }
        results.push({ toolCallId, result });
      } catch (error) {
        const messageText =
          error instanceof Error ? error.message : 'Unexpected tool error';
        this.logger.warn(`Tool ${name} failed: ${messageText}`);
        results.push({
          toolCallId,
          result: {
            success: false,
            error: messageText,
          },
        });
      }
    }

    return { results };
  }

  async handleWebhook(payload: VapiWebhookPayload): Promise<{ ok: true; type: string }> {
    const message = extractMessage(payload);
    const type = message.type ?? 'unknown';
    const callId = message.call?.id;

    if (!callId) {
      this.logger.warn(`Vapi webhook without call id (type=${type})`);
      return { ok: true, type };
    }

    if (
      type === 'status-update' ||
      type === 'transcript' ||
      type === 'end-of-call-report'
    ) {
      await this.upsertVoiceCall(message, type);
      return { ok: true, type };
    }

    this.logger.log(`Acknowledging unknown Vapi event type: ${type}`);
    await this.upsertVoiceCall(message, type);
    return { ok: true, type };
  }

  private async getCurrentDateTime(rawArgs: Record<string, unknown>) {
    const organizationSlug =
      typeof rawArgs.organizationSlug === 'string' ? rawArgs.organizationSlug.trim() : '';
    if (!organizationSlug) {
      return { success: false, error: 'organizationSlug is required' };
    }
    const callerTimezone =
      typeof rawArgs.timezone === 'string' ? rawArgs.timezone.trim() : undefined;
    const context = await this.organizationTime.getTimeContext(organizationSlug, {
      callerTimezone: callerTimezone || undefined,
    });
    return {
      success: true,
      organizationName: context.organization.name,
      organizationTimezone: context.organization.timezone,
      currentUtc: context.current.utc,
      currentLocalDate: context.current.localDate,
      currentLocalTime: context.current.localTime,
      formattedLocalDate: context.current.formattedDate,
      formattedLocalTime: context.current.formattedTime,
      dayName: context.current.dayName,
      dayOfWeek: context.current.dayOfWeek,
      utcOffset: context.current.utcOffset,
      today: context.relativeDates.today.date,
      tomorrow: context.relativeDates.tomorrow.date,
      dayAfterTomorrow: context.relativeDates.dayAfterTomorrow.date,
    };
  }

  private async resolveAppointmentDate(rawArgs: Record<string, unknown>) {
    const organizationSlug =
      typeof rawArgs.organizationSlug === 'string' ? rawArgs.organizationSlug.trim() : '';
    const dateExpression =
      typeof rawArgs.dateExpression === 'string' ? rawArgs.dateExpression.trim() : '';
    if (!organizationSlug || !dateExpression) {
      return {
        success: false,
        clarificationRequired: true,
        message: 'organizationSlug and dateExpression are required',
      };
    }
    const timezone =
      typeof rawArgs.timezone === 'string' ? rawArgs.timezone.trim() : undefined;
    const resolved = await this.relativeDateService.resolveExpression({
      organizationSlug,
      expression: dateExpression,
      timezone,
    });
    if (!resolved.success) {
      return resolved;
    }
    return {
      success: true,
      dateExpression,
      resolvedDate: resolved.resolvedDate,
      formattedDate: resolved.formattedDate,
      dayName: resolved.dayName,
      timezone: resolved.timezone,
      currentLocalDate: resolved.reference.currentLocalDate,
    };
  }

  private async findNextAvailableAppointment(rawArgs: Record<string, unknown>) {
    const organizationSlug =
      typeof rawArgs.organizationSlug === 'string' ? rawArgs.organizationSlug.trim() : '';
    const serviceName =
      typeof rawArgs.serviceName === 'string' ? rawArgs.serviceName.trim() : '';
    if (!organizationSlug || !serviceName) {
      return {
        success: false,
        error: 'organizationSlug and serviceName are required',
        options: [],
      };
    }
    const daysRaw = rawArgs.daysToSearch;
    const daysToSearch =
      typeof daysRaw === 'number'
        ? daysRaw
        : typeof daysRaw === 'string' && daysRaw.trim()
          ? Number(daysRaw)
          : undefined;
    return this.nextAvailabilityService.findNextAvailable({
      organizationSlug,
      serviceName,
      preferredProviderName:
        typeof rawArgs.preferredProviderName === 'string'
          ? rawArgs.preferredProviderName.trim()
          : undefined,
      locationName:
        typeof rawArgs.locationName === 'string' ? rawArgs.locationName.trim() : undefined,
      startDate: typeof rawArgs.startDate === 'string' ? rawArgs.startDate.trim() : undefined,
      timePreference:
        typeof rawArgs.timePreference === 'string' ? rawArgs.timePreference : undefined,
      timezone: typeof rawArgs.timezone === 'string' ? rawArgs.timezone.trim() : undefined,
      daysToSearch: Number.isFinite(daysToSearch) ? daysToSearch : undefined,
    });
  }

  private async checkAvailability(rawArgs: Record<string, unknown>) {
    const parsed = parseCheckAvailabilityArgs(rawArgs);
    if ('dateResolutionRequired' in parsed) {
      return {
        success: false,
        dateResolutionRequired: true,
        message: parsed.message,
        options: [],
      };
    }
    if ('error' in parsed) {
      return { success: false, error: parsed.error, options: [] };
    }

    const organization = await this.availabilityService.resolveOrganization(
      parsed.organizationSlug,
    );

    const services = await this.prisma.service.findMany({
      where: {
        organizationId: organization.id,
        isActive: true,
        name: { equals: parsed.serviceName, mode: 'insensitive' },
      },
    });

    if (services.length === 0) {
      return {
        success: false,
        error: `No service found matching "${parsed.serviceName}"`,
        options: [],
      };
    }
    if (services.length > 1) {
      return {
        success: false,
        error: `Ambiguous service name "${parsed.serviceName}"`,
        matches: services.map((s) => ({ id: s.id, name: s.name })),
        options: [],
      };
    }

    const service = services[0];
    let locationId: string | undefined;
    let locationName: string | undefined;

    if (parsed.locationName) {
      const locations = await this.prisma.location.findMany({
        where: {
          organizationId: organization.id,
          isActive: true,
          name: { equals: parsed.locationName, mode: 'insensitive' },
        },
      });
      if (locations.length === 0) {
        return {
          success: false,
          error: `No location found matching "${parsed.locationName}"`,
          options: [],
        };
      }
      if (locations.length > 1) {
        return {
          success: false,
          error: `Ambiguous location name "${parsed.locationName}"`,
          matches: locations.map((l) => ({ id: l.id, name: l.name })),
          options: [],
        };
      }
      locationId = locations[0].id;
      locationName = locations[0].name;
    } else {
      const location = await this.prisma.location.findFirst({
        where: { organizationId: organization.id, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      if (!location) {
        return {
          success: false,
          error: 'No active location configured for this organization',
          options: [],
        };
      }
      locationId = location.id;
      locationName = location.name;
    }

    let providerId: string | undefined;
    if (parsed.preferredProviderName) {
      const providers = await this.prisma.provider.findMany({
        where: {
          organizationId: organization.id,
          isActive: true,
          name: { equals: parsed.preferredProviderName, mode: 'insensitive' },
          providerServices: {
            some: { serviceId: service.id, isActive: true },
          },
        },
      });
      if (providers.length === 0) {
        return {
          success: false,
          error: `No provider found matching "${parsed.preferredProviderName}" for this service`,
          options: [],
        };
      }
      if (providers.length > 1) {
        return {
          success: false,
          error: `Ambiguous provider name "${parsed.preferredProviderName}"`,
          matches: providers.map((p) => ({ id: p.id, name: p.name })),
          options: [],
        };
      }
      providerId = providers[0].id;
    }

    const timezone = organization.timezone;
    if (parsed.timezone) {
      this.organizationTime.assertValidTimezone(parsed.timezone);
    }
    const timeContext = await this.organizationTime.getTimeContext(parsed.organizationSlug);
    const leadMinutes = this.nextAvailabilityService.getMinimumBookingLeadMinutes();
    const now = this.organizationTime.nowUtc();

    let slots;
    try {
      slots = await this.availabilityService.getAvailableSlots({
        organizationIdOrSlug: organization.id,
        serviceId: service.id,
        locationId,
        providerId,
        date: parsed.date,
        timezone,
        now,
        minimumBookingLeadMinutes: leadMinutes,
      });
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : 'Availability calculation failed';
      this.logger.error(`Availability calculation failed: ${messageText}`);
      return {
        success: false,
        available: false,
        error: messageText,
        message: 'Unable to calculate appointment availability due to an internal error.',
        service: { id: service.id, name: service.name },
        location: { id: locationId, name: locationName },
        options: [],
      };
    }

    const filtered = this.availabilityService.filterSlotsByTimePreference(
      slots,
      parsed.timePreference ?? normalizeTimePreference('any'),
      timezone,
    );

    const enriched = this.nextAvailabilityService.enrichAvailabilityOptions(filtered, {
      serviceName: service.name,
      locationId,
      locationName: locationName ?? '',
      timezone,
      requestedDate: parsed.date,
      currentLocalDate: timeContext.current.localDate,
      currentLocalTime: timeContext.current.localTime,
    });

    if (filtered.length === 0) {
      return {
        success: true,
        message: 'No available appointment slots match that request.',
        service: { id: service.id, name: service.name },
        location: { id: locationId, name: locationName },
        ...enriched,
        available: false,
        options: [],
      };
    }

    return {
      success: true,
      message: 'Available appointment slots were found.',
      service: { id: service.id, name: service.name },
      location: { id: locationId, name: locationName },
      ...enriched,
      available: true,
    };
  }

  private async bookAppointment(rawArgs: Record<string, unknown>) {
    const parsed = parseBookAppointmentArgs(rawArgs);
    if ('error' in parsed) {
      return { success: false, error: parsed.error };
    }

    try {
      const appointment = await this.appointmentsService.create(parsed.organizationSlug, {
        locationId: parsed.locationId,
        providerId: parsed.providerId,
        serviceId: parsed.serviceId,
        scheduledStart: parsed.scheduledStart,
        timezone: parsed.timezone,
        customer: {
          name: parsed.customerName,
          phone: parsed.customerPhone,
          email: parsed.customerEmail,
        },
        reason: parsed.reason,
        source: AppointmentSource.VOICE,
        externalRequestId: parsed.externalRequestId,
      });

      const localDateTime = formatInTimeZone(
        new Date(appointment.scheduledStart),
        appointment.timezone,
      );

      return {
        success: true,
        confirmationCode: appointment.confirmationCode,
        provider: appointment.provider.name,
        service: appointment.service.name,
        location: appointment.location.name,
        localDateTime,
        timezone: appointment.timezone,
        scheduledStart: appointment.scheduledStart,
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        return {
          success: false,
          conflict: true,
          error: 'Selected slot is no longer available',
        };
      }
      throw error;
    }
  }

  private async upsertVoiceCall(message: import('./vapi.types').VapiMessage, type: string) {
    const callId = message.call?.id;
    if (!callId) {
      return;
    }

    const status = this.mapVoiceStatus(message.status ?? message.call?.status, type);
    const transcript = this.extractTranscript(message);
    const summary =
      typeof message.summary === 'string'
        ? message.summary
        : undefined;
    const endedReason =
      message.endedReason ?? message.call?.endedReason ?? undefined;

    const existing = await this.prisma.voiceCall.findUnique({
      where: { vapiCallId: callId },
    });

    const data = {
      status,
      customerPhone: message.call?.customer?.number ?? existing?.customerPhone ?? null,
      transcript: transcript ?? existing?.transcript ?? null,
      summary: summary ?? existing?.summary ?? null,
      endedReason: endedReason ?? existing?.endedReason ?? null,
      startedAt: message.call?.startedAt
        ? new Date(message.call.startedAt)
        : existing?.startedAt ?? (type === 'status-update' ? new Date() : null),
      endedAt: message.call?.endedAt
        ? new Date(message.call.endedAt)
        : type === 'end-of-call-report'
          ? new Date()
          : existing?.endedAt ?? null,
      metadata: {
        lastEventType: type,
        callStatus: message.status ?? message.call?.status ?? null,
      },
    };

    if (existing) {
      await this.prisma.voiceCall.update({
        where: { id: existing.id },
        data,
      });
      return;
    }

    await this.prisma.voiceCall.create({
      data: {
        vapiCallId: callId,
        ...data,
        status: data.status ?? VoiceCallStatus.STARTED,
      },
    });
  }

  private mapVoiceStatus(
    status: string | undefined,
    type: string,
  ): VoiceCallStatus {
    const normalized = (status ?? '').toLowerCase();
    if (type === 'end-of-call-report' || normalized === 'ended') {
      return VoiceCallStatus.COMPLETED;
    }
    if (normalized.includes('fail')) {
      return VoiceCallStatus.FAILED;
    }
    if (normalized === 'in-progress' || normalized === 'in_progress' || type === 'transcript') {
      return VoiceCallStatus.IN_PROGRESS;
    }
    return VoiceCallStatus.STARTED;
  }

  private extractTranscript(message: import('./vapi.types').VapiMessage): string | undefined {
    if (typeof message.transcript === 'string' && message.transcript.trim()) {
      return message.transcript;
    }
    if (Array.isArray(message.transcript)) {
      return message.transcript
        .map((entry) => {
          const role = entry.role ?? 'unknown';
          const text = entry.message ?? entry.transcript ?? '';
          return `${role}: ${text}`;
        })
        .join('\n');
    }
    if (typeof message.artifact?.transcript === 'string') {
      return message.artifact.transcript;
    }
    if (Array.isArray(message.artifact?.messages)) {
      return message.artifact.messages
        .map((entry) => {
          const role = entry.role ?? 'unknown';
          const text = entry.message ?? entry.content ?? '';
          return `${role}: ${text}`;
        })
        .join('\n');
    }
    return undefined;
  }
}

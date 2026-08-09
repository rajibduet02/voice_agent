import { normalizeTimePreference } from '../common/utils/time-preference.util';
import { normalizeClinicDateInput } from '../common/utils/time.util';
import {
  BookAppointmentArgs,
  CheckAvailabilityArgs,
  VapiMessage,
  VapiToolCall,
  VapiWebhookPayload,
} from './vapi.types';

export function extractMessage(payload: VapiWebhookPayload): VapiMessage {
  if (payload.message && typeof payload.message === 'object') {
    return payload.message;
  }
  return payload as VapiMessage;
}

export function extractToolCalls(message: VapiMessage): VapiToolCall[] {
  if (Array.isArray(message.toolCallList) && message.toolCallList.length > 0) {
    return message.toolCallList;
  }
  if (Array.isArray(message.toolCalls) && message.toolCalls.length > 0) {
    return message.toolCalls;
  }
  return [];
}

export function getToolCallId(toolCall: VapiToolCall): string {
  return toolCall.id ?? toolCall.toolCallId ?? 'unknown';
}

export function getToolName(toolCall: VapiToolCall): string {
  return toolCall.function?.name ?? toolCall.name ?? '';
}

export function getToolArguments(toolCall: VapiToolCall): Record<string, unknown> {
  const raw =
    toolCall.function?.arguments ?? toolCall.parameters ?? toolCall.arguments ?? {};

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw;
  }

  return {};
}

export function parseCheckAvailabilityArgs(
  args: Record<string, unknown>,
):
  | CheckAvailabilityArgs
  | { error: string }
  | { dateResolutionRequired: true; message: string } {
  const organizationSlug = asNonEmptyString(args.organizationSlug);
  const serviceName = asNonEmptyString(args.serviceName);
  const rawDate = asNonEmptyString(args.date);
  const timezone = asNonEmptyString(args.timezone) ?? 'Asia/Dhaka';

  if (!organizationSlug || !serviceName || !rawDate) {
    return {
      error: 'organizationSlug, serviceName, and date are required',
    };
  }

  // Availability accepts concrete YYYY-MM-DD only. Relative phrases must use resolve_appointment_date.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return {
      dateResolutionRequired: true,
      message: 'Resolve the requested date before checking availability.',
    };
  }

  const date = normalizeClinicDateInput(rawDate, timezone);
  if (!date || date !== rawDate) {
    return {
      error: `date must be a valid YYYY-MM-DD calendar date (received "${rawDate}")`,
    };
  }

  return {
    organizationSlug,
    serviceName,
    preferredProviderName: asNonEmptyString(args.preferredProviderName),
    locationName: asNonEmptyString(args.locationName),
    date,
    timePreference: normalizeTimePreference(asNonEmptyString(args.timePreference)),
    timezone,
  };
}

export function parseBookAppointmentArgs(
  args: Record<string, unknown>,
): BookAppointmentArgs | { error: string } {
  const organizationSlug = asNonEmptyString(args.organizationSlug);
  const locationId = asNonEmptyString(args.locationId);
  const providerId = asNonEmptyString(args.providerId);
  const serviceId = asNonEmptyString(args.serviceId);
  const scheduledStart = asNonEmptyString(args.scheduledStart);
  const timezone = asNonEmptyString(args.timezone);
  const customerName = asNonEmptyString(args.customerName);
  const customerPhone = asNonEmptyString(args.customerPhone);

  if (
    !organizationSlug ||
    !locationId ||
    !providerId ||
    !serviceId ||
    !scheduledStart ||
    !timezone ||
    !customerName ||
    !customerPhone
  ) {
    return {
      error:
        'organizationSlug, locationId, providerId, serviceId, scheduledStart, timezone, customerName, and customerPhone are required',
    };
  }

  return {
    organizationSlug,
    locationId,
    providerId,
    serviceId,
    scheduledStart,
    timezone,
    customerName,
    customerPhone,
    customerEmail: asNonEmptyString(args.customerEmail),
    reason: asNonEmptyString(args.reason),
    externalRequestId: asNonEmptyString(args.externalRequestId),
  };
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

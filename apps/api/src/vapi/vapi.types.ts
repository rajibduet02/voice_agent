export interface VapiToolCallFunction {
  name?: string;
  arguments?: string | Record<string, unknown>;
}

export interface VapiToolCall {
  id?: string;
  toolCallId?: string;
  function?: VapiToolCallFunction;
  name?: string;
  parameters?: Record<string, unknown>;
  arguments?: Record<string, unknown>;
}

export interface VapiMessage {
  type?: string;
  toolCallList?: VapiToolCall[];
  toolCalls?: VapiToolCall[];
  call?: {
    id?: string;
    status?: string;
    customer?: { number?: string };
    startedAt?: string;
    endedAt?: string;
    endedReason?: string;
  };
  status?: string;
  transcript?: string | Array<{ role?: string; message?: string; transcript?: string }>;
  summary?: string;
  endedReason?: string;
  artifact?: {
    transcript?: string;
    messages?: Array<{ role?: string; message?: string; content?: string }>;
  };
  [key: string]: unknown;
}

export interface VapiWebhookPayload {
  message?: VapiMessage;
  [key: string]: unknown;
}

export interface VapiToolResultItem {
  toolCallId: string;
  result: Record<string, unknown>;
}

export interface VapiToolResponse {
  results: VapiToolResultItem[];
}

export interface CheckAvailabilityArgs {
  organizationSlug: string;
  serviceName: string;
  preferredProviderName?: string;
  locationName?: string;
  date: string;
  timePreference?: 'morning' | 'afternoon' | 'evening' | 'any';
  timezone?: string;
}

export interface BookAppointmentArgs {
  organizationSlug: string;
  locationId: string;
  providerId: string;
  serviceId: string;
  scheduledStart: string;
  timezone: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  reason?: string;
  externalRequestId?: string;
}

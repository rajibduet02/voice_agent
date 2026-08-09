import {
  CreateAssistantPayload,
  CreateFunctionToolPayload,
  VapiServerConfig,
} from './vapi-management.types';

export const VAPI_STABLE_ASSISTANT_NAME = 'CarePoint Appointment Assistant';

export const VAPI_STABLE_TOOL_NAMES = {
  currentDateTime: 'carepoint_get_current_datetime',
  resolveDate: 'carepoint_resolve_appointment_date',
  availability: 'carepoint_check_appointment_availability',
  nextAvailability: 'carepoint_find_next_available_appointment',
  booking: 'carepoint_book_appointment',
} as const;

export const VAPI_LLM_FUNCTION_NAMES = {
  currentDateTime: 'get_current_datetime',
  resolveDate: 'resolve_appointment_date',
  availability: 'check_appointment_availability',
  nextAvailability: 'find_next_available_appointment',
  booking: 'book_appointment',
} as const;

export const VAPI_SERVER_EVENTS = [
  'status-update',
  'transcript',
  'end-of-call-report',
] as const;

export const ASSISTANT_FIRST_MESSAGE =
  'Hello, I’m the CarePoint appointment assistant. I can help you find a doctor and book an appointment. What type of consultation do you need?';

export const ASSISTANT_SYSTEM_PROMPT = `You are CarePoint Clinic’s appointment-booking voice assistant.

Your job is to help callers find and book appointments. You do not provide medical diagnoses, prescriptions, treatment recommendations, or emergency medical advice.

TIME AND DATE AUTHORITY

- CarePoint Clinic’s scheduling timezone is Asia/Dhaka.
- Never assume the current date or time from your own model knowledge.
- Never calculate “today,” “tomorrow,” weekdays, or relative dates without using the provided date tools.
- The backend is the authoritative source for the current date, current time, clinic timezone, and resolved calendar date.
- Never use the caller’s device timezone as the clinic scheduling timezone.
- Dates passed to availability tools must always use YYYY-MM-DD.
- Appointment timestamps returned by tools are authoritative.
- Speak appointment times using the timezone returned by the tool.

CONVERSATION STYLE

- Be friendly, professional, and concise.
- Ask one question at a time.
- Keep voice responses short and natural.
- Do not repeat the same question unnecessarily.
- Confirm important details before booking.
- Do not claim that an appointment is available or booked unless a tool confirms it.

BOOKING FLOW

1. Identify the service the caller needs.
2. Ask whether they have a preferred doctor.
3. Ask for their preferred date.
4. Ask for their preferred time period: morning, afternoon, evening, or anytime.
5. Check availability.
6. Offer no more than three appointment options verbally.
7. After the caller selects a slot, collect full name and phone number.
8. Email and appointment reason are optional.
9. Read back service, doctor, clinic location, exact date, exact local time, timezone, caller name, and caller phone number.
10. Ask for explicit confirmation.
11. Call book_appointment only after explicit confirmation.
12. Never claim the appointment is booked before the booking tool returns success.
13. Provide the confirmation code after successful booking.

RELATIVE DATES

- When the caller says “today,” “tomorrow,” “day after tomorrow,” “this Sunday,” “next Monday,” or another relative date, call resolve_appointment_date.
- Use the resolvedDate returned by that tool.
- Do not calculate the date yourself.
- Do not send relative date phrases to check_appointment_availability.
- If the date resolver says clarification is required, ask the caller for a specific date.
- Repeat the resolved date naturally before checking availability when this helps avoid misunderstanding.

CURRENT DATE AND TIME

- Call get_current_datetime when the current clinic date or time is needed.
- Call it when the caller asks what today’s date is, what time it is at the clinic, whether a requested time has already passed, or relative-date context is uncertain.
- Do not invent the current date or time.

AVAILABILITY

- Call check_appointment_availability only with a concrete YYYY-MM-DD date, the clinic timezone, the requested service, optional preferred doctor, optional location, and normalized time preference.
- Never invent a slot.
- Only offer slots returned by the tool.
- Verbally offer no more than three options at a time.
- Include the doctor, date, and local time.
- If no slots exist for the requested date, do not describe it as a system error.

NEXT AVAILABLE APPOINTMENT

- When the caller says “next available,” “earliest appointment,” “another day,” “whenever available,” or “find the next appointment,” call find_next_available_appointment.
- Also use find_next_available_appointment when the selected date has no availability and the caller agrees to another date.
- Do not repeatedly guess and check random dates.
- Offer up to three returned options.
- Tell the caller the exact resolved date and local time.

TIME PREFERENCES

- “anything,” “anytime,” “no preference,” and “whenever” mean any.
- “before noon” means morning.
- “after lunch” means afternoon.
- Ask for clarification when the requested time is ambiguous.

BOOKING SAFETY

- Use the IDs and timestamps returned by the availability tool.
- Do not construct provider IDs, location IDs, service IDs, or UTC timestamps yourself.
- Do not modify a returned startTime.
- If booking reports that the slot is no longer available, apologize and check for alternatives.
- Never call book_appointment without explicit caller confirmation.
- Never say “confirmed” until the booking tool reports success.

PRIVACY

Collect only information needed to schedule the appointment. Do not ask for medical history, diagnosis, prescription details, insurance number, payment card information, government identification, or other unnecessary sensitive data.

EMERGENCIES

If the caller describes an urgent medical emergency, tell them to contact their local emergency service or healthcare provider immediately. Do not continue ordinary appointment booking as if it were sufficient emergency care.

FAILURES

- If a date tool fails, apologize briefly and ask the caller to provide a specific calendar date.
- If availability lookup fails technically, say that the schedule could not be checked right now.
- If there is genuinely no availability, say that no matching slots were found and offer to search for the next available appointment.
- Never present an internal system failure as “no availability.”

Default organizationSlug is carepoint-clinic. CarePoint is open Sunday through Thursday, 09:00–13:00 and 14:00–17:00 Asia/Dhaka. Friday and Saturday are closed.`;

type ToolMessage = {
  type: 'request-start' | 'request-failed';
  content: string;
};

function withMessages(
  payload: CreateFunctionToolPayload,
  start: string,
  failed: string,
): CreateFunctionToolPayload {
  return {
    ...payload,
    messages: [
      { type: 'request-start', content: start },
      { type: 'request-failed', content: failed },
    ] as ToolMessage[],
  };
}

export function buildServerConfig(
  url: string,
  credentialId?: string,
): VapiServerConfig {
  if (credentialId) {
    return { url, credentialId };
  }
  return { url };
}

export function buildCurrentDateTimeToolPayload(
  toolsUrl: string,
  credentialId?: string,
): CreateFunctionToolPayload {
  return withMessages(
    {
      type: 'function',
      async: false,
      function: {
        name: VAPI_LLM_FUNCTION_NAMES.currentDateTime,
        description: `[${VAPI_STABLE_TOOL_NAMES.currentDateTime}] Get CarePoint Clinic's authoritative current date and time in Asia/Dhaka. Call this instead of guessing the current date.`,
        parameters: {
          type: 'object',
          properties: {
            organizationSlug: {
              type: 'string',
              description: 'Organization slug. Use carepoint-clinic.',
            },
            timezone: {
              type: 'string',
              description:
                'Optional caller IANA timezone for context only. Never overrides clinic scheduling timezone.',
            },
          },
          required: ['organizationSlug'],
        },
      },
      server: buildServerConfig(toolsUrl, credentialId),
    },
    'Let me confirm the clinic’s current date and time.',
    'I couldn’t confirm the clinic time right now.',
  );
}

export function buildResolveDateToolPayload(
  toolsUrl: string,
  credentialId?: string,
): CreateFunctionToolPayload {
  return withMessages(
    {
      type: 'function',
      async: false,
      function: {
        name: VAPI_LLM_FUNCTION_NAMES.resolveDate,
        description: `[${VAPI_STABLE_TOOL_NAMES.resolveDate}] Resolve relative or natural-language dates such as tomorrow, next Monday, or August 10 into a concrete YYYY-MM-DD clinic date. Call this before check_appointment_availability for relative dates.`,
        parameters: {
          type: 'object',
          properties: {
            organizationSlug: {
              type: 'string',
              description: 'Organization slug. Use carepoint-clinic.',
            },
            dateExpression: {
              type: 'string',
              description:
                'Natural date expression such as tomorrow, next Monday, this Sunday, or August 10.',
            },
            timezone: {
              type: 'string',
              description: 'Optional IANA timezone context. Clinic timezone remains authoritative.',
            },
          },
          required: ['organizationSlug', 'dateExpression'],
        },
      },
      server: buildServerConfig(toolsUrl, credentialId),
    },
    'Let me confirm that date.',
    'I couldn’t resolve that date. Could you give me a specific date?',
  );
}

export function buildAvailabilityToolPayload(
  toolsUrl: string,
  credentialId?: string,
): CreateFunctionToolPayload {
  return withMessages(
    {
      type: 'function',
      async: false,
      function: {
        name: VAPI_LLM_FUNCTION_NAMES.availability,
        description: `[${VAPI_STABLE_TOOL_NAMES.availability}] Check available appointment slots. The date argument MUST be an exact YYYY-MM-DD value. Never pass today, tomorrow, next Monday, or other relative phrases. Call resolve_appointment_date first for relative dates.`,
        parameters: {
          type: 'object',
          properties: {
            organizationSlug: {
              type: 'string',
              description:
                'Organization slug. Use carepoint-clinic unless the caller specifies another clinic.',
            },
            serviceName: {
              type: 'string',
              description:
                'Service name such as General Consultation, Follow-up Consultation, or Cardiology Consultation.',
            },
            preferredProviderName: {
              type: 'string',
              description: 'Optional preferred doctor name, for example Dr. Sarah Khan.',
            },
            locationName: {
              type: 'string',
              description: 'Optional location name. Defaults to the main branch when omitted.',
            },
            date: {
              type: 'string',
              description:
                'Exact desired date in YYYY-MM-DD format only. Never pass relative phrases.',
            },
            timePreference: {
              type: 'string',
              enum: ['morning', 'afternoon', 'evening', 'any'],
              description: 'Preferred time of day.',
            },
            timezone: {
              type: 'string',
              description: 'IANA timezone. Default Asia/Dhaka for CarePoint.',
            },
          },
          required: ['organizationSlug', 'serviceName', 'date'],
        },
      },
      server: buildServerConfig(toolsUrl, credentialId),
    },
    'Let me check the schedule.',
    'I couldn’t check the schedule right now.',
  );
}

export function buildNextAvailabilityToolPayload(
  toolsUrl: string,
  credentialId?: string,
): CreateFunctionToolPayload {
  return withMessages(
    {
      type: 'function',
      async: false,
      function: {
        name: VAPI_LLM_FUNCTION_NAMES.nextAvailability,
        description: `[${VAPI_STABLE_TOOL_NAMES.nextAvailability}] Find the next available appointment by searching forward from today or an optional start date. Use for next available, earliest appointment, or when a chosen date has no slots.`,
        parameters: {
          type: 'object',
          properties: {
            organizationSlug: {
              type: 'string',
              description: 'Organization slug. Use carepoint-clinic.',
            },
            serviceName: {
              type: 'string',
              description: 'Service name such as General Consultation.',
            },
            preferredProviderName: {
              type: 'string',
              description: 'Optional preferred doctor name.',
            },
            locationName: {
              type: 'string',
              description: 'Optional location name.',
            },
            startDate: {
              type: 'string',
              description: 'Optional YYYY-MM-DD search start date.',
            },
            timePreference: {
              type: 'string',
              enum: ['morning', 'afternoon', 'evening', 'any'],
              description: 'Preferred time of day.',
            },
            timezone: {
              type: 'string',
              description: 'IANA timezone. Clinic timezone remains Asia/Dhaka.',
            },
            daysToSearch: {
              type: 'string',
              description: 'Optional number of days to search (default 30, max 60).',
            },
          },
          required: ['organizationSlug', 'serviceName'],
        },
      },
      server: buildServerConfig(toolsUrl, credentialId),
    },
    'Let me find the next available appointment.',
    'I couldn’t search future availability right now.',
  );
}

export function buildBookingToolPayload(
  toolsUrl: string,
  credentialId?: string,
): CreateFunctionToolPayload {
  return withMessages(
    {
      type: 'function',
      async: false,
      function: {
        name: VAPI_LLM_FUNCTION_NAMES.booking,
        description: `[${VAPI_STABLE_TOOL_NAMES.booking}] Book an appointment only after the caller explicitly confirms the doctor, service, date/time, name, and phone number.`,
        parameters: {
          type: 'object',
          properties: {
            organizationSlug: {
              type: 'string',
              description: 'Organization slug, usually carepoint-clinic.',
            },
            locationId: {
              type: 'string',
              description: 'Location UUID from an availability tool result.',
            },
            providerId: {
              type: 'string',
              description: 'Provider UUID from an availability tool result.',
            },
            serviceId: {
              type: 'string',
              description: 'Service UUID from an availability tool result.',
            },
            scheduledStart: {
              type: 'string',
              description: 'UTC ISO timestamp for the selected slot start.',
            },
            timezone: {
              type: 'string',
              description: 'IANA timezone used when offering the slot.',
            },
            customerName: {
              type: 'string',
              description: 'Caller full name.',
            },
            customerPhone: {
              type: 'string',
              description: 'Caller phone number in E.164 format when possible.',
            },
            customerEmail: {
              type: 'string',
              description: 'Optional email address.',
            },
            reason: {
              type: 'string',
              description: 'Optional short reason for the visit. Do not collect diagnoses.',
            },
            externalRequestId: {
              type: 'string',
              description: 'Optional idempotency key for this booking attempt.',
            },
          },
          required: [
            'organizationSlug',
            'locationId',
            'providerId',
            'serviceId',
            'scheduledStart',
            'timezone',
            'customerName',
            'customerPhone',
          ],
        },
      },
      server: buildServerConfig(toolsUrl, credentialId),
    },
    'I’m booking that appointment now.',
    'I couldn’t complete the booking.',
  );
}

export function buildAssistantPayload(params: {
  name: string;
  toolIds: string[];
  webhookUrl: string;
  credentialId?: string;
}): CreateAssistantPayload {
  return {
    name: params.name,
    firstMessage: ASSISTANT_FIRST_MESSAGE,
    model: {
      provider: 'openai',
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: ASSISTANT_SYSTEM_PROMPT,
        },
      ],
      toolIds: params.toolIds,
    },
    voice: {
      provider: 'vapi',
      voiceId: 'Elliot',
    },
    transcriber: {
      provider: 'deepgram',
      model: 'nova-2',
      language: 'en',
    },
    server: buildServerConfig(params.webhookUrl, params.credentialId),
    serverMessages: [...VAPI_SERVER_EVENTS],
  };
}

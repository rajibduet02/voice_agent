import { getNormalizedPublicEnv } from '@/lib/env/public-env';

export const ORGANIZATION_SLUG = getNormalizedPublicEnv().organizationSlug;

function getApiBaseUrl(): string {
  return getNormalizedPublicEnv().apiUrl;
}

export type Service = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  price: string | null;
  currency: string;
};

export type Provider = {
  id: string;
  name: string;
  providerType: string;
  specialty: string | null;
  biography: string | null;
  timezone: string;
  defaultLocationId: string | null;
};

export type Location = {
  id: string;
  name: string;
  city: string;
  timezone: string;
  addressLine1: string;
  countryCode: string;
};

export type AvailableSlot = {
  providerId: string;
  providerName: string;
  serviceId: string;
  startTime: string;
  endTime: string;
  displayStart: string;
  timezone: string;
};

export type AppointmentConfirmation = {
  id: string;
  confirmationCode: string;
  status: string;
  source: string;
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

export type CalendarAppointmentStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'NO_SHOW';

export type CalendarAppointmentItem = {
  id: string;
  confirmationCode: string;
  scheduledStart: string;
  scheduledEnd: string;
  timezone: string;
  status: CalendarAppointmentStatus;
  source: string;
  customer: { name: string };
  provider: { id: string; name: string; specialty: string | null };
  service: { id: string; name: string };
  location: { id: string; name: string };
};

export type CalendarAppointmentsResponse = {
  appointments: CalendarAppointmentItem[];
  range: {
    start: string;
    end: string;
    timezone: string;
  };
};

export type ServicesResponse = {
  organization: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    slotIntervalMinutes: number;
  };
  defaultLocation: Location | null;
  services: Service[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const apiUrl = getApiBaseUrl();
  if (!apiUrl) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(
        '[api] NEXT_PUBLIC_API_URL is not configured. Set it in apps/web/.env for local development, or in the hosting provider env for deployments.',
      );
    }
    throw new Error('Unable to load appointment services. Please try again.');
  }

  const url = `${apiUrl}${path.startsWith('/') ? path : `/${path}`}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      cache: 'no-store',
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[api] Network request failed', { url, error });
    }
    throw new Error('Unable to load appointment services. Please try again.');
  }

  const body = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
    error?: string;
  };

  if (!response.ok) {
    const message = Array.isArray(body.message)
      ? body.message.join(', ')
      : body.message || body.error || `Request failed (${response.status})`;
    if (process.env.NODE_ENV !== 'production') {
      console.error('[api] Upstream error', { url, status: response.status, message });
    }
    throw new Error(message);
  }

  return body as T;
}

export const api = {
  getServices(organizationSlug = ORGANIZATION_SLUG) {
    return request<ServicesResponse>(`/api/v1/public/${organizationSlug}/services`);
  },

  getProviders(serviceId: string, organizationSlug = ORGANIZATION_SLUG) {
    const params = new URLSearchParams({ serviceId });
    return request<Provider[]>(
      `/api/v1/public/${organizationSlug}/providers?${params.toString()}`,
    );
  },

  getAvailability(
    params: {
      serviceId: string;
      locationId: string;
      providerId?: string;
      date: string;
      timezone?: string;
    },
    organizationSlug = ORGANIZATION_SLUG,
  ) {
    const search = new URLSearchParams({
      serviceId: params.serviceId,
      locationId: params.locationId,
      date: params.date,
    });
    if (params.providerId) {
      search.set('providerId', params.providerId);
    }
    if (params.timezone) {
      search.set('timezone', params.timezone);
    }
    return request<{ timezone: string; slots: AvailableSlot[] }>(
      `/api/v1/public/${organizationSlug}/availability?${search.toString()}`,
    );
  },

  createAppointment(
    payload: {
      locationId: string;
      providerId: string;
      serviceId: string;
      scheduledStart: string;
      timezone: string;
      customer: { name: string; phone: string; email?: string };
      reason?: string;
      source?: 'WEB' | 'VOICE' | 'ADMIN';
      externalRequestId?: string;
    },
    organizationSlug = ORGANIZATION_SLUG,
  ) {
    return request<AppointmentConfirmation>(
      `/api/v1/public/${organizationSlug}/appointments`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  /**
   * Read-only calendar feed via the same-origin Next.js proxy.
   * Never call the NestJS admin endpoint directly from the browser.
   */
  async getCalendarAppointments(
    params: {
      start: string;
      end: string;
      providerId?: string;
      serviceId?: string;
      locationId?: string;
      status?: CalendarAppointmentStatus;
      timezone?: string;
      organizationSlug?: string;
    },
    init?: { signal?: AbortSignal },
  ): Promise<CalendarAppointmentsResponse> {
    const search = new URLSearchParams({
      start: params.start,
      end: params.end,
    });
    if (params.providerId) search.set('providerId', params.providerId);
    if (params.serviceId) search.set('serviceId', params.serviceId);
    if (params.locationId) search.set('locationId', params.locationId);
    if (params.status) search.set('status', params.status);
    if (params.timezone) search.set('timezone', params.timezone);
    if (params.organizationSlug) search.set('organizationSlug', params.organizationSlug);

    const response = await fetch(`/api/internal/appointments/calendar?${search.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: init?.signal,
    });

    const body = (await response.json().catch(() => ({}))) as {
      message?: string | string[];
      error?: string;
      appointments?: CalendarAppointmentItem[];
      range?: CalendarAppointmentsResponse['range'];
    };

    if (!response.ok) {
      const message = Array.isArray(body.message)
        ? body.message.join(', ')
        : body.message || body.error || `Request failed (${response.status})`;
      throw new Error(message);
    }

    return body as CalendarAppointmentsResponse;
  },
};

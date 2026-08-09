export interface AvailabilityQuery {
  organizationIdOrSlug: string;
  serviceId: string;
  locationId: string;
  providerId?: string;
  date: string;
  timezone: string;
  /** Injectable clock instant for tests / lead-time filtering. */
  now?: Date;
  /** Minimum minutes from now before a slot may be offered. Default 0 when unset. */
  minimumBookingLeadMinutes?: number;
}

export interface AvailableSlot {
  providerId: string;
  providerName: string;
  specialty: string | null;
  serviceId: string;
  startTime: string;
  endTime: string;
  displayStart: string;
  timezone: string;
}

export interface ResolvedDuration {
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
}

export interface AvailabilityAuditBreakdown {
  organization: { id: string; name: string; slug: string; timezone: string };
  service: { id: string; name: string; durationMinutes: number };
  location: { id: string; name: string };
  requestedDate: string;
  localWeekday: number;
  localWeekdayName: string;
  timezone: string;
  eligibleProviders: Array<{ id: string; name: string }>;
  matchingRules: number;
  exceptions: number;
  conflictingAppointments: number;
  candidateSlots: number;
  afterPreferenceFilter: number;
  afterConflictFilter: number;
  finalSlots: AvailableSlot[];
}

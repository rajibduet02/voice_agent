export type AppointmentStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'NO_SHOW';

export type CalendarAppointment = {
  id: string;
  confirmationCode: string;
  scheduledStart: string;
  scheduledEnd: string;
  timezone: string;
  status: AppointmentStatus;
  source: string;
  customer: { name: string };
  provider: { id: string; name: string; specialty: string | null };
  service: { id: string; name: string };
  location: { id: string; name: string };
};

export type CalendarEventExtendedProps = {
  confirmationCode: string;
  customerName: string;
  providerName: string;
  specialty: string | null;
  serviceName: string;
  locationName: string;
  status: AppointmentStatus;
  source: string;
  timezone: string;
};

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: false;
  classNames: string[];
  extendedProps: CalendarEventExtendedProps;
};

export type StatusTone = 'warning' | 'success' | 'danger' | 'primary' | 'neutral';

const STATUS_CLASS: Record<AppointmentStatus, string> = {
  PENDING: 'fc-event-status-pending',
  CONFIRMED: 'fc-event-status-confirmed',
  CANCELLED: 'fc-event-status-cancelled',
  COMPLETED: 'fc-event-status-completed',
  NO_SHOW: 'fc-event-status-no-show',
};

const STATUS_TONE: Record<AppointmentStatus, StatusTone> = {
  PENDING: 'warning',
  CONFIRMED: 'success',
  CANCELLED: 'danger',
  COMPLETED: 'primary',
  NO_SHOW: 'neutral',
};

export function getStatusTone(status: AppointmentStatus): StatusTone {
  return STATUS_TONE[status] ?? 'neutral';
}

export function getStatusClassName(status: AppointmentStatus): string {
  return STATUS_CLASS[status] ?? 'fc-event-status-completed';
}

export function formatEventTitle(appointment: CalendarAppointment): string {
  return `${appointment.provider.name} — ${appointment.service.name}`;
}

export function mapAppointmentToEvent(appointment: CalendarAppointment): CalendarEvent {
  return {
    id: appointment.id,
    title: formatEventTitle(appointment),
    start: appointment.scheduledStart,
    end: appointment.scheduledEnd,
    allDay: false,
    classNames: [getStatusClassName(appointment.status)],
    extendedProps: {
      confirmationCode: appointment.confirmationCode,
      customerName: appointment.customer.name,
      providerName: appointment.provider.name,
      specialty: appointment.provider.specialty,
      serviceName: appointment.service.name,
      locationName: appointment.location.name,
      status: appointment.status,
      source: appointment.source,
      timezone: appointment.timezone,
    },
  };
}

export function mapAppointmentsToEvents(
  appointments: CalendarAppointment[],
): CalendarEvent[] {
  return appointments.map(mapAppointmentToEvent);
}

/** Format an ISO UTC instant in a specific IANA timezone. */
export function formatInTimeZone(
  isoUtc: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    ...options,
  }).format(new Date(isoUtc));
}

export function formatAppointmentDate(isoUtc: string, timeZone: string): string {
  return formatInTimeZone(isoUtc, timeZone, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatAppointmentTime(isoUtc: string, timeZone: string): string {
  return formatInTimeZone(isoUtc, timeZone, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/** Local calendar day key (YYYY-MM-DD) for an instant in the given timezone. */
export function getDateKeyInTimeZone(isoUtc: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(isoUtc));
}

export function appointmentsForDate(
  appointments: CalendarAppointment[],
  dateKey: string,
  timeZone: string,
): CalendarAppointment[] {
  return appointments
    .filter((appointment) => getDateKeyInTimeZone(appointment.scheduledStart, timeZone) === dateKey)
    .sort(
      (a, b) =>
        new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime(),
    );
}

export function summarizeAppointments(
  appointments: CalendarAppointment[],
  timeZone: string,
  now = new Date(),
) {
  const todayKey = getDateKeyInTimeZone(now.toISOString(), timeZone);
  const nowMs = now.getTime();

  return {
    today: appointments.filter(
      (appointment) => getDateKeyInTimeZone(appointment.scheduledStart, timeZone) === todayKey,
    ).length,
    upcomingConfirmed: appointments.filter(
      (appointment) =>
        appointment.status === 'CONFIRMED' &&
        new Date(appointment.scheduledStart).getTime() >= nowMs,
    ).length,
    pending: appointments.filter((appointment) => appointment.status === 'PENDING').length,
    cancelled: appointments.filter((appointment) => appointment.status === 'CANCELLED').length,
  };
}

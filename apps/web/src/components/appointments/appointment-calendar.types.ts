import type {
  AppointmentStatus,
  CalendarAppointment,
  CalendarEvent,
} from '@/lib/appointments/calendar-utils';

export type {
  AppointmentStatus,
  CalendarAppointment,
  CalendarEvent,
};

export type CalendarFilters = {
  providerId: string;
  serviceId: string;
  locationId: string;
  status: AppointmentStatus | '';
};

export type CalendarAppointmentsResponse = {
  appointments: CalendarAppointment[];
  range: {
    start: string;
    end: string;
    timezone: string;
  };
};

export type FilterOption = {
  id: string;
  name: string;
  specialty?: string | null;
};

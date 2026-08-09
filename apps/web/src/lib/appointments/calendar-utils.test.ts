import { describe, expect, it } from 'vitest';
import {
  appointmentsForDate,
  formatAppointmentTime,
  getStatusClassName,
  getStatusTone,
  mapAppointmentToEvent,
  type CalendarAppointment,
} from './calendar-utils';

const sample: CalendarAppointment = {
  id: 'appt-1',
  confirmationCode: 'APT-7K4M2Q',
  scheduledStart: '2026-08-12T04:00:00.000Z',
  scheduledEnd: '2026-08-12T04:30:00.000Z',
  timezone: 'Asia/Dhaka',
  status: 'CONFIRMED',
  source: 'VOICE',
  customer: { name: 'John Doe' },
  provider: {
    id: 'prov-1',
    name: 'Dr. Sarah Khan',
    specialty: 'General Medicine',
  },
  service: { id: 'svc-1', name: 'General Consultation' },
  location: { id: 'loc-1', name: 'CarePoint Main Branch' },
};

describe('calendar-utils', () => {
  it('displays a UTC appointment in the requested timezone', () => {
    // 04:00 UTC is 10:00 AM in Asia/Dhaka (UTC+6).
    expect(formatAppointmentTime(sample.scheduledStart, 'Asia/Dhaka')).toMatch(/10:00/);
  });

  it('maps an appointment into a timed calendar event', () => {
    const event = mapAppointmentToEvent(sample);
    expect(event.id).toBe('appt-1');
    expect(event.title).toBe('Dr. Sarah Khan — General Consultation');
    expect(event.start).toBe(sample.scheduledStart);
    expect(event.end).toBe(sample.scheduledEnd);
    expect(event.allDay).toBe(false);
    expect(event.extendedProps.confirmationCode).toBe('APT-7K4M2Q');
    expect(event.extendedProps.customerName).toBe('John Doe');
    expect(event.extendedProps.status).toBe('CONFIRMED');
  });

  it('maps status styles correctly', () => {
    expect(getStatusTone('PENDING')).toBe('warning');
    expect(getStatusTone('CONFIRMED')).toBe('success');
    expect(getStatusTone('CANCELLED')).toBe('danger');
    expect(getStatusTone('COMPLETED')).toBe('primary');
    expect(getStatusTone('NO_SHOW')).toBe('neutral');
    expect(getStatusClassName('CONFIRMED')).toBe('fc-event-status-confirmed');
  });

  it('orders selected-day appointments by start time', () => {
    const later: CalendarAppointment = {
      ...sample,
      id: 'appt-2',
      scheduledStart: '2026-08-12T06:00:00.000Z',
      scheduledEnd: '2026-08-12T06:30:00.000Z',
    };
    const earlier: CalendarAppointment = {
      ...sample,
      id: 'appt-3',
      scheduledStart: '2026-08-12T03:00:00.000Z',
      scheduledEnd: '2026-08-12T03:30:00.000Z',
    };

    const ordered = appointmentsForDate([later, earlier, sample], '2026-08-12', 'Asia/Dhaka');
    expect(ordered.map((item) => item.id)).toEqual(['appt-3', 'appt-1', 'appt-2']);
  });
});

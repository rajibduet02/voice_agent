'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import {
  formatAppointmentTime,
  getStatusTone,
  type CalendarAppointment,
} from '@/lib/appointments/calendar-utils';

type AgendaProps = {
  dateKey: string | null;
  appointments: CalendarAppointment[];
  timezone: string;
  onSelect: (appointment: CalendarAppointment) => void;
};

export function SelectedDayAgenda({ dateKey, appointments, timezone, onSelect }: AgendaProps) {
  if (!dateKey) {
    return null;
  }

  return (
    <Card className="p-4">
      <CardTitle className="text-base">Agenda for {dateKey}</CardTitle>
      <CardDescription className="mt-1">
        Appointments for the selected date (read-only). Times shown in {timezone}.
      </CardDescription>

      {appointments.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No appointments on this date.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {appointments.map((appointment) => (
            <li key={appointment.id}>
              <button
                type="button"
                onClick={() => onSelect(appointment)}
                className="flex w-full flex-col gap-1 rounded-xl border border-border bg-elevated px-3 py-3 text-left transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {formatAppointmentTime(appointment.scheduledStart, timezone)} –{' '}
                    {formatAppointmentTime(appointment.scheduledEnd, timezone)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {appointment.provider.name} — {appointment.service.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{appointment.customer.name}</p>
                </div>
                <Badge tone={getStatusTone(appointment.status)}>
                  {appointment.status.replace('_', ' ')}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

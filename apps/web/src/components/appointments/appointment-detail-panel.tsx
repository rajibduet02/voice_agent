'use client';

import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  formatAppointmentDate,
  formatAppointmentTime,
  getStatusTone,
  type CalendarAppointment,
} from '@/lib/appointments/calendar-utils';

type DetailPanelProps = {
  appointment: CalendarAppointment | null;
  timezone: string;
  onClose: () => void;
};

export function AppointmentDetailPanel({ appointment, timezone, onClose }: DetailPanelProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const open = Boolean(appointment);

  useEffect(() => {
    if (!open) {
      return;
    }
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!appointment) {
    return null;
  }

  const displayTz = timezone || appointment.timezone;
  const tone = getStatusTone(appointment.status);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-stretch">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close appointment details"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex h-[min(88vh,720px)] w-full flex-col rounded-t-2xl border border-border bg-card shadow-[var(--shadow)] sm:h-full sm:max-w-md sm:rounded-none sm:rounded-l-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-foreground">
              Appointment details
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Read-only tracking view</p>
          </div>
          <Button
            ref={closeRef}
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 text-sm">
          <DetailRow label="Customer" value={appointment.customer.name} />
          <DetailRow label="Confirmation code" value={appointment.confirmationCode} />
          <div>
            <p className="text-muted-foreground">Status</p>
            <div className="mt-1">
              <Badge tone={tone}>{appointment.status.replace('_', ' ')}</Badge>
            </div>
          </div>
          <DetailRow label="Doctor" value={appointment.provider.name} />
          <DetailRow label="Specialty" value={appointment.provider.specialty || '—'} />
          <DetailRow label="Service" value={appointment.service.name} />
          <DetailRow label="Location" value={appointment.location.name} />
          <DetailRow
            label="Date"
            value={formatAppointmentDate(appointment.scheduledStart, displayTz)}
          />
          <DetailRow
            label="Start time"
            value={formatAppointmentTime(appointment.scheduledStart, displayTz)}
          />
          <DetailRow
            label="End time"
            value={formatAppointmentTime(appointment.scheduledEnd, displayTz)}
          />
          <DetailRow label="Timezone" value={displayTz} />
          <DetailRow label="Booking source" value={appointment.source} />
        </div>
      </aside>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium text-foreground">{value}</p>
    </div>
  );
}

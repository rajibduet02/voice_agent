'use client';

import { AppointmentConfirmation } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function ConfirmationStep({
  confirmation,
  onBookAnother,
}: {
  confirmation: AppointmentConfirmation;
  onBookAnother: () => void;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <p className="text-sm font-semibold uppercase tracking-wide text-success">Success</p>
      <h2 className="mt-2 text-2xl font-semibold text-foreground">Appointment confirmed</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Save your confirmation code for changes or cancellation.
      </p>

      <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-elevated p-3">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Confirmation code</dt>
          <dd className="mt-1 text-lg font-semibold text-primary">{confirmation.confirmationCode}</dd>
        </div>
        <div className="rounded-xl border border-border bg-elevated p-3">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Status</dt>
          <dd className="mt-1 font-semibold text-foreground">{confirmation.status}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Doctor</dt>
          <dd className="mt-1 text-foreground">{confirmation.provider.name}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Service</dt>
          <dd className="mt-1 text-foreground">{confirmation.service.name}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">When</dt>
          <dd className="mt-1 text-foreground">
            {new Date(confirmation.scheduledStart).toLocaleString(undefined, {
              timeZone: confirmation.timezone,
            })}{' '}
            ({confirmation.timezone})
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Location</dt>
          <dd className="mt-1 text-foreground">
            {confirmation.location.name}, {confirmation.location.city}
          </dd>
        </div>
      </dl>

      <Button className="mt-6" onClick={onBookAnother}>
        Book another appointment
      </Button>
    </Card>
  );
}

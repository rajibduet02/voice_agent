'use client';

import { AvailableSlot, Location, Service } from '@/lib/api';
import { FormField, TextInput } from '@/components/ui/form-field';

export function CustomerStep({
  name,
  phone,
  email,
  reason,
  onNameChange,
  onPhoneChange,
  onEmailChange,
  onReasonChange,
  selectedService,
  selectedSlot,
  location,
  timezone,
  errors,
}: {
  name: string;
  phone: string;
  email: string;
  reason: string;
  onNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  selectedService: Service | null;
  selectedSlot: AvailableSlot | null;
  location: Location | null;
  timezone: string;
  errors: { name?: string; phone?: string };
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-elevated p-4 text-sm">
        <p className="font-semibold text-foreground">Appointment summary</p>
        <dl className="mt-3 grid gap-2 text-muted-foreground sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide">Service</dt>
            <dd className="text-foreground">{selectedService?.name ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide">Doctor</dt>
            <dd className="text-foreground">{selectedSlot?.providerName ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide">When</dt>
            <dd className="text-foreground">
              {selectedSlot
                ? `${new Date(selectedSlot.startTime).toLocaleString(undefined, {
                    timeZone: selectedSlot.timezone,
                  })} (${selectedSlot.timezone})`
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide">Location</dt>
            <dd className="text-foreground">
              {location ? `${location.name}, ${location.city}` : '—'} ({timezone})
            </dd>
          </div>
        </dl>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Full name" htmlFor="customer-name" error={errors.name}>
          <TextInput
            id="customer-name"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            autoComplete="name"
            required
          />
        </FormField>
        <FormField label="Phone" htmlFor="customer-phone" error={errors.phone}>
          <TextInput
            id="customer-phone"
            value={phone}
            onChange={(event) => onPhoneChange(event.target.value)}
            placeholder="+8801..."
            autoComplete="tel"
            required
          />
        </FormField>
        <FormField label="Email (optional)" htmlFor="customer-email">
          <TextInput
            id="customer-email"
            type="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            autoComplete="email"
          />
        </FormField>
        <FormField label="Reason (optional)" htmlFor="customer-reason">
          <TextInput
            id="customer-reason"
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
          />
        </FormField>
      </div>
    </div>
  );
}

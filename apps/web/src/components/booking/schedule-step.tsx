'use client';

import { AvailableSlot } from '@/lib/api';
import { FormField, TextInput } from '@/components/ui/form-field';

export function ScheduleStep({
  date,
  onDateChange,
  slots,
  slotsState,
  selectedSlot,
  onSelectSlot,
  timezone,
}: {
  date: string;
  onDateChange: (value: string) => void;
  slots: AvailableSlot[];
  slotsState: 'idle' | 'loading' | 'error' | 'ready';
  selectedSlot: AvailableSlot | null;
  onSelectSlot: (slot: AvailableSlot) => void;
  timezone: string;
}) {
  return (
    <div className="space-y-5">
      <FormField label="Preferred date" htmlFor="booking-date" hint={`Timezone: ${timezone}`}>
        <TextInput
          id="booking-date"
          type="date"
          value={date}
          onChange={(event) => onDateChange(event.target.value)}
          required
        />
      </FormField>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Available times</p>
        {!date ? (
          <p className="text-sm text-muted-foreground">Choose a date to load open slots.</p>
        ) : null}
        {date && slotsState === 'loading' ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-16 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : null}
        {slotsState === 'error' ? (
          <p className="text-sm text-destructive">Unable to load availability.</p>
        ) : null}
        {slotsState === 'ready' && slots.length === 0 ? (
          <p className="rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
            No open slots for that date. Try another day or remove the doctor filter.
          </p>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2">
          {slots.map((slot) => {
            const selected =
              selectedSlot?.startTime === slot.startTime &&
              selectedSlot.providerId === slot.providerId;
            return (
              <button
                key={`${slot.providerId}-${slot.startTime}`}
                type="button"
                onClick={() => onSelectSlot(slot)}
                aria-pressed={selected}
                className={`rounded-xl border px-3 py-3 text-left text-sm transition ${
                  selected
                    ? 'border-primary bg-[color-mix(in_srgb,var(--primary)_12%,var(--card))]'
                    : 'border-border bg-card hover:bg-muted'
                }`}
              >
                <span className="block font-semibold text-foreground">
                  {new Date(slot.startTime).toLocaleTimeString(undefined, {
                    timeZone: slot.timezone,
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className="text-muted-foreground">{slot.providerName}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

'use client';

import { Button } from '@/components/ui/button';
import type { AppointmentStatus, CalendarFilters, FilterOption } from './appointment-calendar.types';

const STATUS_OPTIONS: AppointmentStatus[] = [
  'PENDING',
  'CONFIRMED',
  'CANCELLED',
  'COMPLETED',
  'NO_SHOW',
];

type FiltersProps = {
  filters: CalendarFilters;
  providers: FilterOption[];
  services: FilterOption[];
  locations: FilterOption[];
  onChange: (next: CalendarFilters) => void;
  onClear: () => void;
};

export function AppointmentCalendarFilters({
  filters,
  providers,
  services,
  locations,
  onChange,
  onClear,
}: FiltersProps) {
  const hasFilters =
    Boolean(filters.providerId) ||
    Boolean(filters.serviceId) ||
    Boolean(filters.locationId) ||
    Boolean(filters.status);

  return (
    <section
      aria-label="Appointment filters"
      className="grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow)] sm:grid-cols-2 lg:grid-cols-5"
    >
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">Doctor</span>
        <select
          className="rounded-xl border border-border bg-elevated px-3 py-2.5 text-foreground"
          value={filters.providerId}
          onChange={(event) => onChange({ ...filters, providerId: event.target.value })}
        >
          <option value="">All doctors</option>
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
              {provider.specialty ? ` (${provider.specialty})` : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">Service</span>
        <select
          className="rounded-xl border border-border bg-elevated px-3 py-2.5 text-foreground"
          value={filters.serviceId}
          onChange={(event) => onChange({ ...filters, serviceId: event.target.value })}
        >
          <option value="">All services</option>
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">Status</span>
        <select
          className="rounded-xl border border-border bg-elevated px-3 py-2.5 text-foreground"
          value={filters.status}
          onChange={(event) =>
            onChange({
              ...filters,
              status: event.target.value as AppointmentStatus | '',
            })
          }
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status.replace('_', ' ')}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">Location</span>
        <select
          className="rounded-xl border border-border bg-elevated px-3 py-2.5 text-foreground"
          value={filters.locationId}
          onChange={(event) => onChange({ ...filters, locationId: event.target.value })}
        >
          <option value="">All locations</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-end">
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={onClear}
          disabled={!hasFilters}
        >
          Clear filters
        </Button>
      </div>
    </section>
  );
}

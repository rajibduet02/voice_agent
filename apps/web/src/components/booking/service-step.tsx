'use client';

import { ReactNode } from 'react';
import { Service } from '@/lib/api';
import { Card } from '@/components/ui/card';

export function ServiceStep({
  services,
  selectedId,
  onSelect,
  loading,
  error,
}: {
  services: Service[];
  selectedId: string;
  onSelect: (id: string) => void;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-28 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="rounded-xl border border-border bg-[color-mix(in_srgb,var(--destructive)_12%,transparent)] px-4 py-3 text-sm text-destructive">
        {error}
      </p>
    );
  }

  if (services.length === 0) {
    return <p className="text-sm text-muted-foreground">No active services found. Run the database seed.</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {services.map((service) => {
        const selected = selectedId === service.id;
        return (
          <button
            key={service.id}
            type="button"
            onClick={() => onSelect(service.id)}
            className={`rounded-2xl border p-4 text-left transition ${
              selected
                ? 'border-primary bg-[color-mix(in_srgb,var(--primary)_12%,var(--card))]'
                : 'border-border bg-card hover:bg-muted'
            }`}
            aria-pressed={selected}
          >
            <p className="font-semibold text-foreground">{service.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{service.durationMinutes} minutes</p>
            {service.description ? (
              <p className="mt-2 text-sm text-muted-foreground">{service.description}</p>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function StepShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </Card>
  );
}

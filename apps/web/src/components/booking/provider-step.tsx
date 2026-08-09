'use client';

import { Provider } from '@/lib/api';

export function ProviderStep({
  providers,
  selectedId,
  onSelect,
  loading,
  error,
}: {
  providers: Provider[];
  selectedId: string;
  onSelect: (id: string) => void;
  loading: boolean;
  error: boolean;
}) {
  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1].map((item) => (
          <div key={item} className="h-24 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">Unable to load providers for this service.</p>;
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => onSelect('')}
        aria-pressed={selectedId === ''}
        className={`w-full rounded-2xl border p-4 text-left transition ${
          selectedId === ''
            ? 'border-primary bg-[color-mix(in_srgb,var(--primary)_12%,var(--card))]'
            : 'border-border bg-card hover:bg-muted'
        }`}
      >
        <p className="font-semibold text-foreground">Any available doctor</p>
        <p className="mt-1 text-sm text-muted-foreground">
          We’ll show open slots across all matching providers.
        </p>
      </button>

      <div className="grid gap-3 sm:grid-cols-2">
        {providers.map((provider) => {
          const selected = selectedId === provider.id;
          return (
            <button
              key={provider.id}
              type="button"
              onClick={() => onSelect(provider.id)}
              aria-pressed={selected}
              className={`rounded-2xl border p-4 text-left transition ${
                selected
                  ? 'border-primary bg-[color-mix(in_srgb,var(--primary)_12%,var(--card))]'
                  : 'border-border bg-card hover:bg-muted'
              }`}
            >
              <p className="font-semibold text-foreground">{provider.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {provider.specialty || provider.providerType}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

'use client';

type StatusIndicatorProps = {
  label: string;
  value: string;
};

export function StatusIndicator({ label, value }: StatusIndicatorProps) {
  return (
    <div className="rounded-xl border border-border bg-elevated px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

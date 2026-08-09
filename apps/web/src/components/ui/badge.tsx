import { HTMLAttributes } from 'react';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'primary';

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  success: 'bg-[color-mix(in_srgb,var(--success)_18%,transparent)] text-success',
  warning: 'bg-[color-mix(in_srgb,var(--warning)_18%,transparent)] text-warning',
  danger: 'bg-[color-mix(in_srgb,var(--destructive)_18%,transparent)] text-destructive',
  primary: 'bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] text-primary',
};

export function Badge({
  tone = 'neutral',
  className = '',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${toneClasses[tone]} ${className}`}
      {...props}
    />
  );
}

export function StatusBadge({
  status,
}: {
  status: 'Ready' | 'Connecting' | 'Listening' | 'Assistant speaking' | 'Call ended' | 'Error';
}) {
  const tone: Tone =
    status === 'Error'
      ? 'danger'
      : status === 'Connecting'
        ? 'warning'
        : status === 'Listening' || status === 'Assistant speaking'
          ? 'primary'
          : status === 'Call ended'
            ? 'success'
            : 'neutral';

  return (
    <Badge tone={tone} aria-live="polite">
      {status}
    </Badge>
  );
}

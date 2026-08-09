'use client';

import { AlertCircle, CheckCircle2, LoaderCircle, Mic } from 'lucide-react';

export type VoiceVisualStatus =
  | 'Ready'
  | 'Connecting'
  | 'Listening'
  | 'Assistant speaking'
  | 'Call ended'
  | 'Error';

export function VoiceVisualizer({
  status,
  error,
}: {
  status: VoiceVisualStatus;
  error?: string | null;
}) {
  const label =
    status === 'Ready'
      ? 'Ready when you are'
      : status === 'Connecting'
        ? 'Connecting to the assistant'
        : status === 'Listening'
          ? 'Listening…'
          : status === 'Assistant speaking'
            ? 'CarePoint is speaking'
            : status === 'Call ended'
              ? 'Conversation ended'
              : error || 'Something went wrong';

  return (
    <div className="flex flex-col items-center justify-center py-6 text-center">
      <div
        className={`relative flex h-36 w-36 items-center justify-center rounded-full border border-border bg-elevated shadow-[var(--shadow)] sm:h-44 sm:w-44 ${
          status === 'Listening' ? 'voice-pulse' : ''
        }`}
        aria-hidden
      >
        {status === 'Connecting' ? (
          <LoaderCircle className="spinner h-10 w-10 text-primary" />
        ) : status === 'Assistant speaking' ? (
          <div className="flex h-12 items-end gap-1.5">
            {[0, 1, 2, 3, 4].map((index) => (
              <span
                key={index}
                className="wave-bar w-1.5 rounded-full bg-primary"
                style={{
                  height: `${18 + (index % 3) * 10}px`,
                  animationDelay: `${index * 0.12}s`,
                }}
              />
            ))}
          </div>
        ) : status === 'Call ended' ? (
          <CheckCircle2 className="h-10 w-10 text-success" />
        ) : status === 'Error' ? (
          <AlertCircle className="h-10 w-10 text-destructive" />
        ) : (
          <Mic className="h-10 w-10 text-primary" />
        )}
      </div>
      <p className="mt-5 text-base font-semibold text-foreground" aria-live="polite">
        {label}
      </p>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Vapi from '@vapi-ai/web';
import { ShieldCheck, PhoneOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { StatusIndicator } from '@/components/voice/status-indicator';
import { Transcript, TranscriptItem } from '@/components/voice/transcript';
import { VoiceVisualizer, VoiceVisualStatus } from '@/components/voice/voice-visualizer';
import { isVapiConfigured, publicEnv } from '@/lib/env/public-env';

type CallStatus = VoiceVisualStatus;

type VapiMessageEvent = {
  type?: string;
  role?: string;
  transcriptType?: string;
  transcript?: string;
  message?: string;
};

const publicKey = publicEnv.vapiPublicKey;
const assistantId = publicEnv.vapiAssistantId;

function getConfigurationMessage(): string | null {
  if (isVapiConfigured()) {
    return null;
  }

  if (process.env.NODE_ENV === 'production') {
    return 'Voice assistant is temporarily unavailable.';
  }

  const missingPublicKey = !publicKey;
  const missingAssistantId = !assistantId;

  if (missingPublicKey && missingAssistantId) {
    return 'Vapi is not configured. NEXT_PUBLIC_VAPI_PUBLIC_KEY and NEXT_PUBLIC_VAPI_ASSISTANT_ID are missing. For local development set them in apps/web/.env, then restart the frontend. For deployments set them in the hosting provider environment variables and redeploy.';
  }
  if (missingPublicKey) {
    return 'NEXT_PUBLIC_VAPI_PUBLIC_KEY is not configured. For local development set it in apps/web/.env (never use the private key in the frontend). For deployments configure the hosting provider environment variables and redeploy.';
  }
  return 'NEXT_PUBLIC_VAPI_ASSISTANT_ID is not configured. For local development run npm run vapi:setup:web-env or set it in apps/web/.env. For deployments configure the hosting provider environment variables and redeploy.';
}

function formatTime(date = new Date()) {
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function VoiceAgent() {
  const vapiRef = useRef<Vapi | null>(null);
  const [status, setStatus] = useState<CallStatus>('Ready');
  const [error, setError] = useState<string | null>(null);
  const [micPermission, setMicPermission] = useState('Not checked');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [messages, setMessages] = useState<TranscriptItem[]>([]);
  const configurationMessage = getConfigurationMessage();
  const configured = configurationMessage === null;
  const callActive =
    status === 'Connecting' || status === 'Listening' || status === 'Assistant speaking';

  useEffect(() => {
    if (!configured) {
      return;
    }

    const vapi = new Vapi(publicKey);
    vapiRef.current = vapi;

    const onCallStart = () => {
      setStatus('Listening');
      setError(null);
    };
    const onCallEnd = () => {
      setStatus('Call ended');
      setInterimTranscript('');
    };
    const onSpeechStart = () => setStatus('Assistant speaking');
    const onSpeechEnd = () => setStatus('Listening');
    const onError = (err: unknown) => {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Voice assistant error';
      setError(message);
      setStatus('Error');
    };
    const onMessage = (message: VapiMessageEvent) => {
      if (message.type !== 'transcript') {
        return;
      }

      const role = message.role === 'assistant' ? 'assistant' : 'user';
      const text = (message.transcript ?? message.message ?? '').trim();
      if (!text) {
        return;
      }

      if (message.transcriptType === 'partial') {
        setInterimTranscript(text);
        return;
      }

      if (message.transcriptType === 'final' || !message.transcriptType) {
        setInterimTranscript('');
        setMessages((current) => [
          ...current,
          {
            id: `${Date.now()}-${current.length}`,
            role,
            text,
            at: formatTime(),
          },
        ]);
      }
    };

    vapi.on('call-start', onCallStart);
    vapi.on('call-end', onCallEnd);
    vapi.on('speech-start', onSpeechStart);
    vapi.on('speech-end', onSpeechEnd);
    vapi.on('message', onMessage);
    vapi.on('error', onError);

    return () => {
      vapi.removeListener('call-start', onCallStart);
      vapi.removeListener('call-end', onCallEnd);
      vapi.removeListener('speech-start', onSpeechStart);
      vapi.removeListener('speech-end', onSpeechEnd);
      vapi.removeListener('message', onMessage);
      vapi.removeListener('error', onError);
      void vapi.stop();
      vapiRef.current = null;
    };
  }, [configured]);

  async function ensureMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicPermission('Microphone API unavailable in this browser');
      throw new Error('Microphone access is not available in this browser.');
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicPermission('Granted');
    } catch {
      setMicPermission('Denied');
      throw new Error('Microphone permission is required to start the voice assistant.');
    }
  }

  async function startCall() {
    if (!configured || !vapiRef.current) {
      setError('Vapi is not configured. Add the public key and assistant ID.');
      setStatus('Error');
      return;
    }

    try {
      setError(null);
      setStatus('Connecting');
      await ensureMicrophone();

      // Optional caller context only. Clinic scheduling timezone remains Asia/Dhaka on the backend.
      let assistantOverrides: { variableValues?: Record<string, string> } | undefined;
      try {
        const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const now = new Date();
        assistantOverrides = {
          variableValues: {
            browserTimezone: browserTimezone || '',
            browserLocale: typeof navigator !== 'undefined' ? navigator.language : '',
            browserCurrentDate: now.toISOString().slice(0, 10),
            browserCurrentTime: now.toISOString().slice(11, 19),
          },
        };
      } catch {
        assistantOverrides = undefined;
      }

      await vapiRef.current.start(assistantId, assistantOverrides);
    } catch (err) {
      setStatus('Error');
      setError(err instanceof Error ? err.message : 'Unable to start the call');
    }
  }

  function endCall() {
    vapiRef.current?.stop();
    setStatus('Call ended');
    setInterimTranscript('');
  }

  return (
    <div className="space-y-6">
      <section className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Book your doctor appointment by voice
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          Speak naturally with our appointment assistant to choose a service, find an available
          doctor, and confirm your visit.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden />
            Secure appointment scheduling
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <PhoneOff className="h-3.5 w-3.5 text-secondary" aria-hidden />
            No phone call required
          </span>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="p-5 sm:p-6">
          <CardHeader>
            <div>
              <CardTitle>Voice Assistant</CardTitle>
              <CardDescription className="mt-1">Powered by Vapi</CardDescription>
            </div>
            <StatusBadge status={status} />
          </CardHeader>

          {!configured && configurationMessage ? (
            <div className="mt-4 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
              {configurationMessage} Manual booking still works without these values.
            </div>
          ) : null}

          <VoiceVisualizer status={status} error={error} />

          <div className="mt-2 flex flex-wrap gap-3">
            <Button
              size="lg"
              onClick={() => void startCall()}
              disabled={!configured || callActive}
              aria-label="Start conversation"
            >
              Start Conversation
            </Button>
            <Button
              size="lg"
              variant="secondary"
              onClick={endCall}
              disabled={status === 'Ready' || status === 'Call ended'}
              aria-label="End conversation"
            >
              End Conversation
            </Button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <StatusIndicator label="Microphone" value={micPermission} />
            <StatusIndicator label="Connection" value={status} />
            <StatusIndicator label="Call status" value={callActive ? 'Active' : status} />
          </div>

          {error ? (
            <p
              className="mt-4 rounded-xl border border-[color-mix(in_srgb,var(--destructive)_35%,var(--border))] bg-[color-mix(in_srgb,var(--destructive)_12%,transparent)] px-4 py-3 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-5 rounded-xl border border-border bg-elevated px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            Privacy notice: this assistant only collects information needed to schedule an
            appointment (such as your name, phone number, preferred doctor, service, and time). It
            does not store medical diagnoses, prescriptions, or clinical records.
          </div>
        </Card>

        <Card className="flex min-h-[520px] flex-col p-5 sm:p-6">
          <Transcript messages={messages} interimTranscript={interimTranscript} />
          <p className="mt-4 text-sm text-muted-foreground">
            Prefer typing?{' '}
            <Link href="/book" className="font-semibold text-primary underline-offset-4 hover:underline">
              Book an appointment online
            </Link>
            .
          </p>
        </Card>
      </div>
    </div>
  );
}

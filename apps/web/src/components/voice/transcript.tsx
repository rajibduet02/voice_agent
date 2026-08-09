'use client';

import { useEffect, useRef } from 'react';
import { Bot, User } from 'lucide-react';

export type TranscriptItem = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  at?: string;
};

export function TranscriptMessage({ message }: { message: TranscriptItem }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`flex max-w-[92%] items-end gap-2 sm:max-w-[80%] ${
          isUser ? 'flex-row-reverse' : 'flex-row'
        }`}
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
          }`}
          aria-hidden
        >
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </span>
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-sm ${
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'border border-border bg-card text-card-foreground'
          }`}
        >
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-70">
            {isUser ? 'You' : 'Assistant'}
          </p>
          <p className="whitespace-pre-wrap leading-relaxed">{message.text}</p>
          {message.at ? <p className="mt-1 text-[11px] opacity-70">{message.at}</p> : null}
        </div>
      </div>
    </div>
  );
}

export function Transcript({
  messages,
  interimTranscript,
}: {
  messages: TranscriptItem[];
  interimTranscript: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, interimTranscript]);

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Live transcript
        </h3>
      </div>
      <div className="min-h-[280px] max-h-[420px] flex-1 space-y-3 overflow-y-auto rounded-2xl border border-border bg-elevated p-3 sm:p-4">
        {messages.length === 0 && !interimTranscript ? (
          <div className="flex h-full min-h-[240px] items-center justify-center px-4 text-center">
            <p className="max-w-sm text-sm text-muted-foreground">
              Final transcript messages will appear here once the conversation begins.
            </p>
          </div>
        ) : null}
        {messages.map((message) => (
          <TranscriptMessage key={message.id} message={message} />
        ))}
        {interimTranscript ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-2 text-sm italic text-muted-foreground">
            Interim: {interimTranscript}
          </p>
        ) : null}
        <div ref={endRef} />
      </div>
    </section>
  );
}

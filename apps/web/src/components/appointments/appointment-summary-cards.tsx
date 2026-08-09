'use client';

import { Card, CardDescription, CardTitle } from '@/components/ui/card';

type SummaryCardsProps = {
  today: number;
  upcomingConfirmed: number;
  pending: number;
  cancelled: number;
};

export function AppointmentSummaryCards({
  today,
  upcomingConfirmed,
  pending,
  cancelled,
}: SummaryCardsProps) {
  const cards = [
    { label: "Today's appointments", value: today },
    { label: 'Upcoming confirmed', value: upcomingConfirmed },
    { label: 'Pending', value: pending },
    { label: 'Cancelled', value: cancelled },
  ];

  return (
    <section aria-label="Calendar range summary" className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Calendar-range totals
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label} className="p-4">
            <CardDescription>{card.label}</CardDescription>
            <CardTitle className="mt-2 text-3xl tabular-nums">{card.value}</CardTitle>
          </Card>
        ))}
      </div>
    </section>
  );
}

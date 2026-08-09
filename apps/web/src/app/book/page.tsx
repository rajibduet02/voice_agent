import { BookingStepper } from '@/components/booking/booking-stepper';

export default function BookPage() {
  return (
    <main className="space-y-6">
      <section className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Book online
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          Choose a CarePoint service, pick an open slot, and confirm your visit. This page talks
          directly to the booking API.
        </p>
      </section>
      <BookingStepper />
    </main>
  );
}

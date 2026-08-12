'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  api,
  AppointmentConfirmation,
  AvailableSlot,
  Location,
  Provider,
  Service,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ConfirmationStep } from '@/components/booking/confirmation-step';
import { CustomerStep } from '@/components/booking/customer-step';
import { ProviderStep } from '@/components/booking/provider-step';
import { ScheduleStep } from '@/components/booking/schedule-step';
import { ServiceStep, StepShell } from '@/components/booking/service-step';

type LoadState = 'idle' | 'loading' | 'error' | 'ready';
type Step = 0 | 1 | 2 | 3;

const STEPS = ['Service', 'Doctor', 'Date & time', 'Your details'] as const;

export function BookingStepper() {
  const [step, setStep] = useState<Step>(0);
  const [servicesState, setServicesState] = useState<LoadState>('loading');
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [location, setLocation] = useState<Location | null>(null);
  const [timezone, setTimezone] = useState('Asia/Dhaka');

  const [serviceId, setServiceId] = useState('');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providersState, setProvidersState] = useState<LoadState>('idle');
  const [providersError, setProvidersError] = useState(false);
  const [providerId, setProviderId] = useState('');

  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [slotsState, setSlotsState] = useState<LoadState>('idle');
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; phone?: string }>({});

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<AppointmentConfirmation | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setServicesState('loading');
        const data = await api.getServices();
        if (cancelled) return;
        setServices(data.services);
        setLocation(data.defaultLocation);
        setTimezone(data.organization.timezone);
        setServicesState('ready');
      } catch (error) {
        if (cancelled) return;
        setServicesState('error');
        if (process.env.NODE_ENV !== 'production') {
          console.error('[book] Failed to load services', error);
        }
        setServicesError('Unable to load appointment services. Please try again.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!serviceId) {
      setProviders([]);
      setProviderId('');
      setProvidersState('idle');
      setProvidersError(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setProvidersState('loading');
        setProvidersError(false);
        const data = await api.getProviders(serviceId);
        if (cancelled) return;
        setProviders(data);
        setProviderId('');
        setProvidersState('ready');
      } catch {
        if (cancelled) return;
        setProviders([]);
        setProvidersState('error');
        setProvidersError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [serviceId]);

  useEffect(() => {
    if (!serviceId || !location || !date) {
      setSlots([]);
      setSelectedSlot(null);
      setSlotsState('idle');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setSlotsState('loading');
        const data = await api.getAvailability({
          serviceId,
          locationId: location.id,
          providerId: providerId || undefined,
          date,
          timezone,
        });
        if (cancelled) return;
        setSlots(data.slots);
        setSelectedSlot(null);
        setSlotsState('ready');
      } catch {
        if (cancelled) return;
        setSlots([]);
        setSlotsState('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [serviceId, location, date, providerId, timezone]);

  const selectedService = useMemo(
    () => services.find((service) => service.id === serviceId) ?? null,
    [services, serviceId],
  );

  function canContinue() {
    if (step === 0) return Boolean(serviceId);
    if (step === 1) return providersState === 'ready' || providersState === 'error';
    if (step === 2) return Boolean(selectedSlot);
    return true;
  }

  async function submitAppointment() {
    setSubmitError(null);
    const nextErrors: { name?: string; phone?: string } = {};
    if (!name.trim()) nextErrors.name = 'Name is required.';
    if (!phone.trim()) nextErrors.phone = 'Phone number is required.';
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    if (!location || !selectedService || !selectedSlot) {
      setSubmitError('Select a service, date, and available time slot.');
      return;
    }

    try {
      setSubmitting(true);
      const result = await api.createAppointment({
        locationId: location.id,
        providerId: selectedSlot.providerId,
        serviceId: selectedService.id,
        scheduledStart: selectedSlot.startTime,
        timezone: selectedSlot.timezone,
        customer: {
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
        },
        reason: reason.trim() || undefined,
        source: 'WEB',
      });
      setConfirmation(result);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Booking failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmation) {
    return (
      <ConfirmationStep
        confirmation={confirmation}
        onBookAnother={() => {
          setConfirmation(null);
          setSelectedSlot(null);
          setSlots((current) =>
            current.filter((slot) => slot.startTime !== confirmation.scheduledStart),
          );
          setStep(0);
          setName('');
          setPhone('');
          setEmail('');
          setReason('');
          setSubmitError(null);
          setFieldErrors({});
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Booking progress">
        {STEPS.map((label, index) => {
          const active = step === index;
          const complete = step > index;
          return (
            <li
              key={label}
              className={`rounded-xl border px-3 py-2 text-sm ${
                active
                  ? 'border-primary bg-[color-mix(in_srgb,var(--primary)_12%,var(--card))] text-primary'
                  : complete
                    ? 'border-border bg-card text-foreground'
                    : 'border-border bg-elevated text-muted-foreground'
              }`}
              aria-current={active ? 'step' : undefined}
            >
              <span className="block text-xs font-semibold uppercase tracking-wide">
                Step {index + 1}
              </span>
              <span className="font-medium">{label}</span>
            </li>
          );
        })}
      </ol>

      {step === 0 ? (
        <StepShell
          title="Choose a service"
          description="Select the consultation type that best matches your visit."
        >
          <ServiceStep
            services={services}
            selectedId={serviceId}
            onSelect={setServiceId}
            loading={servicesState === 'loading'}
            error={servicesError}
          />
        </StepShell>
      ) : null}

      {step === 1 ? (
        <StepShell
          title="Choose a doctor"
          description="Pick a preferred doctor or continue with any available provider."
        >
          <ProviderStep
            providers={providers}
            selectedId={providerId}
            onSelect={setProviderId}
            loading={providersState === 'loading'}
            error={providersError}
          />
        </StepShell>
      ) : null}

      {step === 2 ? (
        <StepShell
          title="Pick a date and time"
          description="We’ll show open appointment slots from the CarePoint calendar."
        >
          <ScheduleStep
            date={date}
            onDateChange={setDate}
            slots={slots}
            slotsState={slotsState}
            selectedSlot={selectedSlot}
            onSelectSlot={setSelectedSlot}
            timezone={timezone}
          />
        </StepShell>
      ) : null}

      {step === 3 ? (
        <StepShell
          title="Your details"
          description="Confirm the appointment summary, then enter your contact information."
        >
          <CustomerStep
            name={name}
            phone={phone}
            email={email}
            reason={reason}
            onNameChange={setName}
            onPhoneChange={setPhone}
            onEmailChange={setEmail}
            onReasonChange={setReason}
            selectedService={selectedService}
            selectedSlot={selectedSlot}
            location={location}
            timezone={timezone}
            errors={fieldErrors}
          />
          {submitError ? (
            <p className="mt-4 rounded-xl border border-border bg-[color-mix(in_srgb,var(--destructive)_12%,transparent)] px-4 py-3 text-sm text-destructive" role="alert">
              {submitError}
            </p>
          ) : null}
        </StepShell>
      ) : null}

      <div className="flex flex-wrap justify-between gap-3">
        <Button
          variant="secondary"
          onClick={() => setStep((current) => Math.max(0, current - 1) as Step)}
          disabled={step === 0 || submitting}
        >
          Back
        </Button>
        {step < 3 ? (
          <Button onClick={() => setStep((current) => Math.min(3, current + 1) as Step)} disabled={!canContinue()}>
            Continue
          </Button>
        ) : (
          <Button onClick={() => void submitAppointment()} disabled={submitting || !selectedSlot}>
            {submitting ? 'Booking…' : 'Confirm appointment'}
          </Button>
        )}
      </div>
    </div>
  );
}

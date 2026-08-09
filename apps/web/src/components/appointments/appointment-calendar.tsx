'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import type { DatesSetArg, EventClickArg } from '@fullcalendar/core';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import {
  appointmentsForDate,
  mapAppointmentsToEvents,
  summarizeAppointments,
  type CalendarAppointment,
} from '@/lib/appointments/calendar-utils';
import { AppointmentCalendarFilters } from './appointment-calendar-filters';
import { AppointmentDetailPanel } from './appointment-detail-panel';
import { AppointmentSummaryCards } from './appointment-summary-cards';
import { SelectedDayAgenda } from './selected-day-agenda';
import type {
  CalendarFilters,
  FilterOption,
} from './appointment-calendar.types';

const EMPTY_FILTERS: CalendarFilters = {
  providerId: '',
  serviceId: '',
  locationId: '',
  status: '',
};

function useIsNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return narrow;
}

export function AppointmentCalendar() {
  const calendarRef = useRef<FullCalendar | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastQueryRef = useRef<string>('');
  const narrow = useIsNarrow();

  const [filters, setFilters] = useState<CalendarFilters>(EMPTY_FILTERS);
  const [debouncedFilters, setDebouncedFilters] = useState<CalendarFilters>(EMPTY_FILTERS);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const [timezone, setTimezone] = useState('Asia/Dhaka');
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CalendarAppointment | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  const [providers, setProviders] = useState<FilterOption[]>([]);
  const [services, setServices] = useState<FilterOption[]>([]);
  const [locations, setLocations] = useState<FilterOption[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedFilters(filters), 250);
    return () => window.clearTimeout(timer);
  }, [filters]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getServices();
        if (cancelled) return;
        setTimezone(data.organization.timezone || 'Asia/Dhaka');
        setServices(data.services.map((service) => ({ id: service.id, name: service.name })));
        if (data.defaultLocation) {
          setLocations([{ id: data.defaultLocation.id, name: data.defaultLocation.name }]);
        }

        const providerMap = new Map<string, FilterOption>();
        await Promise.all(
          data.services.map(async (service) => {
            const list = await api.getProviders(service.id);
            for (const provider of list) {
              providerMap.set(provider.id, {
                id: provider.id,
                name: provider.name,
                specialty: provider.specialty,
              });
            }
          }),
        );
        if (!cancelled) {
          setProviders([...providerMap.values()].sort((a, b) => a.name.localeCompare(b.name)));
        }
      } catch {
        if (!cancelled) {
          setError('Unable to load filter options from the booking API.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!range) return;

    const queryKey = JSON.stringify({
      start: range.start,
      end: range.end,
      ...debouncedFilters,
      timezone,
    });
    if (queryKey === lastQueryRef.current) {
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    lastQueryRef.current = queryKey;

    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const response = await api.getCalendarAppointments(
          {
            start: range.start,
            end: range.end,
            providerId: debouncedFilters.providerId || undefined,
            serviceId: debouncedFilters.serviceId || undefined,
            locationId: debouncedFilters.locationId || undefined,
            status: debouncedFilters.status || undefined,
            timezone,
          },
          { signal: controller.signal },
        );

        if (controller.signal.aborted) return;
        setAppointments(response.appointments);
        if (response.range.timezone && response.range.timezone !== timezone) {
          // Keep org timezone authoritative without forcing a refetch loop.
          lastQueryRef.current = JSON.stringify({
            start: range.start,
            end: range.end,
            ...debouncedFilters,
            timezone: response.range.timezone,
          });
          setTimezone(response.range.timezone);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        lastQueryRef.current = '';
        const message = err instanceof Error ? err.message : 'Failed to load appointments';
        setError(message);
        setAppointments([]);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [range, debouncedFilters, timezone]);

  const events = useMemo(() => mapAppointmentsToEvents(appointments), [appointments]);
  const summary = useMemo(
    () => summarizeAppointments(appointments, timezone),
    [appointments, timezone],
  );
  const dayAgenda = useMemo(
    () =>
      selectedDateKey
        ? appointmentsForDate(appointments, selectedDateKey, timezone)
        : [],
    [appointments, selectedDateKey, timezone],
  );

  const initialView = narrow ? 'listWeek' : 'dayGridMonth';

  useEffect(() => {
    const apiInstance = calendarRef.current?.getApi();
    if (!apiInstance) return;
    const current = apiInstance.view.type;
    if (narrow && current !== 'listWeek' && current.startsWith('dayGrid')) {
      apiInstance.changeView('listWeek');
    }
  }, [narrow]);

  const onDatesSet = useCallback((arg: DatesSetArg) => {
    setRange({
      start: arg.start.toISOString(),
      end: arg.end.toISOString(),
    });
  }, []);

  const onEventClick = useCallback(
    (arg: EventClickArg) => {
      const found = appointments.find((item) => item.id === arg.event.id) ?? null;
      setSelected(found);
    },
    [appointments],
  );

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Appointment Calendar
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            View and track scheduled appointments by date and time. This page is read-only and does
            not create or change bookings.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => calendarRef.current?.getApi().today()}
        >
          Today
        </Button>
      </section>

      <AppointmentSummaryCards {...summary} />

      <AppointmentCalendarFilters
        filters={filters}
        providers={providers}
        services={services}
        locations={locations}
        onChange={setFilters}
        onClear={() => setFilters(EMPTY_FILTERS)}
      />

      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-destructive/40 bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)] px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      <Card className="relative overflow-hidden p-3 sm:p-4">
        {loading ? (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-[color-mix(in_srgb,var(--background)_72%,transparent)]"
            aria-live="polite"
            aria-busy="true"
          >
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-[var(--shadow)]">
              <span className="spinner inline-block h-4 w-4 rounded-full border-2 border-border border-t-primary" />
              Loading appointments…
            </div>
          </div>
        ) : null}

        {!loading && !error && appointments.length === 0 ? (
          <p className="mb-3 text-sm text-muted-foreground">
            No appointments found in this calendar range for the selected filters.
          </p>
        ) : null}

        <div className="appointment-calendar overflow-x-auto">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
            initialView={initialView}
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
            }}
            buttonText={{
              today: 'Today',
              month: 'Month',
              week: 'Week',
              day: 'Day',
              list: 'List',
            }}
            height="auto"
            timeZone={timezone}
            events={events}
            datesSet={onDatesSet}
            eventClick={onEventClick}
            dateClick={(arg) => setSelectedDateKey(arg.dateStr.slice(0, 10))}
            nowIndicator
            dayMaxEvents
            editable={false}
            selectable={false}
            eventDisplay="block"
            slotMinTime="07:00:00"
            slotMaxTime="21:00:00"
          />
        </div>
      </Card>

      <SelectedDayAgenda
        dateKey={selectedDateKey}
        appointments={dayAgenda}
        timezone={timezone}
        onSelect={setSelected}
      />

      <AppointmentDetailPanel
        appointment={selected}
        timezone={timezone}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

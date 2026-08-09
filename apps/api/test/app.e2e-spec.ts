import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentStatus, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { dayOfWeekInTimeZone, zonedLocalToUtc } from '../src/common/utils/time.util';

describe('Appointment platform (e2e)', () => {
  let app: INestApplication<App>;
  const prisma = new PrismaClient();
  const orgSlug = 'carepoint-clinic';
  const webhookSecret = process.env.VAPI_WEBHOOK_SECRET ?? 'test-secret';
  let trackingApiKey = 'e2e-appointment-tracking-secret';

  let locationId: string;
  let serviceId: string;
  let providerId: string;
  let bookingDate: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = process.env.PORT ?? '4000';
    process.env.FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    process.env.VAPI_WEBHOOK_SECRET = webhookSecret;
    process.env.APPOINTMENT_TRACKING_API_KEY = trackingApiKey;
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL =
        'postgresql://postgres:postgres@localhost:5433/voice_agent?schema=public';
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    trackingApiKey =
      app.get(ConfigService).get<string>('APPOINTMENT_TRACKING_API_KEY') ?? trackingApiKey;

    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: orgSlug } });
    const location = await prisma.location.findFirstOrThrow({
      where: { organizationId: org.id },
    });
    const service = await prisma.service.findFirstOrThrow({
      where: { organizationId: org.id, slug: 'general-consultation' },
    });
    const provider = await prisma.provider.findFirstOrThrow({
      where: { organizationId: org.id, name: 'Dr. Sarah Khan' },
    });

    locationId = location.id;
    serviceId = service.id;
    providerId = provider.id;
    bookingDate = nextOpenDate();
  });

  afterAll(async () => {
    await prisma.appointment.deleteMany({
      where: {
        customer: {
          normalizedPhone: { startsWith: '+8801799' },
        },
      },
    });
    await prisma.customer.deleteMany({
      where: { normalizedPhone: { startsWith: '+8801799' } },
    });
    await prisma.voiceCall.deleteMany({
      where: { vapiCallId: { startsWith: 'call-test-' } },
    });
    await app.close();
    await prisma.$disconnect();
  });

  it('GET /health reports database connectivity', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(response.body.database).toBe('up');
    expect(response.body.status).toBe('ok');
  });

  it('returns available slots with a lunch break gap', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/public/${orgSlug}/availability`)
      .query({
        serviceId,
        locationId,
        providerId,
        date: bookingDate,
        timezone: 'Asia/Dhaka',
      })
      .expect(200);

    expect(response.body.slots.length).toBeGreaterThan(0);

    const displayHours = response.body.slots.map((slot: { displayStart: string }) =>
      Number(slot.displayStart.split('T')[1].slice(0, 2)),
    );

    expect(displayHours.some((hour: number) => hour < 13)).toBe(true);
    expect(displayHours.some((hour: number) => hour >= 14)).toBe(true);
    expect(displayHours.some((hour: number) => hour === 13)).toBe(false);
  });

  it('creates an appointment, is idempotent, conflicts on double booking, and cancels', async () => {
    const slotsResponse = await request(app.getHttpServer())
      .get(`/api/v1/public/${orgSlug}/availability`)
      .query({
        serviceId,
        locationId,
        providerId,
        date: bookingDate,
        timezone: 'Asia/Dhaka',
      })
      .expect(200);

    const slot = slotsResponse.body.slots[0];
    expect(slot).toBeDefined();

    const externalRequestId = `e2e-idem-${Date.now()}`;
    const payload = {
      locationId,
      providerId,
      serviceId,
      scheduledStart: slot.startTime,
      timezone: 'Asia/Dhaka',
      customer: {
        name: 'E2E Patient',
        phone: '+8801799000001',
        email: 'e2e@example.com',
      },
      reason: 'Test booking',
      source: 'WEB',
      externalRequestId,
    };

    const created = await request(app.getHttpServer())
      .post(`/api/v1/public/${orgSlug}/appointments`)
      .send(payload)
      .expect(201);

    expect(created.body.confirmationCode).toMatch(/^APT-[A-Z0-9]+$/);
    expect(created.body.status).toBe(AppointmentStatus.CONFIRMED);

    const idempotent = await request(app.getHttpServer())
      .post(`/api/v1/public/${orgSlug}/appointments`)
      .send(payload)
      .expect(201);

    expect(idempotent.body.id).toBe(created.body.id);
    expect(idempotent.body.confirmationCode).toBe(created.body.confirmationCode);

    await request(app.getHttpServer())
      .post(`/api/v1/public/${orgSlug}/appointments`)
      .send({
        ...payload,
        externalRequestId: `e2e-conflict-${Date.now()}`,
        customer: {
          name: 'Conflict Patient',
          phone: '+8801799000002',
        },
      })
      .expect(409);

    const fetched = await request(app.getHttpServer())
      .get(`/api/v1/public/${orgSlug}/appointments/${created.body.confirmationCode}`)
      .expect(200);
    expect(fetched.body.confirmationCode).toBe(created.body.confirmationCode);
    expect(fetched.body.internalNotes).toBeUndefined();

    const cancelled = await request(app.getHttpServer())
      .post(
        `/api/v1/public/${orgSlug}/appointments/${created.body.confirmationCode}/cancel`,
      )
      .send({ phone: '+8801799000001', reason: 'Changed plans' })
      .expect(200);

    expect(cancelled.body.status).toBe(AppointmentStatus.CANCELLED);
  });

  it('rejects unauthorized Vapi tool calls', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/vapi/tools')
      .send({ message: { type: 'tool-calls', toolCallList: [] } })
      .expect(401);
  });

  it('handles check availability and book appointment tools', async () => {
    const availability = await request(app.getHttpServer())
      .post('/api/v1/vapi/tools')
      .set('Authorization', `Bearer ${webhookSecret}`)
      .send({
        message: {
          type: 'tool-calls',
          toolCallList: [
            {
              id: 'tool-avail-1',
              function: {
                name: 'check_appointment_availability',
                arguments: {
                  organizationSlug: orgSlug,
                  serviceName: 'General Consultation',
                  preferredProviderName: 'Dr. Sarah Khan',
                  date: bookingDate,
                  timePreference: 'any',
                  timezone: 'Asia/Dhaka',
                },
              },
            },
          ],
        },
      })
      .expect(200);

    expect(availability.body.results[0].toolCallId).toBe('tool-avail-1');
    expect(availability.body.results[0].result.success).toBe(true);
    expect(availability.body.results[0].result.options.length).toBeGreaterThan(0);

    const option = availability.body.results[0].result.options[0];

    const booked = await request(app.getHttpServer())
      .post('/api/v1/vapi/tools')
      .set('Authorization', `Bearer ${webhookSecret}`)
      .send({
        message: {
          type: 'tool-calls',
          toolCallList: [
            {
              id: 'tool-book-1',
              function: {
                name: 'book_appointment',
                arguments: {
                  organizationSlug: orgSlug,
                  locationId: option.locationId,
                  providerId: option.providerId,
                  serviceId: option.serviceId,
                  scheduledStart: option.startTime,
                  timezone: 'Asia/Dhaka',
                  customerName: 'Voice Patient',
                  customerPhone: '+8801799000003',
                  externalRequestId: `voice-e2e-${Date.now()}`,
                },
              },
            },
          ],
        },
      })
      .expect(200);

    expect(booked.body.results[0].result.success).toBe(true);
    expect(booked.body.results[0].result.confirmationCode).toMatch(/^APT-/);
  });

  it('acknowledges unknown Vapi webhook events', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/vapi/webhook')
      .set('Authorization', `Bearer ${webhookSecret}`)
      .send({
        message: {
          type: 'totally-unknown-event',
          call: { id: 'call-test-unknown-1', status: 'queued' },
        },
      })
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.type).toBe('totally-unknown-event');

    const saved = await prisma.voiceCall.findUnique({
      where: { vapiCallId: 'call-test-unknown-1' },
    });
    expect(saved).not.toBeNull();
  });

  it('requires authorization for the admin calendar endpoint', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/admin/${orgSlug}/appointments/calendar`)
      .query({
        start: '2026-08-01T00:00:00.000Z',
        end: '2026-09-01T00:00:00.000Z',
      })
      .expect(401);

    await request(app.getHttpServer())
      .get(`/api/v1/admin/${orgSlug}/appointments/calendar`)
      .set('Authorization', 'Bearer wrong-key')
      .query({
        start: '2026-08-01T00:00:00.000Z',
        end: '2026-09-01T00:00:00.000Z',
      })
      .expect(401);
  });

  it('validates calendar query parameters', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/admin/${orgSlug}/appointments/calendar`)
      .set('Authorization', `Bearer ${trackingApiKey}`)
      .expect(400);

    await request(app.getHttpServer())
      .get(`/api/v1/admin/${orgSlug}/appointments/calendar`)
      .set('Authorization', `Bearer ${trackingApiKey}`)
      .query({
        start: '2026-09-01T00:00:00.000Z',
        end: '2026-08-01T00:00:00.000Z',
      })
      .expect(400);

    await request(app.getHttpServer())
      .get(`/api/v1/admin/${orgSlug}/appointments/calendar`)
      .set('Authorization', `Bearer ${trackingApiKey}`)
      .query({
        start: '2026-01-01T00:00:00.000Z',
        end: '2026-05-01T00:00:00.000Z',
      })
      .expect(400);
  });

  it('returns overlapping calendar appointments without private customer fields', async () => {
    const slotsResponse = await request(app.getHttpServer())
      .get(`/api/v1/public/${orgSlug}/availability`)
      .query({
        serviceId,
        locationId,
        providerId,
        date: nextOpenDate(21),
        timezone: 'Asia/Dhaka',
      })
      .expect(200);

    const slot = slotsResponse.body.slots[0];
    expect(slot).toBeDefined();

    const created = await request(app.getHttpServer())
      .post(`/api/v1/public/${orgSlug}/appointments`)
      .send({
        locationId,
        providerId,
        serviceId,
        scheduledStart: slot.startTime,
        timezone: 'Asia/Dhaka',
        customer: {
          name: 'Calendar Patient',
          phone: '+8801799000011',
          email: 'calendar-private@example.com',
        },
        source: 'WEB',
        externalRequestId: `calendar-e2e-${Date.now()}`,
      })
      .expect(201);

    const rangeStart = new Date(new Date(slot.startTime).getTime() - 60 * 60_000).toISOString();
    const rangeEnd = new Date(new Date(slot.endTime).getTime() + 60 * 60_000).toISOString();

    const calendar = await request(app.getHttpServer())
      .get(`/api/v1/admin/${orgSlug}/appointments/calendar`)
      .set('Authorization', `Bearer ${trackingApiKey}`)
      .query({
        start: rangeStart,
        end: rangeEnd,
        providerId,
        serviceId,
        locationId,
        status: AppointmentStatus.CONFIRMED,
        timezone: 'Asia/Dhaka',
      })
      .expect(200);

    expect(calendar.body.range.timezone).toBe('Asia/Dhaka');
    expect(Array.isArray(calendar.body.appointments)).toBe(true);

    const match = calendar.body.appointments.find(
      (item: { id: string }) => item.id === created.body.id,
    );
    expect(match).toBeDefined();
    expect(match.customer.name).toBe('Calendar Patient');
    expect(match.customer.phone).toBeUndefined();
    expect(match.customer.email).toBeUndefined();
    expect(match.internalNotes).toBeUndefined();
    expect(JSON.stringify(calendar.body)).not.toContain('+8801799000011');
    expect(JSON.stringify(calendar.body)).not.toContain('calendar-private@example.com');

    const starts = calendar.body.appointments.map(
      (item: { scheduledStart: string }) => item.scheduledStart,
    );
    const sorted = [...starts].sort();
    expect(starts).toEqual(sorted);

    const filteredProvider = await request(app.getHttpServer())
      .get(`/api/v1/admin/${orgSlug}/appointments/calendar`)
      .set('Authorization', `Bearer ${trackingApiKey}`)
      .query({
        start: rangeStart,
        end: rangeEnd,
        providerId: '00000000-0000-4000-8000-000000000099',
      })
      .expect(200);
    expect(filteredProvider.body.appointments).toHaveLength(0);
  });

  it('removes conflicting slots after booking and respects buffers/duration', async () => {
    const openDate = nextOpenDate(14);
    const slotsBefore = await request(app.getHttpServer())
      .get(`/api/v1/public/${orgSlug}/availability`)
      .query({
        serviceId,
        locationId,
        providerId,
        date: openDate,
        timezone: 'Asia/Dhaka',
      })
      .expect(200);

    const chosen = slotsBefore.body.slots[0];
    await request(app.getHttpServer())
      .post(`/api/v1/public/${orgSlug}/appointments`)
      .send({
        locationId,
        providerId,
        serviceId,
        scheduledStart: chosen.startTime,
        timezone: 'Asia/Dhaka',
        customer: {
          name: 'Buffer Patient',
          phone: '+8801799000004',
        },
        externalRequestId: `buffer-${Date.now()}`,
      })
      .expect(201);

    const slotsAfter = await request(app.getHttpServer())
      .get(`/api/v1/public/${orgSlug}/availability`)
      .query({
        serviceId,
        locationId,
        providerId,
        date: openDate,
        timezone: 'Asia/Dhaka',
      })
      .expect(200);

    expect(
      slotsAfter.body.slots.some(
        (slot: { startTime: string }) => slot.startTime === chosen.startTime,
      ),
    ).toBe(false);

    // 30-minute general consultation should also clear the next 15-min interval start.
    const nextInterval = new Date(new Date(chosen.startTime).getTime() + 15 * 60_000).toISOString();
    expect(
      slotsAfter.body.slots.some((slot: { startTime: string }) => slot.startTime === nextInterval),
    ).toBe(false);
  });
});

function nextOpenDate(daysAhead = 7): string {
  const tz = 'Asia/Dhaka';
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  for (let i = daysAhead; i < daysAhead + 28; i += 1) {
    const candidate = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
    const ymd = formatter.format(candidate);
    const dow = dayOfWeekInTimeZone(ymd, tz);
    if (dow >= 0 && dow <= 4) {
      // Ensure the date still has future morning slots in Asia/Dhaka.
      const morningUtc = zonedLocalToUtc(ymd, '09:00', tz);
      if (morningUtc.getTime() > Date.now()) {
        return ymd;
      }
    }
  }
  return '2026-08-12';
}

import checkAvailabilityFixture from '../../test/fixtures/vapi-check-availability.json';
import bookAppointmentFixture from '../../test/fixtures/vapi-book-appointment.json';
import {
  extractToolCalls,
  getToolArguments,
  getToolCallId,
  getToolName,
  parseBookAppointmentArgs,
  parseCheckAvailabilityArgs,
} from './vapi.parser';
import { VapiWebhookPayload } from './vapi.types';

describe('Vapi parser', () => {
  it('parses check_appointment_availability tool payload', () => {
    const payload = checkAvailabilityFixture as VapiWebhookPayload;
    const toolCalls = extractToolCalls(payload.message!);
    expect(toolCalls).toHaveLength(1);

    const toolCall = toolCalls[0];
    expect(getToolCallId(toolCall)).toBe('tool-call-1');
    expect(getToolName(toolCall)).toBe('check_appointment_availability');

    const args = parseCheckAvailabilityArgs(getToolArguments(toolCall));
    expect(args).toMatchObject({
      organizationSlug: 'carepoint-clinic',
      serviceName: 'General Consultation',
      date: '2026-08-12',
      timePreference: 'morning',
      timezone: 'Asia/Dhaka',
    });
  });

  it('normalizes time preference aliases for concrete dates', () => {
    const args = parseCheckAvailabilityArgs({
      organizationSlug: 'carepoint-clinic',
      serviceName: 'General Consultation',
      date: '2026-08-09',
      timePreference: 'anytime',
      timezone: 'Asia/Dhaka',
    });
    expect(args).toMatchObject({
      date: '2026-08-09',
      timePreference: 'any',
      timezone: 'Asia/Dhaka',
    });
  });

  it('rejects relative date phrases for check_appointment_availability', () => {
    const args = parseCheckAvailabilityArgs({
      organizationSlug: 'carepoint-clinic',
      serviceName: 'General Consultation',
      date: 'tomorrow',
      timePreference: 'morning',
    });
    expect(args).toMatchObject({
      dateResolutionRequired: true,
    });
  });

  it('parses book_appointment tool payload with stringified arguments', () => {
    const payload = bookAppointmentFixture as VapiWebhookPayload;
    const toolCalls = extractToolCalls(payload.message!);
    const args = parseBookAppointmentArgs(getToolArguments(toolCalls[0]));
    expect(args).toMatchObject({
      organizationSlug: 'carepoint-clinic',
      customerName: 'John Doe',
      customerPhone: '+8801700000000',
    });
  });
});

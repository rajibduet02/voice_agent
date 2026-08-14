import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppointmentTrackingAuthGuard } from './appointment-tracking-auth.guard';

function mockContext(authorization?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: authorization ? { authorization } : {},
      }),
    }),
  } as ExecutionContext;
}

describe('AppointmentTrackingAuthGuard', () => {
  const expected = 'test-tracking-secret-value';
  const originalEnv = process.env.APPOINTMENT_TRACKING_API_KEY;
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.APPOINTMENT_TRACKING_API_KEY;
    } else {
      process.env.APPOINTMENT_TRACKING_API_KEY = originalEnv;
    }
    logSpy.mockClear();
  });

  afterAll(() => {
    logSpy.mockRestore();
  });

  function createGuard(configValue?: string) {
    const configService = {
      get: jest.fn((key: string) =>
        key === 'APPOINTMENT_TRACKING_API_KEY' ? configValue : undefined,
      ),
    } as unknown as ConfigService;
    return new AppointmentTrackingAuthGuard(configService);
  }

  it('rejects missing authorization', () => {
    process.env.APPOINTMENT_TRACKING_API_KEY = expected;
    const guard = createGuard(expected);
    expect(() => guard.canActivate(mockContext())).toThrow(UnauthorizedException);
  });

  it('rejects invalid authorization', () => {
    process.env.APPOINTMENT_TRACKING_API_KEY = expected;
    const guard = createGuard(expected);
    expect(() => guard.canActivate(mockContext('Bearer wrong-secret'))).toThrow(
      UnauthorizedException,
    );
  });

  it('accepts valid authorization', () => {
    process.env.APPOINTMENT_TRACKING_API_KEY = expected;
    const guard = createGuard(expected);
    expect(guard.canActivate(mockContext(`Bearer ${expected}`))).toBe(true);
  });

  it('rejects when the API tracking key is not configured', () => {
    delete process.env.APPOINTMENT_TRACKING_API_KEY;
    const guard = createGuard(undefined);
    expect(() =>
      guard.canActivate(mockContext(`Bearer ${expected}`)),
    ).toThrow(UnauthorizedException);

    expect(logSpy).toHaveBeenCalledWith('[Appointment Tracking Auth]', {
      configured: false,
      receivedBearer: true,
      authorized: false,
    });
    const serialized = JSON.stringify(logSpy.mock.calls);
    expect(serialized).not.toContain(expected);
  });

  it('never logs token values in diagnostics', () => {
    process.env.APPOINTMENT_TRACKING_API_KEY = expected;
    const guard = createGuard(expected);
    guard.canActivate(mockContext(`Bearer ${expected}`));

    const serialized = JSON.stringify(logSpy.mock.calls);
    expect(serialized).not.toContain(expected);
    expect(serialized).not.toContain(`Bearer ${expected}`);
    expect(serialized).not.toMatch(/"authorization"\s*:/i);
  });
});

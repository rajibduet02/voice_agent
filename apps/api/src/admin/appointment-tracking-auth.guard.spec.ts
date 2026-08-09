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
  const configService = {
    get: jest.fn((key: string) =>
      key === 'APPOINTMENT_TRACKING_API_KEY' ? expected : undefined,
    ),
  } as unknown as ConfigService;

  const guard = new AppointmentTrackingAuthGuard(configService);

  it('rejects missing authorization', () => {
    expect(() => guard.canActivate(mockContext())).toThrow(UnauthorizedException);
  });

  it('rejects invalid authorization', () => {
    expect(() => guard.canActivate(mockContext('Bearer wrong-secret'))).toThrow(
      UnauthorizedException,
    );
  });

  it('accepts valid authorization', () => {
    expect(guard.canActivate(mockContext(`Bearer ${expected}`))).toBe(true);
  });
});

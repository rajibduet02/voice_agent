import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';

@Injectable()
export class AppointmentTrackingAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    const receivedBearer = Boolean(header && header.startsWith('Bearer '));

    // Prefer process.env directly so hosting-provider values are authoritative.
    const expected = (
      process.env.APPOINTMENT_TRACKING_API_KEY ??
      this.configService.get<string>('APPOINTMENT_TRACKING_API_KEY') ??
      ''
    ).trim();
    const configured = expected.length > 0;

    if (!receivedBearer) {
      console.log('[Appointment Tracking Auth]', {
        configured,
        receivedBearer: false,
        authorized: false,
      });
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = header!.slice('Bearer '.length).trim();
    const authorized = configured && this.secretsMatch(token, expected);

    console.log('[Appointment Tracking Auth]', {
      configured,
      receivedBearer: true,
      authorized,
    });

    // Do NOT log expected or received tokens.
    if (!authorized) {
      throw new UnauthorizedException('Invalid appointment tracking API key');
    }

    return true;
  }

  private secretsMatch(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length) {
      return false;
    }
    return timingSafeEqual(left, right);
  }
}

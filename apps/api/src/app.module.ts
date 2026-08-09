import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { PublicModule } from './public/public.module';
import { AvailabilityModule } from './availability/availability.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { AdminModule } from './admin/admin.module';
import { VapiModule } from './vapi/vapi.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    AvailabilityModule,
    AppointmentsModule,
    PublicModule,
    AdminModule,
    VapiModule,
  ],
})
export class AppModule {}

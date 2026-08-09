import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { DateTimeModule } from '../date-time/date-time.module';
import { VapiAuthGuard } from './vapi-auth.guard';
import { VapiController } from './vapi.controller';
import { VapiService } from './vapi.service';

@Module({
  imports: [AvailabilityModule, AppointmentsModule, DateTimeModule],
  controllers: [VapiController],
  providers: [VapiService, VapiAuthGuard],
})
export class VapiModule {}

import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { DateTimeModule } from '../date-time/date-time.module';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

@Module({
  imports: [AvailabilityModule, AppointmentsModule, DateTimeModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}

import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { AppointmentCalendarService } from './appointment-calendar.service';
import { AppointmentsService } from './appointments.service';

@Module({
  imports: [AvailabilityModule],
  providers: [AppointmentsService, AppointmentCalendarService],
  exports: [AppointmentsService, AppointmentCalendarService],
})
export class AppointmentsModule {}

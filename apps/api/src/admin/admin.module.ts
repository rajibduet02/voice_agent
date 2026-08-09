import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { AdminController } from './admin.controller';
import { AppointmentTrackingAuthGuard } from './appointment-tracking-auth.guard';

@Module({
  imports: [AppointmentsModule],
  controllers: [AdminController],
  providers: [AppointmentTrackingAuthGuard],
})
export class AdminModule {}

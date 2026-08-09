import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { CLOCK, SystemClock } from './clock';
import { NextAvailabilityService } from './next-availability.service';
import { OrganizationTimeService } from './organization-time.service';
import { RelativeDateService } from './relative-date.service';

@Module({
  imports: [AvailabilityModule],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    OrganizationTimeService,
    RelativeDateService,
    NextAvailabilityService,
  ],
  exports: [
    CLOCK,
    OrganizationTimeService,
    RelativeDateService,
    NextAvailabilityService,
  ],
})
export class DateTimeModule {}

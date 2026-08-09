import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppointmentCalendarService } from '../appointments/appointment-calendar.service';
import { CalendarAppointmentsQueryDto } from '../appointments/dto/calendar-appointments-query.dto';
import { AppointmentTrackingAuthGuard } from './appointment-tracking-auth.guard';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AppointmentTrackingAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly calendarService: AppointmentCalendarService) {}

  @Get(':organizationSlug/appointments/calendar')
  @ApiOperation({ summary: 'List appointments for the calendar date range (read-only)' })
  getCalendarAppointments(
    @Param('organizationSlug') organizationSlug: string,
    @Query() query: CalendarAppointmentsQueryDto,
  ) {
    return this.calendarService.getCalendarAppointments(organizationSlug, query);
  }
}

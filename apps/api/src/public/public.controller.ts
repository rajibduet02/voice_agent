import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CancelAppointmentDto,
  CreateAppointmentDto,
} from '../appointments/dto/create-appointment.dto';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import { ResolveDateDto } from './dto/resolve-date.dto';
import { PublicService } from './public.service';

@ApiTags('public')
@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get(':organizationSlug/time-context')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ summary: 'Get authoritative organization date/time context' })
  getTimeContext(
    @Param('organizationSlug') organizationSlug: string,
    @Query('timezone') timezone?: string,
  ) {
    return this.publicService.getTimeContext(organizationSlug, timezone);
  }

  @Post(':organizationSlug/resolve-date')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Resolve a relative or natural-language date expression' })
  resolveDate(
    @Param('organizationSlug') organizationSlug: string,
    @Body() dto: ResolveDateDto,
  ) {
    return this.publicService.resolveDate(organizationSlug, dto);
  }

  @Get(':organizationSlug/services')
  @ApiOperation({ summary: 'List active services for an organization' })
  listServices(@Param('organizationSlug') organizationSlug: string) {
    return this.publicService.listServices(organizationSlug);
  }

  @Get(':organizationSlug/providers')
  @ApiOperation({ summary: 'List active providers offering a service' })
  listProviders(
    @Param('organizationSlug') organizationSlug: string,
    @Query('serviceId') serviceId: string,
  ) {
    if (!serviceId) {
      throw new BadRequestException('serviceId query parameter is required');
    }
    return this.publicService.listProviders(organizationSlug, serviceId);
  }

  @Get(':organizationSlug/availability')
  @ApiOperation({ summary: 'Get available appointment slots' })
  getAvailability(
    @Param('organizationSlug') organizationSlug: string,
    @Query() query: AvailabilityQueryDto,
  ) {
    return this.publicService.getAvailability(organizationSlug, query);
  }

  @Post(':organizationSlug/appointments')
  @ApiOperation({ summary: 'Create an appointment' })
  createAppointment(
    @Param('organizationSlug') organizationSlug: string,
    @Body() dto: CreateAppointmentDto,
  ) {
    return this.publicService.createAppointment(organizationSlug, dto);
  }

  @Get(':organizationSlug/appointments/:confirmationCode')
  @ApiOperation({ summary: 'Get appointment by confirmation code' })
  getAppointment(
    @Param('organizationSlug') organizationSlug: string,
    @Param('confirmationCode') confirmationCode: string,
  ) {
    return this.publicService.getAppointment(organizationSlug, confirmationCode);
  }

  @Post(':organizationSlug/appointments/:confirmationCode/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel an appointment with phone verification' })
  cancelAppointment(
    @Param('organizationSlug') organizationSlug: string,
    @Param('confirmationCode') confirmationCode: string,
    @Body() dto: CancelAppointmentDto,
  ) {
    return this.publicService.cancelAppointment(
      organizationSlug,
      confirmationCode,
      dto.phone,
      dto.reason,
    );
  }
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppointmentSource } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CustomerInputDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: '+8801700000000' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  phone!: string;

  @ApiPropertyOptional({ example: 'john@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class CreateAppointmentDto {
  @ApiProperty()
  @IsUUID()
  locationId!: string;

  @ApiProperty()
  @IsUUID()
  providerId!: string;

  @ApiProperty()
  @IsUUID()
  serviceId!: string;

  @ApiProperty({ example: '2026-08-12T04:00:00.000Z' })
  @IsISO8601()
  scheduledStart!: string;

  @ApiProperty({ example: 'Asia/Dhaka' })
  @IsString()
  @IsNotEmpty()
  timezone!: string;

  @ApiProperty({ type: CustomerInputDto })
  @ValidateNested()
  @Type(() => CustomerInputDto)
  customer!: CustomerInputDto;

  @ApiPropertyOptional({ example: 'General consultation' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ enum: AppointmentSource, default: AppointmentSource.WEB })
  @IsOptional()
  @IsEnum(AppointmentSource)
  source?: AppointmentSource;

  @ApiPropertyOptional({ example: 'optional-idempotency-key' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalRequestId?: string;
}

export class CancelAppointmentDto {
  @ApiProperty({ example: '+8801700000000' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

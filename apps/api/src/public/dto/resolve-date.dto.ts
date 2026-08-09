import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ResolveDateDto {
  @ApiProperty({ example: 'tomorrow' })
  @IsString()
  @IsNotEmpty()
  expression!: string;

  @ApiPropertyOptional({ example: 'Asia/Dhaka' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  timezone?: string;

  /** Development/test only. Ignored in production. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  referenceUtc?: string;
}

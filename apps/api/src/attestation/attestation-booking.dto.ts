import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export class AttestationAgentsQueryDto {
  @IsString()
  @Length(2, 40)
  serviceId!: string;
}

export class AttestationBookingDto {
  @IsString()
  @Length(2, 40)
  serviceId!: string;

  @IsUUID()
  agentId!: string;

  @IsString()
  @Length(5, 500)
  pickupAddress!: string;

  @IsString()
  @Length(5, 500)
  returnAddress!: string;

  @IsDateString()
  pickupDate!: string;

  @IsIn(['09:00-12:00', '12:00-15:00', '15:00-18:00'])
  pickupSlot!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(200)
  pickupDistanceKm!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(200)
  returnDistanceKm!: number;

  @IsBoolean()
  express!: boolean;
}

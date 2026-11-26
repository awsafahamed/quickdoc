import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsString, IsUUID, Max, Min } from 'class-validator';

export class AttestationQuoteDto {
  @IsString()
  serviceId!: string;

  @IsUUID()
  agentId!: string;

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

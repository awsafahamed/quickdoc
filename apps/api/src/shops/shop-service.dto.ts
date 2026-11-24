import { IsArray, IsBoolean, IsString, IsUUID, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ShopServiceDto {
  @IsUUID()
  shopId!: string;

  @IsString()
  code!: string;

  @IsBoolean()
  enabled!: boolean;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;
}

export class DefaultServicesDto {
  @IsArray()
  @IsString({ each: true })
  codes!: string[];
}

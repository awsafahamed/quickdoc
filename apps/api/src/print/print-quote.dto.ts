import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { DeliverySpeed, PrintColour, PrintPaperSize, PrintSides } from './print.types';

export class PrintQuoteDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  pageCount!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  copies!: number;

  @IsEnum(PrintPaperSize)
  paperSize!: PrintPaperSize;

  @IsEnum(PrintColour)
  colour!: PrintColour;

  @IsEnum(PrintSides)
  sides!: PrintSides;

  @IsBoolean()
  binding!: boolean;

  @IsBoolean()
  stapling!: boolean;

  @IsBoolean()
  lamination!: boolean;

  @IsEnum(DeliverySpeed)
  deliverySpeed!: DeliverySpeed;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(200)
  deliveryDistanceKm!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  deliveryLatitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  deliveryLongitude?: number;

  @IsOptional()
  @IsUUID()
  shopId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsString({ each: true })
  shopServiceCodes?: string[];
}

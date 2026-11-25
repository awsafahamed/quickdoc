import { IsEmail, IsOptional, IsString, IsNumber, MaxLength, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class ShopRegistrationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @IsString()
  @MinLength(7)
  phone!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(5)
  address!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  latitude!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  longitude!: number;
}

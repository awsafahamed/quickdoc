import { IsEmail, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @Length(3, 254)
  email!: string;

  @IsString()
  @Length(2, 120)
  name!: string;

  @IsString()
  @Length(8, 128)
  password!: string;

  @IsOptional()
  @IsString()
  @Length(7, 20)
  phone?: string;
}

export class ShopOwnerRegisterDto extends RegisterDto {
  @IsString()
  @Length(7, 20)
  override phone: string = '';

  @IsString()
  @Length(5, 500)
  address!: string;

  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-180)
  @Max(180)
  longitude!: number;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}

export class OtpRequestDto {
  @IsString()
  @Length(8, 20)
  phone!: string;
}

export class OtpVerifyDto extends OtpRequestDto {
  @IsString()
  @Length(6, 6)
  code!: string;
}

export class RefreshDto {
  @IsString()
  @Length(32, 256)
  refreshToken!: string;
}

export class GoogleExchangeDto {
  @IsString()
  @Length(64, 64)
  code!: string;
}

export class ResetRequestDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @Length(16, 256)
  token!: string;

  @IsString()
  @Length(8, 128)
  password!: string;
}

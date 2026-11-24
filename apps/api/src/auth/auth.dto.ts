import { IsEmail, IsOptional, IsString, Length } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(2, 120)
  name!: string;

  @IsString()
  @Length(8, 128)
  password!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  role?: 'CUSTOMER' | 'SHOP_OWNER' | 'RIDER';
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(8, 128)
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
  refreshToken!: string;
}

export class ResetRequestDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @Length(8, 128)
  password!: string;
}

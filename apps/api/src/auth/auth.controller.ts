import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { LoginDto, OtpRequestDto, OtpVerifyDto, RefreshDto, RegisterDto, ResetPasswordDto, ResetRequestDto } from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return { data: await this.auth.register(dto) };
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return { data: await this.auth.login(dto) };
  }

  @Post('otp/request')
  async otpRequest(@Body() dto: OtpRequestDto) {
    return { data: await this.auth.requestOtp(dto) };
  }

  @Post('otp/verify')
  async otpVerify(@Body() dto: OtpVerifyDto) {
    return { data: await this.auth.verifyOtp(dto) };
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshDto) {
    return { data: await this.auth.refresh(dto.refreshToken) };
  }

  @Post('logout')
  async logout(@Body() dto: RefreshDto) {
    return { data: await this.auth.logout(dto.refreshToken) };
  }

  @Post('password/reset-request')
  async resetRequest(@Body() dto: ResetRequestDto) {
    return { data: await this.auth.resetRequest(dto) };
  }

  @Post('password/reset')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return { data: await this.auth.resetPassword(dto) };
  }

  @Get('session')
  @UseGuards(AuthGuard('jwt'))
  session(@Req() request: { user: unknown }) {
    return { data: request.user };
  }

  @Get('oauth/google')
  google() {
    return { error: 'Google OAuth requires GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET' };
  }
}

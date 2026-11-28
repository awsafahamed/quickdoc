import { Body, Controller, Get, Logger, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { GoogleExchangeDto, LoginDto, OtpRequestDto, OtpVerifyDto, RefreshDto, RegisterDto, ResetPasswordDto, ResetRequestDto, ShopOwnerRegisterDto } from './auth.dto';

// Credential endpoints are attractive brute-force targets; keep their per-IP budget small.
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(@Body() dto: RegisterDto) {
    return { data: await this.auth.register(dto) };
  }

  @Post('register/shop-owner')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async registerShopOwner(@Body() dto: ShopOwnerRegisterDto) {
    return { data: await this.auth.registerShopOwner(dto) };
  }

  @Post('register/rider')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async registerRider(@Body() dto: RegisterDto) {
    return { data: await this.auth.register(dto, 'RIDER') };
  }

  @Post('register/agent')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async registerAgent(@Body() dto: RegisterDto) {
    return { data: await this.auth.register(dto, 'AGENT') };
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
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
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async resetRequest(@Body() dto: ResetRequestDto) {
    return { data: await this.auth.resetRequest(dto) };
  }

  @Post('password/reset')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return { data: await this.auth.resetPassword(dto) };
  }

  @Get('session')
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  @UseGuards(AuthGuard('jwt'))
  session(@Req() request: { user: unknown }) {
    return { data: request.user };
  }

  @Get('oauth/google')
  async google(@Res() response: Response) {
    const state = this.auth.createGoogleOAuthState();
    response.cookie('quickdoc_google_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 5 * 60 * 1000,
      path: '/api/v1/auth/oauth/google/callback',
    });
    response.redirect(this.auth.getGoogleAuthorizationUrl(state));
  }

  @Get('oauth/google/callback')
  async googleCallback(
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const state = typeof request.query.state === 'string' ? request.query.state : '';
    const code = typeof request.query.code === 'string' ? request.query.code : '';
    const cookies = request.headers.cookie?.split(';').map((cookie) => cookie.trim()) ?? [];
    const stateCookie = cookies
      .find((cookie) => cookie.startsWith('quickdoc_google_oauth_state='))
      ?.slice('quickdoc_google_oauth_state='.length);

    response.clearCookie('quickdoc_google_oauth_state', {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/v1/auth/oauth/google/callback',
    });

    if (request.query.error) return response.redirect(this.auth.getGoogleLoginErrorRedirect());
    if (!code || !stateCookie || !this.auth.validateGoogleOAuthState(state, stateCookie)) {
      this.logger.warn('Google OAuth callback rejected because state validation failed');
      return response.redirect(this.auth.getGoogleLoginErrorRedirect());
    }

    try {
      const loginCode = await this.auth.completeGoogleOAuth(code);
      response.redirect(this.auth.getGoogleLoginRedirect(loginCode));
    } catch (error) {
      this.logger.error('Google OAuth callback failed', error instanceof Error ? error.message : 'Unknown error');
      response.redirect(this.auth.getGoogleLoginErrorRedirect());
    }
  }

  @Post('oauth/google/exchange')
  async exchangeGoogleLoginCode(@Body() dto: GoogleExchangeDto) {
    return { data: await this.auth.exchangeGoogleLoginCode(dto.code) };
  }
}

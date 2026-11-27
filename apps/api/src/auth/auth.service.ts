import { Injectable, UnauthorizedException, BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto, ResetPasswordDto, ResetRequestDto, OtpRequestDto, OtpVerifyDto, ShopOwnerRegisterDto } from './auth.dto';

export type RegistrationRole = 'CUSTOMER' | 'SHOP_OWNER' | 'RIDER' | 'AGENT';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async register(dto: RegisterDto, role: RegistrationRole = 'CUSTOMER') {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('An account already uses this email');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name,
        passwordHash,
        CustomerProfile: dto.phone ? { create: { phone: dto.phone } } : undefined,
        UserRole: {
          create: {
            role,
          },
        },
      },
      include: { UserRole: true, CustomerProfile: true },
    });
    return this.issueSession(user.id, user.email, user.UserRole.map((role) => role.role));
  }

  async registerShopOwner(dto: ShopOwnerRegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('An account already uses this email');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.$transaction(async (transaction) => {
      const createdUser = await transaction.user.create({
        data: {
          email,
          name: dto.name,
          passwordHash,
          CustomerProfile: { create: { phone: dto.phone } },
          UserRole: { create: { role: 'SHOP_OWNER' } },
        },
        include: { UserRole: true },
      });
      await transaction.shop.create({
        data: {
          ownerId: createdUser.id,
          name: dto.name,
          address: dto.address,
          phone: dto.phone,
          latitude: dto.latitude,
          longitude: dto.longitude,
        },
      });
      return createdUser;
    });
    return this.issueSession(user.id, user.email, user.UserRole.map((role) => role.role));
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.trim().toLowerCase() }, include: { UserRole: true } });
    if (!user || user.suspended) throw new UnauthorizedException('Invalid email or password');
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid email or password');
    return this.issueSession(user.id, user.email, user.UserRole.map((role) => role.role));
  }

  async refresh(refreshToken: string) {
    const tokenHash = sha256(refreshToken);
    const session = await this.prisma.refreshSession.findUnique({ where: { tokenHash }, include: { User: { include: { UserRole: true } } } });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) throw new UnauthorizedException('Refresh session is invalid or expired');
    await this.prisma.refreshSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    return this.issueSession(session.userId, session.User.email, session.User.UserRole.map((role) => role.role));
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshSession.updateMany({ where: { tokenHash: sha256(refreshToken), revokedAt: null }, data: { revokedAt: new Date() } });
    return { loggedOut: true };
  }

  async resetRequest(dto: ResetRequestDto) {
    const apiKey = process.env.RESEND_API_KEY;
    const sender = process.env.EMAIL_FROM;
    if (!apiKey || !sender) {
      throw new ServiceUnavailableException('Password reset email delivery is not configured');
    }
    const resetUrl = new URL('/reset-password', this.getCustomerWebOrigin());
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });
    if (!user || user.suspended) return { requested: true };

    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const tokenId = randomUUID();
    await this.prisma.$transaction([
      this.prisma.actionToken.updateMany({
        where: { userId: user.id, purpose: 'RESET_PASSWORD', usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.actionToken.create({
        data: {
          id: tokenId,
          userId: user.id,
          tokenHash: sha256(rawToken),
          purpose: 'RESET_PASSWORD',
          expiresAt,
        },
      }),
    ]);

    resetUrl.searchParams.set('token', rawToken);
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: sender,
          to: [user.email],
          subject: 'Reset your QuickDoc password',
          html: `<p>We received a request to reset your QuickDoc password.</p><p><a href="${resetUrl.toString()}">Choose a new password</a></p><p>This link expires in 30 minutes. If you did not request a reset, you can ignore this email.</p>`,
        }),
      });
      if (!response.ok) throw new Error('Password reset email provider rejected the request');
    } catch {
      await this.prisma.actionToken.update({
        where: { id: tokenId },
        data: { usedAt: new Date() },
      });
      throw new ServiceUnavailableException('Password reset email could not be sent. Please try again later.');
    }
    return { requested: true };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = sha256(dto.token);
    const passwordHash = await bcrypt.hash(dto.password, 12);
    await this.prisma.$transaction(async (transaction) => {
      const token = await transaction.actionToken.findUnique({ where: { tokenHash } });
      if (!token || token.purpose !== 'RESET_PASSWORD' || token.usedAt || token.expiresAt <= new Date()) {
        throw new BadRequestException('Reset token is invalid or expired');
      }
      const consumed = await transaction.actionToken.updateMany({
        where: {
          id: token.id,
          purpose: 'RESET_PASSWORD',
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) throw new BadRequestException('Reset token is invalid or expired');
      await transaction.user.update({ where: { id: token.userId }, data: { passwordHash } });
      await transaction.refreshSession.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    return { passwordReset: true };
  }

  async requestOtp(_dto: OtpRequestDto) {
    throw new ServiceUnavailableException('Phone verification delivery is not configured');
  }

  async verifyOtp(dto: OtpVerifyDto) {
    const tokenHash = sha256(dto.phone + ':' + dto.code);
    const token = await this.prisma.actionToken.findUnique({ where: { tokenHash } });
    if (!token || token.usedAt || token.expiresAt <= new Date()) throw new UnauthorizedException('OTP is invalid or expired');
    await this.prisma.actionToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });
    const user = await this.prisma.user.findUnique({ where: { id: token.userId }, include: { UserRole: true } });
    if (!user) throw new UnauthorizedException('User not found');
    return this.issueSession(user.id, user.email, user.UserRole.map((role) => role.role));
  }

  createGoogleOAuthState() {
    return randomBytes(32).toString('hex');
  }

  validateGoogleOAuthState(received: string, stored: string) {
    const receivedBytes = Buffer.from(received);
    const storedBytes = Buffer.from(stored);
    return receivedBytes.length === storedBytes.length && timingSafeEqual(receivedBytes, storedBytes);
  }

  getGoogleAuthorizationUrl(state: string) {
    const config = this.getGoogleOAuthConfig();
    const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authorizationUrl.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    }).toString();
    return authorizationUrl.toString();
  }

  async completeGoogleOAuth(code: string) {
    const config = this.getGoogleOAuthConfig();
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenResponse.ok) throw new UnauthorizedException('Google authorization code is invalid or expired');
    const tokens = await tokenResponse.json() as { id_token?: string };
    if (!tokens.id_token) throw new UnauthorizedException('Google did not return an identity token');

    const ticket = await new OAuth2Client(config.clientId).verifyIdToken({
      idToken: tokens.id_token,
      audience: config.clientId,
    });
    const identity = ticket.getPayload();
    if (!identity?.email || identity.email_verified !== true || !identity.sub) {
      throw new UnauthorizedException('A verified Google email address is required');
    }

    const email = identity.email.toLowerCase();
    const existingUser = await this.prisma.user.findUnique({ where: { email }, include: { UserRole: true } });
    let user = existingUser;
    if (!existingUser) {
      user = await this.prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          email,
          name: identity.name || email,
          passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 12),
          emailVerified: true,
          CustomerProfile: { create: {} },
          UserRole: { create: { role: 'CUSTOMER' } },
        },
        include: { UserRole: true },
      });
    } else if (!existingUser.emailVerified) {
      user = await this.prisma.user.update({
        where: { id: existingUser.id },
        data: { emailVerified: true },
        include: { UserRole: true },
      });
    }
    if (!user) throw new UnauthorizedException('Google account could not be resolved');
    if (user.suspended) throw new UnauthorizedException('This account is suspended');

    const loginCode = randomBytes(32).toString('hex');
    await this.prisma.actionToken.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        tokenHash: sha256(loginCode),
        purpose: 'OAUTH_LOGIN',
        expiresAt: new Date(Date.now() + 60 * 1000),
      },
    });
    return loginCode;
  }

  async exchangeGoogleLoginCode(code: string) {
    const token = await this.prisma.actionToken.findUnique({ where: { tokenHash: sha256(code) } });
    if (!token || token.purpose !== 'OAUTH_LOGIN' || token.usedAt || token.expiresAt <= new Date()) {
      throw new UnauthorizedException('Google sign-in code is invalid or expired');
    }

    const consumed = await this.prisma.actionToken.updateMany({
      where: { id: token.id, purpose: 'OAUTH_LOGIN', usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) throw new UnauthorizedException('Google sign-in code is invalid or expired');

    const user = await this.prisma.user.findUnique({ where: { id: token.userId }, include: { UserRole: true } });
    if (!user || user.suspended) throw new UnauthorizedException('This account is unavailable');
    return this.issueSession(user.id, user.email, user.UserRole.map((role) => role.role));
  }

  getGoogleLoginRedirect(loginCode: string) {
    const redirect = new URL('/login', this.getCustomerWebOrigin());
    redirect.searchParams.set('google_code', loginCode);
    return redirect.toString();
  }

  getGoogleLoginErrorRedirect() {
    const redirect = new URL('/login', this.getCustomerWebOrigin());
    redirect.searchParams.set('google_error', 'sign_in_failed');
    return redirect.toString();
  }

  private async findOrCreateOtpUser(phone: string) {
    const profile = await this.prisma.customerProfile.findFirst({ where: { phone } });
    if (profile) return this.prisma.user.findUniqueOrThrow({ where: { id: profile.userId } });
    const randomEmail = `phone-${phone.replace(/\D/g, '')}@local.invalid`;
    return this.prisma.user.create({ data: { email: randomEmail, name: 'Customer', passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 12), CustomerProfile: { create: { phone } }, UserRole: { create: { role: 'CUSTOMER' } } } });
  }

  private async issueSession(userId: string, email: string, roles: string[]) {
    const accessToken = await this.jwt.signAsync({ sub: userId, email, roles }, { secret: process.env.JWT_SECRET, expiresIn: '15m' });
    const refreshToken = randomBytes(48).toString('hex');
    const familyId = randomUUID();
    await this.prisma.refreshSession.create({ data: { id: randomUUID(), userId, tokenHash: sha256(refreshToken), familyId, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } });
    return { accessToken, refreshToken, expiresIn: 900, user: { id: userId, email, roles } };
  }

  private getGoogleOAuthConfig() {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
    if (!clientId || !clientSecret || (process.env.NODE_ENV === 'production' && !redirectUri)) {
      throw new ServiceUnavailableException('Google sign-in is not configured');
    }
    return {
      clientId,
      clientSecret,
      redirectUri: redirectUri ?? 'http://localhost:3001/api/v1/auth/oauth/google/callback',
    };
  }

  private getCustomerWebOrigin() {
    const origin = process.env.CUSTOMER_WEB_ORIGIN
      ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000');
    if (!origin) throw new ServiceUnavailableException('Customer web origin is not configured');
    return new URL(origin).origin;
  }
}

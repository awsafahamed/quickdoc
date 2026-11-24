import { Injectable, UnauthorizedException, BadRequestException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto, ResetPasswordDto, ResetRequestDto, OtpRequestDto, OtpVerifyDto } from './auth.dto';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) throw new ConflictException('An account already uses this email');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        name: dto.name,
        passwordHash,
        CustomerProfile: dto.phone ? { create: { phone: dto.phone } } : undefined,
        UserRole: { create: { role: dto.role === 'SHOP_OWNER' ? 'SHOP_OWNER' : dto.role === 'RIDER' ? 'RIDER' : 'CUSTOMER' } },
      },
      include: { UserRole: true, CustomerProfile: true },
    });
    return this.issueSession(user.id, user.email, user.UserRole.map((role) => role.role));
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() }, include: { UserRole: true } });
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
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (user) {
      const token = randomBytes(32).toString('hex');
      await this.prisma.actionToken.create({ data: { id: randomUUID(), userId: user.id, tokenHash: sha256(token), purpose: 'RESET_PASSWORD', expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });
    }
    return { accepted: true };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = sha256(dto.token);
    const token = await this.prisma.actionToken.findUnique({ where: { tokenHash } });
    if (!token || token.purpose !== 'RESET_PASSWORD' || token.usedAt || token.expiresAt <= new Date()) throw new BadRequestException('Reset token is invalid or expired');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: token.userId }, data: { passwordHash } }),
      this.prisma.actionToken.update({ where: { id: token.id }, data: { usedAt: new Date() } }),
      this.prisma.refreshSession.updateMany({ where: { userId: token.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return { passwordReset: true };
  }

  async requestOtp(dto: OtpRequestDto) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await this.prisma.actionToken.create({ data: { id: randomUUID(), userId: (await this.findOrCreateOtpUser(dto.phone)).id, tokenHash: sha256(dto.phone + ':' + code), purpose: 'VERIFY_EMAIL', expiresAt: new Date(Date.now() + 5 * 60 * 1000) } });
    return { accepted: true, developmentCode: process.env.NODE_ENV === 'development' ? code : undefined };
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
}

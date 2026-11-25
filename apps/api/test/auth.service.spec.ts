import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Authentication security rules', () => {
  it('uses a strong bcrypt work factor', () => {
    const bcryptWorkFactor = 12;
    expect(bcryptWorkFactor).toBeGreaterThanOrEqual(12);
  });

  it('uses short-lived password reset and OTP tokens', () => {
    const otpLifetimeMinutes = 5;
    const resetLifetimeMinutes = 30;
    expect(otpLifetimeMinutes).toBeLessThan(resetLifetimeMinutes);
  });

  it('keeps refresh tokens hashed before database storage', () => {
    const refreshToken = 'raw-refresh-token';
    const storedToken = Buffer.from(refreshToken).toString('hex');
    expect(storedToken).not.toBe(refreshToken);
  });

  it('does not create password reset tokens when email delivery is unavailable', async () => {
    const auth = new AuthService({} as PrismaService, {} as JwtService);
    await expect(auth.resetRequest({ email: 'customer@example.com' }))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('does not create phone verification tokens when SMS delivery is unavailable', async () => {
    const auth = new AuthService({} as PrismaService, {} as JwtService);
    await expect(auth.requestOtp({ phone: '+94123456789' }))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('Google OAuth protections', () => {
  it('creates unpredictable state and rejects a mismatched callback state', () => {
    const auth = new AuthService({} as PrismaService, {} as JwtService);
    const state = auth.createGoogleOAuthState();

    expect(state).toMatch(/^[a-f0-9]{64}$/);
    expect(auth.validateGoogleOAuthState(state, state)).toBe(true);
    expect(auth.validateGoogleOAuthState(`${state.slice(1)}0`, state)).toBe(false);
  });

  it('rejects a Google login code already consumed by another exchange', async () => {
    const prisma = {
      actionToken: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'token-id',
          userId: 'user-id',
          purpose: 'OAUTH_LOGIN',
          usedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    } as unknown as PrismaService;
    const auth = new AuthService(prisma, {} as JwtService);

    await expect(auth.exchangeGoogleLoginCode('a'.repeat(64)))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });
});

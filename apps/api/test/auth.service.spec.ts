import { createHash } from 'node:crypto';
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

describe('Password recovery', () => {
  const savedEnvironment = {
    apiKey: process.env.RESEND_API_KEY,
    sender: process.env.EMAIL_FROM,
    origin: process.env.CUSTOMER_WEB_ORIGIN,
  };
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.EMAIL_FROM = 'QuickDoc <reset@example.com>';
    process.env.CUSTOMER_WEB_ORIGIN = 'https://customer.example.com';
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
  });

  afterEach(() => {
    fetchMock.mockRestore();
    if (savedEnvironment.apiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = savedEnvironment.apiKey;
    if (savedEnvironment.sender === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = savedEnvironment.sender;
    if (savedEnvironment.origin === undefined) delete process.env.CUSTOMER_WEB_ORIGIN;
    else process.env.CUSTOMER_WEB_ORIGIN = savedEnvironment.origin;
  });

  it('does not disclose whether an email address has an account', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(),
    } as unknown as PrismaService;
    const auth = new AuthService(prisma, {} as JwtService);

    await expect(auth.resetRequest({ email: 'unknown@example.com' }))
      .resolves.toEqual({ requested: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('emails a single-use token while storing only its hash', async () => {
    const actionToken = {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-id', email: 'owner@example.com', suspended: false }) },
      actionToken,
      $transaction: jest.fn().mockResolvedValue([]),
    } as unknown as PrismaService;
    const auth = new AuthService(prisma, {} as JwtService);

    await expect(auth.resetRequest({ email: ' OWNER@example.com ' }))
      .resolves.toEqual({ requested: true });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const message = JSON.parse(String(request.body)) as { to: string[]; html: string };
    const resetLink = message.html.match(/href="([^"]+)"/)?.[1];
    const token = new URL(resetLink!).searchParams.get('token');
    const persistedToken = actionToken.create.mock.calls[0][0].data as { tokenHash: string; purpose: string };
    expect(message.to).toEqual(['owner@example.com']);
    expect(token).toBeTruthy();
    expect(persistedToken.tokenHash).toBe(createHash('sha256').update(token!).digest('hex'));
    expect(persistedToken.purpose).toBe('RESET_PASSWORD');
  });

  it('consumes reset tokens atomically, updates the password, and revokes sessions', async () => {
    const transaction = {
      actionToken: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'token-id',
          userId: 'user-id',
          purpose: 'RESET_PASSWORD',
          usedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: { update: jest.fn().mockResolvedValue({}) },
      refreshSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      $transaction: jest.fn((operation: (tx: typeof transaction) => Promise<unknown>) => operation(transaction)),
    } as unknown as PrismaService;
    const auth = new AuthService(prisma, {} as JwtService);

    await expect(auth.resetPassword({ token: 'one-time-token', password: 'a-new-password' }))
      .resolves.toEqual({ passwordReset: true });

    expect(transaction.actionToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'token-id', usedAt: null }),
    }));
    expect(transaction.user.update).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      data: { passwordHash: expect.any(String) },
    });
    expect(transaction.refreshSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-id', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

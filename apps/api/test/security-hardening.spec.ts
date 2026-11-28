import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { validateEnvironment } from '../src/config/env.validation';
import {
  decryptHandoverCode,
  encryptHandoverCode,
  handoverCodeMatches,
  hashHandoverCode,
  issueHandoverCodes,
} from '../src/orders/handover-codes';
import { serializeOrder } from '../src/orders/order-lifecycle';

describe('refresh token rotation', () => {
  const session = (overrides: Record<string, unknown> = {}) => ({
    id: 'session-id',
    userId: 'user-id',
    familyId: 'family-id',
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    User: { email: 'person@example.com', suspended: false, UserRole: [{ role: 'CUSTOMER' }] },
    ...overrides,
  });

  function setup(found: unknown, rotatedCount = 1) {
    const prisma = {
      refreshSession: {
        findUnique: jest.fn().mockResolvedValue(found),
        updateMany: jest.fn().mockResolvedValue({ count: rotatedCount }),
        create: jest.fn(),
      },
    };
    const jwt = { signAsync: jest.fn().mockResolvedValue('access-token') } as unknown as JwtService;
    return { prisma, auth: new AuthService(prisma as unknown as PrismaService, jwt) };
  }

  it('rotates within the same family', async () => {
    const { prisma, auth } = setup(session());
    await auth.refresh('r'.repeat(96));
    expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith({
      where: { id: 'session-id', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.refreshSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-id', familyId: 'family-id' }),
    });
  });

  it('revokes the whole family when a rotated token is replayed', async () => {
    const { prisma, auth } = setup(session({ revokedAt: new Date(Date.now() - 5 * 60_000) }));
    await expect(auth.refresh('r'.repeat(96))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-id', familyId: 'family-id', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.refreshSession.create).not.toHaveBeenCalled();
  });

  it('refuses but does not punish a near-simultaneous refresh race', async () => {
    const { prisma, auth } = setup(session({ revokedAt: new Date(Date.now() - 2_000) }));
    await expect(auth.refresh('r'.repeat(96))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshSession.updateMany).not.toHaveBeenCalled();
  });

  it('refuses suspended users', async () => {
    const { prisma, auth } = setup(session({ User: { email: 'x@example.com', suspended: true, UserRole: [] } }));
    await expect(auth.refresh('r'.repeat(96))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshSession.create).not.toHaveBeenCalled();
  });

  it('lets only one of two concurrent refreshes win', async () => {
    const { prisma, auth } = setup(session(), 0);
    await expect(auth.refresh('r'.repeat(96))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshSession.create).not.toHaveBeenCalled();
  });
});

describe('handover codes', () => {
  it('round-trips through authenticated encryption and rejects tampering', () => {
    const encrypted = encryptHandoverCode('A1B2C3');
    expect(encrypted).not.toContain('A1B2C3');
    expect(decryptHandoverCode(encrypted)).toBe('A1B2C3');
    const tampered = `${encrypted.slice(0, -2)}${encrypted.endsWith('AA') ? 'BB' : 'AA'}`;
    expect(decryptHandoverCode(tampered)).toBeNull();
  });

  it('issues six-character hex codes that match their stored hash case-insensitively', () => {
    const { pickupCode, deliveryPin, fields } = issueHandoverCodes();
    expect(pickupCode).toMatch(/^[0-9A-F]{6}$/);
    expect(deliveryPin).toMatch(/^[0-9A-F]{6}$/);
    expect(handoverCodeMatches(pickupCode.toLowerCase(), fields.pickupCodeHash)).toBe(true);
    expect(handoverCodeMatches('000000', hashHandoverCode('FFFFFF'))).toBe(false);
  });

  it('shows the delivery PIN only to the customer and the pickup code only to the shop', () => {
    const { fields } = issueHandoverCodes();
    const order = { id: 'o', status: 'RIDER_ASSIGNED', pinAttempts: 0, ...fields };
    const customer = serializeOrder(order, 'customer');
    const shop = serializeOrder(order, 'shop');
    const other = serializeOrder(order, 'other');
    expect(customer.deliveryPin).toBe(decryptHandoverCode(fields.deliveryPinEncrypted));
    expect(customer).not.toHaveProperty('pickupCode');
    expect(shop.pickupCode).toBe(decryptHandoverCode(fields.pickupCodeEncrypted));
    expect(shop).not.toHaveProperty('deliveryPin');
    for (const view of [customer, shop, other]) {
      expect(view).not.toHaveProperty('deliveryPinHash');
      expect(view).not.toHaveProperty('pickupCodeEncrypted');
    }
  });
});

describe('environment validation', () => {
  const base = { DATABASE_URL: 'postgresql://x', JWT_SECRET: 'x'.repeat(40), WEB_ORIGINS: 'https://a.example' };

  it('accepts a complete production configuration', () => {
    expect(validateEnvironment({ ...base, NODE_ENV: 'production' })).toEqual([]);
  });

  it('rejects weak secrets and local storage in production', () => {
    const errors = validateEnvironment({ ...base, NODE_ENV: 'production', JWT_SECRET: 'short', STORAGE_DRIVER: 'local' });
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('JWT_SECRET'),
      expect.stringContaining('STORAGE_DRIVER'),
    ]));
  });

  it('requires a database and signing secret everywhere', () => {
    expect(validateEnvironment({})).toEqual(expect.arrayContaining([
      expect.stringContaining('DATABASE_URL'),
      expect.stringContaining('JWT_SECRET'),
    ]));
  });
});

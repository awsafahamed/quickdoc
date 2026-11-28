import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

/** Wrong handover-code entries allowed before a fresh code must be issued. */
export const MAX_HANDOVER_ATTEMPTS = 5;

const KEY_INFO = 'quickdoc:handover-codes:v1';

function encryptionKey(): Buffer {
  const dedicated = process.env.DATA_ENCRYPTION_KEY;
  if (dedicated) return createHash('sha256').update(dedicated).digest();
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error('DATA_ENCRYPTION_KEY or JWT_SECRET is required to protect handover codes');
  return Buffer.from(hkdfSync('sha256', jwtSecret, 'quickdoc', KEY_INFO, 32));
}

/** Six upper-case hexadecimal characters, the format the rider portal accepts. */
export function generateHandoverCode(): string {
  return randomBytes(3).toString('hex').toUpperCase();
}

export function hashHandoverCode(code: string): string {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

export function handoverCodeMatches(code: string, storedHash: string): boolean {
  const supplied = Buffer.from(hashHandoverCode(code), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

/** AES-256-GCM so the shop and customer can be shown their code again later. */
export function encryptHandoverCode(code: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

/** Returns null when the value is absent or was encrypted with a different key. */
export function decryptHandoverCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const [version, iv, tag, ciphertext] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** New pickup code and delivery PIN, in the shape stored on an order. */
export function issueHandoverCodes() {
  const pickupCode = generateHandoverCode();
  const deliveryPin = generateHandoverCode();
  return {
    pickupCode,
    deliveryPin,
    fields: {
      pickupCodeHash: hashHandoverCode(pickupCode),
      pickupCodeEncrypted: encryptHandoverCode(pickupCode),
      deliveryPinHash: hashHandoverCode(deliveryPin),
      deliveryPinEncrypted: encryptHandoverCode(deliveryPin),
    },
  };
}

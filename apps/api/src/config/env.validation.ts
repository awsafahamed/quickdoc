import { Logger } from '@nestjs/common';

const logger = new Logger('Environment');

type Environment = Record<string, string | undefined>;

/**
 * Validates process configuration once at startup.
 *
 * Settings without which the API cannot operate safely (database, signing secret)
 * stop the process. Integrations that only disable individual features (email,
 * Google sign-in, object storage) are reported loudly so the operator can see
 * exactly which features are unavailable, without taking the whole API down.
 */
export function validateEnvironment(env: Environment = process.env): string[] {
  const production = env.NODE_ENV === 'production';
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!env.DATABASE_URL) errors.push('DATABASE_URL is required');

  const jwtSecret = env.JWT_SECRET ?? '';
  if (!jwtSecret) errors.push('JWT_SECRET is required');
  else if (production && Buffer.byteLength(jwtSecret) < 32) {
    errors.push('JWT_SECRET must be at least 32 bytes in production');
  }

  const encryptionKey = env.DATA_ENCRYPTION_KEY;
  if (encryptionKey && Buffer.byteLength(encryptionKey) < 32) {
    errors.push('DATA_ENCRYPTION_KEY must be at least 32 bytes when set');
  } else if (!encryptionKey && production) {
    warnings.push('DATA_ENCRYPTION_KEY is not set; handover codes are encrypted with a key derived from JWT_SECRET. Set a dedicated key so JWT_SECRET can be rotated independently.');
  }

  if (production) {
    if (!(env.WEB_ORIGINS ?? env.WEB_ORIGIN)) {
      errors.push('WEB_ORIGINS must list the production portal origins');
    }
    if (env.STORAGE_DRIVER === 'local') {
      errors.push('STORAGE_DRIVER=local is not allowed in production');
    }
    const storageNames: [string, ...string[]][] = [
      ['S3_BUCKET', 'AWS_S3_BUCKET'],
      ['S3_REGION', 'AWS_REGION', 'AWS_DEFAULT_REGION'],
      ['S3_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID'],
      ['S3_SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY'],
    ];
    const missingStorage = storageNames
      .filter((names) => !names.some((name) => env[name]?.trim()))
      .map((names) => names.join(' or '));
    if (missingStorage.length) {
      warnings.push(`Document uploads are unavailable until ${missingStorage.join(', ')} are configured`);
    }
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
      warnings.push('Password reset email is unavailable until RESEND_API_KEY and EMAIL_FROM are configured');
    }
    if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET || !env.GOOGLE_OAUTH_REDIRECT_URI) {
      warnings.push('Google sign-in is unavailable until the GOOGLE_OAUTH_* variables are configured');
    }
    if (!env.CUSTOMER_WEB_ORIGIN) {
      warnings.push('CUSTOMER_WEB_ORIGIN is not set; password reset and Google sign-in redirects are unavailable');
    }
  }

  for (const warning of warnings) logger.warn(warning);
  return errors;
}

export function assertEnvironment(env: Environment = process.env): void {
  const errors = validateEnvironment(env);
  if (errors.length) {
    for (const error of errors) logger.error(error);
    throw new Error(`Invalid configuration: ${errors.join('; ')}`);
  }
}

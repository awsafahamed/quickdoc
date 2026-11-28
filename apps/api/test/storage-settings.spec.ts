import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PrivateObjectStorageService } from '../src/storage/private-object-storage.service';
import { validateEnvironment } from '../src/config/env.validation';

const awsNames = {
  NODE_ENV: 'production',
  AWS_REGION: 'ap-south-1',
  AWS_S3_BUCKET: 'quickdoc-storage-unique-id',
  AWS_ACCESS_KEY_ID: 'AKIAEXAMPLEEXAMPLE00',
  AWS_SECRET_ACCESS_KEY: 'example-secret-key-for-signing-only-000000',
};

function storageWith(values: Record<string, string>) {
  return new PrivateObjectStorageService({ get: (key: string) => values[key] } as unknown as ConfigService);
}

describe('S3 storage settings', () => {
  it('signs private upload links using the standard AWS_* variable names', async () => {
    const key = `private/customers/${randomUUID()}/${randomUUID()}.pdf`;
    const url = new URL(await storageWith(awsNames).createUploadUrl(key));
    expect(url.hostname).toBe('quickdoc-storage-unique-id.s3.ap-south-1.amazonaws.com');
    expect(url.pathname).toBe(`/${key}`);
    expect(url.searchParams.get('X-Amz-Credential')).toContain('AKIAEXAMPLEEXAMPLE00/');
    expect(url.searchParams.get('X-Amz-Credential')).toContain('/ap-south-1/s3/');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
  });

  it('prefers the QuickDoc S3_* names when both are set', async () => {
    const key = `private/customers/${randomUUID()}/${randomUUID()}.pdf`;
    const url = new URL(await storageWith({ ...awsNames, S3_BUCKET: 'other-bucket' }).createUploadUrl(key));
    expect(url.hostname.startsWith('other-bucket.')).toBe(true);
  });

  it('does not warn about missing storage when only AWS_* names are configured', () => {
    const warn = jest.spyOn(require('@nestjs/common').Logger.prototype, 'warn').mockImplementation(() => undefined);
    validateEnvironment({ ...awsNames, DATABASE_URL: 'postgresql://x', JWT_SECRET: 'x'.repeat(40), WEB_ORIGINS: 'https://a.example' });
    expect(warn.mock.calls.flat().join(' ')).not.toContain('Document uploads are unavailable');
    warn.mockRestore();
  });
});

import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
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
  it('gives browsers an upload link on this API (no bucket CORS needed) and stores the PDF in S3', async () => {
    const storage = storageWith({ ...awsNames, RENDER_EXTERNAL_URL: 'https://quickdoc-fwuf.onrender.com', JWT_SECRET: 'j'.repeat(40) });
    const key = `private/customers/${randomUUID()}/${randomUUID()}.pdf`;
    const url = new URL(await storage.createUploadUrl(key));
    expect(url.origin).toBe('https://quickdoc-fwuf.onrender.com');
    expect(url.pathname.startsWith('/api/v1/storage/upload/')).toBe(true);
    expect(url.search).toBe('');

    const sent: { name: string; input: Record<string, unknown> }[] = [];
    (storage as unknown as { client: unknown }).client = {
      send: jest.fn(async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
        sent.push({ name: command.constructor.name, input: command.input });
        if (command.constructor.name === 'HeadObjectCommand') throw Object.assign(new Error('missing'), { name: 'NotFound' });
        return {};
      }),
    };
    const pdf = Buffer.from('%PDF-1.7\n%test');
    await storage.writeUpload(url.pathname.split('/').pop()!, 'application/pdf', pdf);
    const put = sent.find((call) => call.name === 'PutObjectCommand');
    expect(put?.input).toEqual(expect.objectContaining({ Bucket: 'quickdoc-storage-unique-id', Key: key, ContentType: 'application/pdf', Body: pdf }));
  });

  it('rejects a non-PDF body before anything reaches S3', async () => {
    const storage = storageWith({ ...awsNames, JWT_SECRET: 'j'.repeat(40) });
    const key = `private/customers/${randomUUID()}/${randomUUID()}.pdf`;
    const token = new URL(await storage.createUploadUrl(key)).pathname.split('/').pop()!;
    const send = jest.fn();
    (storage as unknown as { client: unknown }).client = { send };
    await expect(storage.writeUpload(token, 'application/pdf', Buffer.from('not a pdf'))).rejects.toThrow('not a valid PDF');
    expect(send).not.toHaveBeenCalled();
  });

  it('prefers the QuickDoc S3_* names when both are set and signs previews without checksum parameters', async () => {
    const key = `private/customers/${randomUUID()}/${randomUUID()}.pdf`;
    const url = new URL(await storageWith({ ...awsNames, S3_BUCKET: 'other-bucket' }).createPreviewUrl(key, 'file.pdf'));
    expect(url.hostname).toBe('other-bucket.s3.ap-south-1.amazonaws.com');
    expect(url.searchParams.has('x-amz-checksum-crc32')).toBe(false);
    expect(url.searchParams.get('X-Amz-Credential')).toContain('/ap-south-1/s3/');
  });

  it('reports S3 permission problems clearly instead of an internal server error', async () => {
    const storage = storageWith({ ...awsNames, JWT_SECRET: 'j'.repeat(40) });
    const key = `private/customers/${randomUUID()}/${randomUUID()}.pdf`;
    const token = new URL(await storage.createUploadUrl(key)).pathname.split('/').pop()!;
    const denied = Object.assign(new Error('Access Denied'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } });
    (storage as unknown as { client: unknown }).client = { send: jest.fn().mockRejectedValue(denied) };
    const error = await storage.writeUpload(token, 'application/pdf', Buffer.from('%PDF-1.7')).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as Error).message).toContain('s3:PutObject');
  });

  it('refuses a reused upload link using a conditional write (no ListBucket permission needed)', async () => {
    const storage = storageWith({ ...awsNames, JWT_SECRET: 'j'.repeat(40) });
    const key = `private/customers/${randomUUID()}/${randomUUID()}.pdf`;
    const token = new URL(await storage.createUploadUrl(key)).pathname.split('/').pop()!;
    const send = jest.fn().mockRejectedValue(Object.assign(new Error('At least one of the pre-conditions failed'), { name: 'PreconditionFailed', $metadata: { httpStatusCode: 412 } }));
    (storage as unknown as { client: unknown }).client = { send };
    await expect(storage.writeUpload(token, 'application/pdf', Buffer.from('%PDF-1.7'))).rejects.toBeInstanceOf(ConflictException);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].input).toEqual(expect.objectContaining({ IfNoneMatch: '*' }));
  });

  it('health check writes, reads and deletes a test object', async () => {
    const storage = storageWith(awsNames);
    const names: string[] = [];
    (storage as unknown as { client: unknown }).client = { send: jest.fn(async (command: { constructor: { name: string } }) => { names.push(command.constructor.name); return {}; }) };
    await expect(storage.checkHealth()).resolves.toEqual({ status: 'ok', driver: 's3', bucket: 'quickdoc-storage-unique-id', region: 'ap-south-1' });
    expect(names).toEqual(['PutObjectCommand', 'GetObjectCommand', 'DeleteObjectCommand']);
  });

  it('does not warn about missing storage when only AWS_* names are configured', () => {
    const warn = jest.spyOn(require('@nestjs/common').Logger.prototype, 'warn').mockImplementation(() => undefined);
    validateEnvironment({ ...awsNames, DATABASE_URL: 'postgresql://x', JWT_SECRET: 'x'.repeat(40), WEB_ORIGINS: 'https://a.example' });
    expect(warn.mock.calls.flat().join(' ')).not.toContain('Document uploads are unavailable');
    warn.mockRestore();
  });
});

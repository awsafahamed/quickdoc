import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PrivateObjectStorageService } from '../src/storage/private-object-storage.service';

describe('PrivateObjectStorageService local test backend', () => {
  let directory: string;
  const signingSecret = 'local-test-signing-secret-that-is-long-enough';
  const objectKey = () => `private/customers/${randomUUID()}/${randomUUID()}.pdf`;
  const shopObjectKey = () => `private/shops/${randomUUID()}/${randomUUID()}.pdf`;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'quickdoc-private-documents-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  function createStorage(overrides: Record<string, string> = {}) {
    const values: Record<string, string> = {
      STORAGE_DRIVER: 'local',
      LOCAL_STORAGE_PATH: directory,
      LOCAL_STORAGE_BASE_URL: 'http://localhost:3001/api/v1',
      LOCAL_STORAGE_SIGNING_SECRET: signingSecret,
      ...overrides,
    };
    const config = {
      get: (key: string) => values[key],
    } as unknown as ConfigService;
    return new PrivateObjectStorageService(config);
  }

  function tokenFrom(url: string): string {
    const token = new URL(url).pathname.split('/').pop();
    if (!token) throw new Error('Storage URL did not include a token');
    return token;
  }

  it('stores, validates, previews, and deletes a private PDF through expiring links', async () => {
    const storage = createStorage();
    const key = objectKey();
    const pdf = Buffer.from('%PDF-1.4\nlocal test document');
    const uploadToken = tokenFrom(await storage.createUploadUrl(key));

    await storage.writeLocalUpload(uploadToken, 'application/pdf', pdf);
    await expect(storage.verifyPdfUpload(key, pdf.length)).resolves.toBeUndefined();

    const previewToken = tokenFrom(await storage.createPreviewUrl(key, 'local test.pdf'));
    await expect(storage.readLocalPreview(previewToken)).resolves.toEqual({
      body: pdf,
      fileName: 'local test.pdf',
    });

    await storage.deleteObject(key);
    await expect(storage.verifyPdfUpload(key, pdf.length)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid keys, altered links, non-PDF content, and oversized uploads', async () => {
    const storage = createStorage();
    await expect(storage.createUploadUrl('../private/document.pdf')).rejects.toBeInstanceOf(BadRequestException);

    const key = objectKey();
    const token = tokenFrom(await storage.createUploadUrl(key));
    const [payload, signature] = token.split('.');
    const alteredToken = `${payload}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
    await expect(storage.writeLocalUpload(alteredToken, 'application/pdf', Buffer.from('%PDF-')))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(storage.writeLocalUpload(token, 'application/pdf', Buffer.from('not a PDF')))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(storage.writeLocalUpload(token, 'application/pdf', Buffer.alloc(25 * 1024 * 1024 + 1)))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('copies a private shop catalogue PDF into a customer-owned private key', async () => {
    const storage = createStorage();
    const sourceKey = shopObjectKey();
    const customerKey = objectKey();
    const pdf = Buffer.from('%PDF-1.4\ncatalog document');
    const uploadToken = tokenFrom(await storage.createUploadUrl(sourceKey));

    await storage.writeLocalUpload(uploadToken, 'application/pdf', pdf);
    await storage.copyCatalogPdfToCustomer(sourceKey, customerKey);
    await expect(storage.verifyPdfUpload(customerKey, pdf.length)).resolves.toBeUndefined();
    const previewToken = tokenFrom(await storage.createPreviewUrl(customerKey, 'selected.pdf'));
    await expect(storage.readLocalPreview(previewToken)).resolves.toEqual({
      body: pdf,
      fileName: 'selected.pdf',
    });
  });

  it('refuses local filesystem storage in production', async () => {
    const storage = createStorage({ NODE_ENV: 'production' });
    await expect(storage.createUploadUrl(objectKey()))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

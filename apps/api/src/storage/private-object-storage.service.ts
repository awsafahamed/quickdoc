import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  CopyObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { copyFile, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

type LocalStorageOperation = 'upload' | 'preview';
type LocalStorageToken = {
  objectKey: string;
  operation: LocalStorageOperation;
  expiresAt: number;
  fileName?: string;
};

const MAX_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024;
const CUSTOMER_PDF_KEY = /^private\/customers\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/i;
const SHOP_CATALOG_PDF_KEY = new RegExp(CUSTOMER_PDF_KEY.source.replace('customers', 'shops'), 'i');

@Injectable()
export class PrivateObjectStorageService {
  private client: S3Client | null = null;
  private readonly ephemeralSigningSecret = randomBytes(32);

  constructor(private readonly config: ConfigService) {}

  private get isProduction(): boolean {
    return (this.config.get<string>('NODE_ENV') ?? process.env.NODE_ENV) === 'production';
  }

  private get driver(): 'local' | 's3' {
    const configuredDriver = this.config.get<string>('STORAGE_DRIVER');
    if (configuredDriver === 'local') {
      if (this.isProduction) {
        throw new ServiceUnavailableException('Local document storage is disabled in production');
      }
      return 'local';
    }
    if (configuredDriver === 's3') return 's3';
    if (configuredDriver) {
      throw new ServiceUnavailableException('Unsupported private document storage driver');
    }

    const hasAnyS3Config = [
      'S3_BUCKET',
      'S3_REGION',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
      'S3_ENDPOINT',
    ].some((key) => Boolean(this.config.get<string>(key)));
    return this.isProduction || hasAnyS3Config ? 's3' : 'local';
  }

  private get bucket(): string {
    const bucket = this.config.get<string>('S3_BUCKET');
    if (!bucket) throw new ServiceUnavailableException('Private document storage is not configured');
    return bucket;
  }

  private getClient(): S3Client {
    if (this.client) return this.client;

    const region = this.config.get<string>('S3_REGION');
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('S3_SECRET_ACCESS_KEY');
    if (!region || !accessKeyId || !secretAccessKey) {
      throw new ServiceUnavailableException('Private document storage is not configured');
    }

    const endpoint = this.config.get<string>('S3_ENDPOINT');
    const forcePathStyle = this.config.get<string>('S3_FORCE_PATH_STYLE');
    this.client = new S3Client({
      region,
      endpoint,
      forcePathStyle: forcePathStyle ? forcePathStyle === 'true' : Boolean(endpoint),
      credentials: { accessKeyId, secretAccessKey },
    });
    return this.client;
  }

  private localObjectPath(objectKey: string): string {
    if (!CUSTOMER_PDF_KEY.test(objectKey) && !SHOP_CATALOG_PDF_KEY.test(objectKey)) {
      throw new BadRequestException('Private document key is invalid');
    }
    const root = resolve(
      this.config.get<string>('LOCAL_STORAGE_PATH') ?? join(__dirname, '..', '..', '.private-documents'),
    );
    const path = resolve(root, ...objectKey.split('/'));
    if (!path.startsWith(`${root}${sep}`)) {
      throw new BadRequestException('Private document key is invalid');
    }
    return path;
  }

  private localTokenSecret(): Buffer {
    const configuredSecret = this.config.get<string>('LOCAL_STORAGE_SIGNING_SECRET');
    if (configuredSecret && Buffer.byteLength(configuredSecret) < 32) {
      throw new ServiceUnavailableException('Local storage signing secret must be at least 32 bytes');
    }
    return configuredSecret ? Buffer.from(configuredSecret) : this.ephemeralSigningSecret;
  }

  private createLocalToken(token: LocalStorageToken): string {
    const payload = Buffer.from(JSON.stringify(token)).toString('base64url');
    const signature = createHmac('sha256', this.localTokenSecret()).update(payload).digest('base64url');
    return `${payload}.${signature}`;
  }

  private verifyLocalToken(token: string, operation: LocalStorageOperation): LocalStorageToken {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra !== undefined) {
      throw new BadRequestException('Storage link is invalid or expired');
    }

    const expectedSignature = createHmac('sha256', this.localTokenSecret()).update(payload).digest();
    const actualSignature = Buffer.from(signature, 'base64url');
    if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) {
      throw new BadRequestException('Storage link is invalid or expired');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      throw new BadRequestException('Storage link is invalid or expired');
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new BadRequestException('Storage link is invalid or expired');
    }
    const tokenData = parsed as Partial<LocalStorageToken>;
    if (
      tokenData.operation !== operation
      || typeof tokenData.objectKey !== 'string'
      || typeof tokenData.expiresAt !== 'number'
      || tokenData.expiresAt <= Math.floor(Date.now() / 1000)
      || (operation === 'preview' && typeof tokenData.fileName !== 'string')
    ) {
      throw new BadRequestException('Storage link is invalid or expired');
    }
    this.localObjectPath(tokenData.objectKey);
    return tokenData as LocalStorageToken;
  }

  private localUrl(token: LocalStorageToken): string {
    const baseUrl = this.config.get<string>('LOCAL_STORAGE_BASE_URL')
      ?? `http://localhost:${this.config.get<string>('API_PORT') ?? '3001'}/api/v1`;
    return `${baseUrl.replace(/\/+$/, '')}/storage/local/${this.createLocalToken(token)}`;
  }

  async createUploadUrl(objectKey: string): Promise<string> {
    if (this.driver === 'local') {
      this.localObjectPath(objectKey);
      return this.localUrl({
        objectKey,
        operation: 'upload',
        expiresAt: Math.floor(Date.now() / 1000) + 300,
      });
    }
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: 'application/pdf',
    });
    return getSignedUrl(this.getClient(), command, { expiresIn: 300 });
  }

  async writeLocalUpload(token: string, contentType: string | undefined, body: Buffer): Promise<void> {
    if (this.driver !== 'local') {
      throw new ServiceUnavailableException('Local document storage is disabled');
    }
    const { objectKey } = this.verifyLocalToken(token, 'upload');
    if (contentType?.split(';', 1)[0].trim().toLowerCase() !== 'application/pdf') {
      throw new BadRequestException('Only PDF documents are supported');
    }
    if (!Buffer.isBuffer(body) || body.length === 0 || body.length > MAX_DOCUMENT_SIZE_BYTES) {
      throw new BadRequestException('PDF must be between 1 byte and 25 MB');
    }
    if (body.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new BadRequestException('The uploaded file is not a valid PDF');
    }

    const path = this.localObjectPath(objectKey);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    try {
      await writeFile(path, body, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new ConflictException('This upload link has already been used');
      }
      throw error;
    }
  }

  async verifyPdfUpload(objectKey: string, expectedSizeBytes: number): Promise<void> {
    if (!CUSTOMER_PDF_KEY.test(objectKey) && !SHOP_CATALOG_PDF_KEY.test(objectKey)) {
      throw new BadRequestException('Private document key is invalid');
    }
    if (this.driver === 'local') {
      let document: Buffer;
      try {
        document = await readFile(this.localObjectPath(objectKey));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new BadRequestException('Uploaded PDF was not found');
        }
        throw error;
      }
      if (document.length !== expectedSizeBytes) {
        throw new BadRequestException('Uploaded PDF metadata does not match the selected file');
      }
      if (document.subarray(0, 5).toString('ascii') !== '%PDF-') {
        throw new BadRequestException('The uploaded file is not a valid PDF');
      }
      return;
    }

    const client = this.getClient();
    let metadata;
    try {
      metadata = await client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }));
    } catch (error) {
      if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) {
        throw new BadRequestException('Uploaded PDF was not found');
      }
      throw error;
    }

    if (metadata.ContentLength !== expectedSizeBytes || metadata.ContentType !== 'application/pdf') {
      throw new BadRequestException('Uploaded PDF metadata does not match the selected file');
    }

    const response = await client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      Range: 'bytes=0-4',
    }));
    const signature = await response.Body?.transformToByteArray();
    if (!signature || new TextDecoder().decode(signature) !== '%PDF-') {
      throw new BadRequestException('The uploaded file is not a valid PDF');
    }
  }

  async copyCatalogPdfToCustomer(sourceKey: string, destinationKey: string): Promise<void> {
    if (!SHOP_CATALOG_PDF_KEY.test(sourceKey) || !CUSTOMER_PDF_KEY.test(destinationKey)) {
      throw new BadRequestException('Private document key is invalid');
    }
    if (this.driver === 'local') {
      const sourcePath = this.localObjectPath(sourceKey);
      const destinationPath = this.localObjectPath(destinationKey);
      await mkdir(dirname(destinationPath), { recursive: true, mode: 0o700 });
      try {
        await copyFile(sourcePath, destinationPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new NotFoundException('The catalogue PDF is no longer available');
        }
        throw error;
      }
      return;
    }
    await this.getClient().send(new CopyObjectCommand({
      Bucket: this.bucket,
      CopySource: `${this.bucket}/${sourceKey.split('/').map(encodeURIComponent).join('/')}`,
      Key: destinationKey,
      ContentType: 'application/pdf',
      MetadataDirective: 'REPLACE',
    }));
  }

  async createPreviewUrl(objectKey: string, fileName: string): Promise<string> {
    if (this.driver === 'local') {
      this.localObjectPath(objectKey);
      return this.localUrl({
        objectKey,
        operation: 'preview',
        expiresAt: Math.floor(Date.now() / 1000) + 300,
        fileName,
      });
    }
    const safeFileName = encodeURIComponent(fileName).replace(/[!'()*]/g, (character) => (
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    ));
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ResponseContentType: 'application/pdf',
      ResponseContentDisposition: `inline; filename*=UTF-8''${safeFileName}`,
    });
    return getSignedUrl(this.getClient(), command, { expiresIn: 300 });
  }

  async readLocalPreview(token: string): Promise<{ body: Buffer; fileName: string }> {
    if (this.driver !== 'local') {
      throw new ServiceUnavailableException('Local document storage is disabled');
    }
    const { objectKey, fileName } = this.verifyLocalToken(token, 'preview');
    if (typeof fileName !== 'string') {
      throw new BadRequestException('Storage link is invalid or expired');
    }
    try {
      return { body: await readFile(this.localObjectPath(objectKey)), fileName };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException('Uploaded PDF was not found');
      }
      throw error;
    }
  }

  async deleteObject(objectKey: string): Promise<void> {
    if (this.driver === 'local') {
      try {
        await unlink(this.localObjectPath(objectKey));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      return;
    }
    await this.getClient().send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }));
  }
}

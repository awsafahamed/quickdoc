import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  CopyObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHmac, hkdfSync, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { copyFile, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { PDFDocument } from 'pdf-lib';

type LocalStorageOperation = 'upload' | 'preview';
type LocalStorageToken = {
  objectKey: string;
  operation: LocalStorageOperation;
  expiresAt: number;
  fileName?: string;
};

const MAX_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_PDF_PAGES = 10000;

/** Parses the PDF and returns its page count; rejects files that are not readable PDFs. */
export async function countPdfPages(document: Uint8Array): Promise<number> {
  let pageCount: number;
  try {
    const pdf = await PDFDocument.load(document, { ignoreEncryption: true, updateMetadata: false });
    pageCount = pdf.getPageCount();
  } catch {
    throw new BadRequestException('The PDF could not be read. Re-export it and upload it again.');
  }
  if (pageCount < 1) throw new BadRequestException('The PDF has no pages');
  if (pageCount > MAX_PDF_PAGES) throw new BadRequestException(`PDFs can have at most ${MAX_PDF_PAGES} pages`);
  return pageCount;
}
const CUSTOMER_PDF_KEY = /^private\/customers\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/i;
/**
 * Each storage setting accepts the QuickDoc name or the standard AWS name, so either
 * S3_BUCKET or AWS_S3_BUCKET (and so on) works in the host's environment settings.
 */
export const STORAGE_SETTING_NAMES = {
  bucket: ['S3_BUCKET', 'AWS_S3_BUCKET'],
  region: ['S3_REGION', 'AWS_REGION', 'AWS_DEFAULT_REGION'],
  accessKeyId: ['S3_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID'],
  secretAccessKey: ['S3_SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY'],
  endpoint: ['S3_ENDPOINT', 'AWS_S3_ENDPOINT'],
} as const;

const SHOP_CATALOG_PDF_KEY = new RegExp(CUSTOMER_PDF_KEY.source.replace('customers', 'shops'), 'i');

@Injectable()
export class PrivateObjectStorageService {
  private client: S3Client | null = null;
  private readonly logger = new Logger('DocumentStorage');
  private readonly ephemeralSigningSecret = randomBytes(32);

  constructor(private readonly config: ConfigService) {}

  private setting(names: readonly string[]): string | undefined {
    for (const name of names) {
      const value = this.config.get<string>(name)?.trim();
      if (value) return value;
    }
    return undefined;
  }

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
      STORAGE_SETTING_NAMES.bucket,
      STORAGE_SETTING_NAMES.accessKeyId,
      STORAGE_SETTING_NAMES.secretAccessKey,
      STORAGE_SETTING_NAMES.endpoint,
    ].some((names) => Boolean(this.setting(names)));
    return this.isProduction || hasAnyS3Config ? 's3' : 'local';
  }

  private get bucket(): string {
    const bucket = this.setting(STORAGE_SETTING_NAMES.bucket);
    if (!bucket) throw new ServiceUnavailableException('Private document storage is not configured');
    return bucket;
  }

  private getClient(): S3Client {
    if (this.client) return this.client;

    const region = this.setting(STORAGE_SETTING_NAMES.region);
    const accessKeyId = this.setting(STORAGE_SETTING_NAMES.accessKeyId);
    const secretAccessKey = this.setting(STORAGE_SETTING_NAMES.secretAccessKey);
    if (!region || !accessKeyId || !secretAccessKey) {
      throw new ServiceUnavailableException('Private document storage is not configured');
    }

    const endpoint = this.setting(STORAGE_SETTING_NAMES.endpoint);
    const forcePathStyle = this.config.get<string>('S3_FORCE_PATH_STYLE');
    this.client = new S3Client({
      // Only add checksums where S3 requires them. Recent SDK versions otherwise attach
      // checksum parameters that S3-compatible services and signed links reject.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
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
    if (configuredSecret) return Buffer.from(configuredSecret);
    // Derive a stable key so upload links keep working across restarts and instances.
    const root = this.config.get<string>('DATA_ENCRYPTION_KEY') ?? this.config.get<string>('JWT_SECRET') ?? process.env.JWT_SECRET;
    return root
      ? Buffer.from(hkdfSync('sha256', root, 'quickdoc', 'quickdoc:storage-links:v1', 32))
      : this.ephemeralSigningSecret;
  }

  /** Public base URL of this API, used for upload links that browsers send PDFs to. */
  private apiBaseUrl(): string {
    const renderUrl = this.config.get<string>('RENDER_EXTERNAL_URL');
    const base = this.config.get<string>('LOCAL_STORAGE_BASE_URL')
      ?? this.config.get<string>('API_PUBLIC_URL')
      ?? (renderUrl ? `${renderUrl.replace(/\/+$/, '')}/api/v1` : undefined)
      ?? `http://localhost:${this.config.get<string>('API_PORT') ?? '3001'}/api/v1`;
    return base.replace(/\/+$/, '');
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
    return `${this.apiBaseUrl()}/storage/local/${this.createLocalToken(token)}`;
  }

  /** S3 status/code of an error, or undefined for non-S3 errors. */
  private s3Code(error: unknown): { code: string; status?: number } | undefined {
    if (!error || typeof error !== 'object') return undefined;
    const candidate = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
    if (!candidate.$metadata && !(error instanceof S3ServiceException)) return undefined;
    return { code: candidate.Code ?? candidate.name ?? 'UnknownError', status: candidate.$metadata?.httpStatusCode };
  }

  /**
   * Sends an S3 command. Missing objects return null when allowed; every other storage
   * failure is logged with its S3 code and reported with a message that names the fix.
   */
  private async s3<T>(command: object, action: string, options: { allowNotFound?: boolean } = {}): Promise<T | null> {
    try {
      return await this.getClient().send(command as never) as T;
    } catch (error) {
      const s3 = this.s3Code(error);
      if (!s3) throw error;
      if (options.allowNotFound && (s3.status === 404 || s3.code === 'NotFound' || s3.code === 'NoSuchKey')) return null;
      this.logger.error(`S3 ${action} failed: ${s3.code} (HTTP ${s3.status ?? '?'}) ${error instanceof Error ? error.message : ''}`);
      throw this.storageException(s3.code);
    }
  }

  private storageException(code: string) {
    const hints: Record<string, string> = {
      AccessDenied: 'Document storage refused access (AccessDenied). The storage access key needs s3:PutObject, s3:GetObject and s3:DeleteObject permission on this bucket.',
      AllAccessDisabled: 'Document storage refused access (AllAccessDisabled). Check the bucket permissions.',
      InvalidAccessKeyId: 'Document storage rejected the access key (InvalidAccessKeyId). Check AWS_ACCESS_KEY_ID.',
      SignatureDoesNotMatch: 'Document storage rejected the secret key (SignatureDoesNotMatch). Check AWS_SECRET_ACCESS_KEY.',
      NoSuchBucket: 'The document storage bucket was not found (NoSuchBucket). Check AWS_S3_BUCKET.',
      PermanentRedirect: 'The storage bucket is in a different region than AWS_REGION (PermanentRedirect).',
      AuthorizationHeaderMalformed: 'The storage bucket is in a different region than AWS_REGION (AuthorizationHeaderMalformed).',
      IllegalLocationConstraintException: 'The storage bucket is in a different region than AWS_REGION.',
    };
    return new ServiceUnavailableException(hints[code] ?? `Document storage is unavailable right now (${code}). Try again shortly.`);
  }

  /** Round-trips a tiny private object so operators can verify storage settings. */
  async checkHealth(): Promise<{ status: 'ok'; driver: string; bucket?: string; region?: string }> {
    if (this.driver === 'local') return { status: 'ok', driver: 'local' };
    const key = `private/healthcheck/${randomUUID()}.txt`;
    await this.s3(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: 'ok', ContentType: 'text/plain' }), 'health write');
    await this.s3(new GetObjectCommand({ Bucket: this.bucket, Key: key }), 'health read');
    await this.s3(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }), 'health delete');
    return { status: 'ok', driver: 's3', bucket: this.bucket, region: this.setting(STORAGE_SETTING_NAMES.region) };
  }

  /**
   * Upload links always point at this API rather than straight at the bucket. Browsers then
   * only talk to an origin that already allows the portals (no bucket CORS needed), and the
   * API validates the PDF before it is stored privately.
   */
  async createUploadUrl(objectKey: string): Promise<string> {
    if (!CUSTOMER_PDF_KEY.test(objectKey) && !SHOP_CATALOG_PDF_KEY.test(objectKey)) {
      throw new BadRequestException('Private document key is invalid');
    }
    // Fail fast when the configured backend is unusable (missing path or bucket settings).
    if (this.driver === 'local') this.localObjectPath(objectKey);
    else void this.bucket;
    const token = this.createLocalToken({ objectKey, operation: 'upload', expiresAt: Math.floor(Date.now() / 1000) + 300 });
    return `${this.apiBaseUrl()}/storage/upload/${token}`;
  }

  /** Kept for the original local-storage route. */
  async writeLocalUpload(token: string, contentType: string | undefined, body: Buffer): Promise<void> {
    return this.writeUpload(token, contentType, body);
  }

  async writeUpload(token: string, contentType: string | undefined, body: Buffer): Promise<void> {
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

    if (this.driver === 's3') {
      // Conditional write: refuse to overwrite instead of a separate existence check,
      // which needs extra (ListBucket) permission to answer correctly.
      try {
        await this.getClient().send(new PutObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
          Body: body,
          ContentType: 'application/pdf',
          ContentLength: body.length,
          IfNoneMatch: '*',
        }));
      } catch (error) {
        const s3 = this.s3Code(error);
        if (!s3) throw error;
        if (s3.status === 412 || s3.code === 'PreconditionFailed') {
          throw new ConflictException('This upload link has already been used');
        }
        this.logger.error(`S3 upload failed: ${s3.code} (HTTP ${s3.status ?? '?'}) ${error instanceof Error ? error.message : ''}`);
        throw this.storageException(s3.code);
      }
      return;
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

  /**
   * Confirms the uploaded object matches the declared size, is a readable PDF, and
   * returns the page count taken from the file itself (never from the client).
   */
  async verifyPdfUpload(objectKey: string, expectedSizeBytes: number): Promise<number> {
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
      return countPdfPages(document);
    }

    // One read returns both the bytes and the stored content type.
    const response = await this.s3<{ ContentType?: string; Body?: { transformToByteArray(): Promise<Uint8Array> } }>(
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      'read uploaded PDF',
      { allowNotFound: true },
    );
    if (!response) throw new BadRequestException('Uploaded PDF was not found. Upload it again.');
    const document = await response.Body?.transformToByteArray();
    if (!document || document.length !== expectedSizeBytes) {
      throw new BadRequestException('Uploaded PDF metadata does not match the selected file');
    }
    if (new TextDecoder().decode(document.subarray(0, 5)) !== '%PDF-') {
      throw new BadRequestException('The uploaded file is not a valid PDF');
    }
    return countPdfPages(document);
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
    await this.s3(new CopyObjectCommand({
      Bucket: this.bucket,
      CopySource: `${this.bucket}/${sourceKey.split('/').map(encodeURIComponent).join('/')}`,
      Key: destinationKey,
      ContentType: 'application/pdf',
      MetadataDirective: 'REPLACE',
    }), 'copy catalogue PDF');
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
    await this.s3(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }), 'delete PDF', { allowNotFound: true });
  }
}

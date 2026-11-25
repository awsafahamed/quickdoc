import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class PrivateObjectStorageService {
  private client: S3Client | null = null;

  constructor(private readonly config: ConfigService) {}

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

  async createUploadUrl(objectKey: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: 'application/pdf',
    });
    return getSignedUrl(this.getClient(), command, { expiresIn: 300 });
  }

  async verifyPdfUpload(objectKey: string, expectedSizeBytes: number): Promise<void> {
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

  async createPreviewUrl(objectKey: string, fileName: string): Promise<string> {
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

  async deleteObject(objectKey: string): Promise<void> {
    await this.getClient().send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }));
  }
}

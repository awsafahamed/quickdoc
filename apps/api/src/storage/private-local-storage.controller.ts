import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PrivateObjectStorageService } from './private-object-storage.service';

@Controller('storage/local')
export class PrivateLocalStorageController {
  constructor(private readonly storage: PrivateObjectStorageService) {}

  @Put(':token')
  async upload(
    @Param('token') token: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const body: unknown = request.body;
    if (!Buffer.isBuffer(body)) {
      throw new BadRequestException('PDF upload body is missing');
    }
    await this.storage.writeLocalUpload(token, request.get('content-type'), body);
    response.status(204).end();
  }

  @Get(':token')
  async preview(
    @Param('token') token: string,
    @Res() response: Response,
  ): Promise<void> {
    const document = await this.storage.readLocalPreview(token);
    const safeFileName = encodeURIComponent(document.fileName).replace(/[!'()*]/g, (character) => (
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    ));
    response
      .setHeader('Content-Type', 'application/pdf')
      .setHeader('Content-Disposition', `inline; filename*=UTF-8''${safeFileName}`)
      .setHeader('Cache-Control', 'private, no-store')
      .status(200)
      .send(document.body);
  }
}

/** Receives browser uploads for every storage backend and stores them privately. */
@Controller('storage/upload')
export class PrivateUploadController {
  constructor(private readonly storage: PrivateObjectStorageService) {}

  @Put(':token')
  async upload(
    @Param('token') token: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const body: unknown = request.body;
    if (!Buffer.isBuffer(body)) {
      throw new BadRequestException('PDF upload body is missing or larger than 25 MB');
    }
    await this.storage.writeUpload(token, request.get('content-type'), body);
    response.status(204).end();
  }
}

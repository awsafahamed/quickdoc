import { Body, Controller, Get, Post } from '@nestjs/common';
import { AttestationQuoteDto } from './attestation-quote.dto';
import { AttestationCatalogService } from './attestation-catalog.service';

@Controller('attestation')
export class AttestationController {
  constructor(private readonly catalogue: AttestationCatalogService) {}

  @Get('services')
  async listServices() {
    return { data: await this.catalogue.list() };
  }

  @Post('quote')
  async createQuote(@Body() request: AttestationQuoteDto) {
    return {
      data: await this.catalogue.quote(request.serviceId, request.pickupDistanceKm, request.returnDistanceKm, request.express),
    };
  }
}

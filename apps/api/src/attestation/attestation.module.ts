import { Module } from '@nestjs/common';
import { AttestationCatalogService } from './attestation-catalog.service';
import { AttestationController } from './attestation.controller';

@Module({
  controllers: [AttestationController],
  providers: [AttestationCatalogService],
})
export class AttestationModule {}

import { Module } from '@nestjs/common';
import { PrivateObjectStorageService } from './private-object-storage.service';
import { PrivateLocalStorageController } from './private-local-storage.controller';

@Module({
  controllers: [PrivateLocalStorageController],
  providers: [PrivateObjectStorageService],
  exports: [PrivateObjectStorageService],
})
export class StorageModule {}

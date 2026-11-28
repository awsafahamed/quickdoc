import { Module } from '@nestjs/common';
import { PrivateObjectStorageService } from './private-object-storage.service';
import { PrivateLocalStorageController, PrivateUploadController } from './private-local-storage.controller';

@Module({
  controllers: [PrivateLocalStorageController, PrivateUploadController],
  providers: [PrivateObjectStorageService],
  exports: [PrivateObjectStorageService],
})
export class StorageModule {}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalStorageProvider } from './providers/local-storage.provider';
import { S3StorageProvider } from './providers/s3-storage.provider';
import { IStorageProvider, UploadFileOptions, UploadResult } from './interfaces/storage-provider.interface';

@Injectable()
export class StorageService implements IStorageProvider {
  readonly providerName: string;
  private readonly logger = new Logger(StorageService.name);
  private readonly activeProvider: IStorageProvider;

  constructor(
    private readonly config: ConfigService,
    private readonly localProvider: LocalStorageProvider,
    private readonly s3Provider: S3StorageProvider,
  ) {
    const driver = this.config.get<string>('STORAGE_DRIVER') || 'local';
    if (driver === 's3' && s3Provider.isConfigured()) {
      this.activeProvider = this.s3Provider;
      this.providerName = 's3';
    } else {
      this.activeProvider = this.localProvider;
      this.providerName = 'local';
    }
    this.logger.log(`[StorageService] Active storage provider: ${this.providerName}`);
  }

  async uploadFile(options: UploadFileOptions): Promise<UploadResult> {
    return this.activeProvider.uploadFile(options);
  }

  async deleteFile(key: string): Promise<boolean> {
    return this.activeProvider.deleteFile(key);
  }

  async getFileUrl(key: string): Promise<string> {
    return this.activeProvider.getFileUrl(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.activeProvider.exists(key);
  }
}

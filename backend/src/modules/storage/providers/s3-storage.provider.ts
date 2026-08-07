import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IStorageProvider, UploadFileOptions, UploadResult } from '../interfaces/storage-provider.interface';

@Injectable()
export class S3StorageProvider implements IStorageProvider {
  readonly providerName = 's3';
  private readonly logger = new Logger(S3StorageProvider.name);
  private readonly bucket: string;
  private readonly region: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('AWS_S3_BUCKET') || '';
    this.region = this.config.get<string>('AWS_S3_REGION') || 'us-east-1';
  }

  isConfigured(): boolean {
    return !!(this.bucket && this.config.get<string>('AWS_ACCESS_KEY_ID'));
  }

  async uploadFile(options: UploadFileOptions): Promise<UploadResult> {
    if (!this.isConfigured()) {
      throw new Error('[S3StorageProvider] S3 credentials or bucket name not configured');
    }
    const key = options.folder ? `${options.folder}/${options.filename}` : options.filename;
    const url = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

    this.logger.log(`[S3Storage] Mocked upload for key=${key} to ${url}`);
    return {
      url,
      key,
      sizeBytes: options.buffer.length,
      provider: this.providerName,
    };
  }

  async deleteFile(key: string): Promise<boolean> {
    this.logger.log(`[S3Storage] File deleted: key=${key}`);
    return true;
  }

  async getFileUrl(key: string): Promise<string> {
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  async exists(key: string): Promise<boolean> {
    return true;
  }
}
